import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchSession,
  getCachedSession,
  getDefaultRouteForSession,
  updateProfile,
  type UserRole,
} from "../services/appSession";
import {
  getCampusSelectionSummary,
  getDepartmentsForUniversity,
  getProgramsForDepartment,
  getTermsForProgram,
  getUniversityRegistry,
} from "../services/campusData";

const THEME_STORAGE_KEY = "lernoTheme";
const DEFAULT_AVATAR = "https://i.pravatar.cc/240?img=64";

function readTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const session = useMemo(() => getCachedSession(), []);
  const universities = useMemo(() => getUniversityRegistry(), []);
  const theme = readTheme();
  const isDarkTheme = theme === "dark";

  const [name, setName] = useState(session?.profile?.fullName || "Lerno User");
  const [phone, setPhone] = useState(session?.profile?.phone || "");
  const [avatar, setAvatar] = useState(session?.profile?.avatar || DEFAULT_AVATAR);
  const [year, setYear] = useState(session?.profile?.year || "");
  const [designation, setDesignation] = useState(session?.profile?.designation || "");
  const [selectedUniversityId, setSelectedUniversityId] = useState(
    session?.profile?.universityId || session?.universityId || universities[0]?.id || ""
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(
    session?.profile?.departmentId || session?.departmentId || ""
  );
  const [selectedProgramId, setSelectedProgramId] = useState(
    session?.profile?.programId || session?.programId || ""
  );
  const [selectedTermId, setSelectedTermId] = useState(
    session?.profile?.termId || session?.termId || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const profile = session?.profile;
  const email = session?.email || localStorage.getItem("userEmail") || "";
  const role = (profile?.role || session?.role || "student") as UserRole;
  const departments = useMemo(
    () => getDepartmentsForUniversity(selectedUniversityId),
    [selectedUniversityId]
  );
  const programs = useMemo(
    () => getProgramsForDepartment(selectedUniversityId, selectedDepartmentId),
    [selectedDepartmentId, selectedUniversityId]
  );
  const terms = useMemo(
    () => getTermsForProgram(selectedUniversityId, selectedDepartmentId, selectedProgramId),
    [selectedDepartmentId, selectedProgramId, selectedUniversityId]
  );
  const selectionSummary = useMemo(
    () =>
      getCampusSelectionSummary({
        universityId: selectedUniversityId,
        departmentId: selectedDepartmentId,
        programId: selectedProgramId,
        termId: selectedTermId,
      }),
    [selectedDepartmentId, selectedProgramId, selectedTermId, selectedUniversityId]
  );

  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "L";
  }, [name]);

  useEffect(() => {
    if (!session?.isAuthenticated || !email) {
      navigate("/login", { replace: true });
      return;
    }

    const loadProfile = async () => {
      try {
        const nextSession = await fetchSession(email);
        const nextProfile = nextSession.profile;
        if (!nextProfile) return;
        setName(nextProfile.fullName || "Lerno User");
        setPhone(nextProfile.phone || "");
        setAvatar(nextProfile.avatar || DEFAULT_AVATAR);
        setYear(nextProfile.year || "");
        setDesignation(nextProfile.designation || "");
        setSelectedUniversityId(nextProfile.universityId || universities[0]?.id || "");
        setSelectedDepartmentId(nextProfile.departmentId || "");
        setSelectedProgramId(nextProfile.programId || "");
        setSelectedTermId(nextProfile.termId || "");
      } catch (err) {
        setError((err as Error).message || "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [email, navigate, session, universities]);

  useEffect(() => {
    if (!selectedDepartmentId && departments[0]?.id) {
      setSelectedDepartmentId(departments[0].id);
    }
  }, [departments, selectedDepartmentId]);

  useEffect(() => {
    if (!selectedProgramId && programs[0]?.id) {
      setSelectedProgramId(programs[0].id);
    }
  }, [programs, selectedProgramId]);

  useEffect(() => {
    if (!selectedTermId && terms[0]?.id) {
      setSelectedTermId(terms[0].id);
    }
  }, [selectedTermId, terms]);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setError("");
    setIsSaving(true);

    try {
      const nextSession = await updateProfile({
        email,
        fullName: name.trim() || "Lerno User",
        phone: phone.trim(),
        avatar: avatar || DEFAULT_AVATAR,
        course: selectionSummary.programName,
        year,
        semester: selectionSummary.termName,
        department: selectionSummary.departmentName,
        designation,
        universityId: selectedUniversityId,
        universitySlug: selectionSummary.universitySlug,
        departmentId: selectedDepartmentId,
        programId: selectedProgramId,
        termId: selectedTermId,
        verificationStatus:
          (session?.verificationStatus as string) ||
          (session?.profile?.verificationStatus as string) ||
          "otp_verified",
        referralCode: session?.referralCode || session?.profile?.referralCode,
        referredByCode: session?.profile?.referredByCode,
      });
      navigate(getDefaultRouteForSession(nextSession));
    } catch (err) {
      setError((err as Error).message || "Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const backTarget = role === "faculty" ? "/faculty" : "/learning";

  return (
    <div
      className={`min-h-screen w-full px-4 py-10 transition-colors duration-300 md:px-6 ${
        isDarkTheme
          ? "bg-black"
          : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(239,244,255,0.96),_rgba(232,239,252,0.98))]"
      }`}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(backTarget)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
              isDarkTheme
                ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                : "border-slate-300/70 bg-white/90 text-slate-700 hover:bg-white"
            }`}
          >
            <span>←</span>
            <span>Back</span>
          </button>
          <div
            className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.24em] ${
              isDarkTheme
                ? "border-white/10 bg-white/5 text-white/40"
                : "border-slate-300/70 bg-white/80 text-slate-500"
            }`}
          >
            My Profile
          </div>
        </div>

        <div
          className={`overflow-hidden rounded-[36px] border backdrop-blur-xl ${
            isDarkTheme
              ? "border-white/10 bg-zinc-950/80 shadow-[0_30px_120px_-60px_rgba(0,0,0,0.9)]"
              : "border-slate-300/70 bg-white/88 shadow-[0_24px_80px_-40px_rgba(148,163,184,0.45)]"
          }`}
        >
          <div
            className={`border-b px-6 py-8 md:px-10 ${
              isDarkTheme ? "border-white/10" : "border-slate-200"
            }`}
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p
                  className={`text-xs uppercase tracking-[0.28em] ${
                    isDarkTheme ? "text-white/40" : "text-slate-500"
                  }`}
                >
                  {role === "faculty" ? "Faculty Profile" : "Student Profile"}
                </p>
                <h1
                  className={`mt-2 text-3xl font-semibold ${
                    isDarkTheme ? "text-white" : "text-slate-900"
                  }`}
                >
                  Manage your account details
                </h1>
                <p
                  className={`mt-2 max-w-xl text-sm ${
                    isDarkTheme ? "text-white/55" : "text-slate-600"
                  }`}
                >
                  Update your campus-scoped profile without breaking your synced learning session.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt="Profile avatar"
                      className={`h-28 w-28 rounded-full object-cover ${
                        isDarkTheme
                          ? "border border-white/10 shadow-inner shadow-black/40"
                          : "border border-slate-200 shadow-[0_12px_35px_-20px_rgba(15,23,42,0.35)]"
                      }`}
                    />
                  ) : (
                    <div
                      className={`flex h-28 w-28 items-center justify-center rounded-full text-2xl font-semibold ${
                        isDarkTheme
                          ? "border border-white/10 bg-white/5 text-white"
                          : "border border-slate-200 bg-slate-100 text-slate-700"
                      }`}
                    >
                      {initials}
                    </div>
                  )}
                </div>

                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isDarkTheme
                      ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      : "border-slate-300/70 bg-white/90 text-slate-700 hover:bg-white"
                  }`}
                >
                  <span>Change photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-8 md:grid-cols-[1.2fr_0.8fr] md:px-10">
            <div
              className={`rounded-[28px] border p-6 ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.03]"
                  : "border-slate-200 bg-slate-50/85"
              }`}
            >
              {loading ? (
                <p className={isDarkTheme ? "text-white/55" : "text-slate-600"}>
                  Loading profile...
                </p>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className={`mb-2 block text-sm font-medium ${isDarkTheme ? "text-white/70" : "text-slate-700"}`}>
                      Full Name
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`w-full rounded-2xl border px-4 py-3 text-base outline-none transition ${
                        isDarkTheme
                          ? "border-white/10 bg-white/5 text-white"
                          : "border-slate-300 bg-white text-slate-900"
                      }`}
                      placeholder="Enter full name"
                    />
                  </div>

                  <div>
                    <label className={`mb-2 block text-sm font-medium ${isDarkTheme ? "text-white/70" : "text-slate-700"}`}>
                      Phone Number
                    </label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                      className={`w-full rounded-2xl border px-4 py-3 text-base outline-none transition ${
                        isDarkTheme
                          ? "border-white/10 bg-white/5 text-white"
                          : "border-slate-300 bg-white text-slate-900"
                      }`}
                      placeholder="Enter 10-digit mobile number"
                    />
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className={`text-sm font-medium ${isDarkTheme ? "text-white/70" : "text-slate-700"}`}>
                        University
                      </span>
                      <select
                        value={selectedUniversityId}
                        onChange={(e) => {
                          setSelectedUniversityId(e.target.value);
                          setSelectedDepartmentId("");
                          setSelectedProgramId("");
                          setSelectedTermId("");
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                          isDarkTheme
                            ? "border-white/10 bg-white/5 text-white"
                            : "border-slate-300 bg-white text-slate-900"
                        }`}
                      >
                        {universities.map((university) => (
                          <option key={university.id} value={university.id}>
                            {university.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className={`text-sm font-medium ${isDarkTheme ? "text-white/70" : "text-slate-700"}`}>
                        Department Family
                      </span>
                      <select
                        value={selectedDepartmentId}
                        onChange={(e) => {
                          setSelectedDepartmentId(e.target.value);
                          setSelectedProgramId("");
                          setSelectedTermId("");
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                          isDarkTheme
                            ? "border-white/10 bg-white/5 text-white"
                            : "border-slate-300 bg-white text-slate-900"
                        }`}
                      >
                        {departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className={`text-sm font-medium ${isDarkTheme ? "text-white/70" : "text-slate-700"}`}>
                        Program
                      </span>
                      <select
                        value={selectedProgramId}
                        onChange={(e) => {
                          setSelectedProgramId(e.target.value);
                          setSelectedTermId("");
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                          isDarkTheme
                            ? "border-white/10 bg-white/5 text-white"
                            : "border-slate-300 bg-white text-slate-900"
                        }`}
                      >
                        {programs.map((program) => (
                          <option key={program.id} value={program.id}>
                            {program.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className={`text-sm font-medium ${isDarkTheme ? "text-white/70" : "text-slate-700"}`}>
                        Term
                      </span>
                      <select
                        value={selectedTermId}
                        onChange={(e) => setSelectedTermId(e.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                          isDarkTheme
                            ? "border-white/10 bg-white/5 text-white"
                            : "border-slate-300 bg-white text-slate-900"
                        }`}
                      >
                        {terms.map((term) => (
                          <option key={term.id} value={term.id}>
                            {term.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {role === "student" ? (
                    <div>
                      <label className={`mb-2 block text-sm font-medium ${isDarkTheme ? "text-white/70" : "text-slate-700"}`}>
                        Cohort / Year
                      </label>
                      <input
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                          isDarkTheme
                            ? "border-white/10 bg-white/5 text-white"
                            : "border-slate-300 bg-white text-slate-900"
                        }`}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className={`mb-2 block text-sm font-medium ${isDarkTheme ? "text-white/70" : "text-slate-700"}`}>
                        Designation
                      </label>
                      <input
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                          isDarkTheme
                            ? "border-white/10 bg-white/5 text-white"
                            : "border-slate-300 bg-white text-slate-900"
                        }`}
                      />
                    </div>
                  )}

                  {error ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkTheme
                          ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {error}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => navigate(backTarget)}
                      className={`rounded-2xl border px-5 py-3 text-sm font-medium transition ${
                        isDarkTheme
                          ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-2xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              className={`rounded-[28px] border p-6 ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.03]"
                  : "border-slate-200 bg-slate-50/85"
              }`}
            >
              <p className={`text-xs uppercase tracking-[0.24em] ${isDarkTheme ? "text-white/40" : "text-slate-500"}`}>
                Profile Details
              </p>
              <div className="mt-5 space-y-4">
                <div>
                  <p className={`text-sm ${isDarkTheme ? "text-white/50" : "text-slate-500"}`}>
                    Account Email
                  </p>
                  <p className={`mt-1 break-all text-sm font-medium ${isDarkTheme ? "text-white" : "text-slate-900"}`}>
                    {email}
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkTheme ? "text-white/50" : "text-slate-500"}`}>
                    Account Type
                  </p>
                  <p
                    className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                      role === "faculty"
                        ? isDarkTheme
                          ? "bg-violet-500/15 text-violet-300"
                          : "bg-violet-100 text-violet-700"
                        : isDarkTheme
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {role}
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkTheme ? "text-white/50" : "text-slate-500"}`}>
                    Campus Scope
                  </p>
                  <p className={`mt-1 text-sm font-medium ${isDarkTheme ? "text-white" : "text-slate-900"}`}>
                    {selectionSummary.universityName || "Campus not set"}
                  </p>
                  <p className={`mt-1 text-sm ${isDarkTheme ? "text-white/60" : "text-slate-600"}`}>
                    {selectionSummary.departmentName || "Department family"}
                    {" · "}
                    {selectionSummary.programName || "Program"}
                    {" · "}
                    {selectionSummary.termName || "Term"}
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${isDarkTheme ? "text-white/50" : "text-slate-500"}`}>
                    Firestore Sync
                  </p>
                  <p className={`mt-1 text-sm font-medium ${isDarkTheme ? "text-white" : "text-slate-900"}`}>
                    Your profile, learning state, and campus context are synced across sessions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
