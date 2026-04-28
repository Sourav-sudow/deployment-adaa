import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearPendingSignupContext,
  completeOnboarding,
  getCachedSession,
  getDefaultRouteForSession,
  getPendingSignupContext,
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

function readTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const session = useMemo(() => getCachedSession(), []);
  const pendingContext = useMemo(() => getPendingSignupContext(), []);
  const universities = useMemo(() => getUniversityRegistry(), []);
  const initialRole = session?.role || pendingContext?.role;
  const [role] = useState<UserRole>(initialRole || "student");
  const [fullName, setFullName] = useState(session?.profile?.fullName || "");
  const [phone, setPhone] = useState(session?.profile?.phone || "");
  const [year, setYear] = useState(session?.profile?.year || "");
  const [designation, setDesignation] = useState(session?.profile?.designation || "");
  const [selectedUniversityId, setSelectedUniversityId] = useState(
    session?.profile?.universityId ||
      session?.universityId ||
      pendingContext?.universityId ||
      universities[0]?.id ||
      ""
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(
    session?.profile?.departmentId || session?.departmentId || pendingContext?.departmentId || ""
  );
  const [selectedProgramId, setSelectedProgramId] = useState(
    session?.profile?.programId || session?.programId || pendingContext?.programId || ""
  );
  const [selectedTermId, setSelectedTermId] = useState(
    session?.profile?.termId || session?.termId || pendingContext?.termId || ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const theme = readTheme();
  const isDarkTheme = theme === "dark";

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

  useEffect(() => {
    if (!session?.isAuthenticated || !session.email) {
      navigate("/login", { replace: true });
      return;
    }

    if (session.isOnboarded) {
      navigate(getDefaultRouteForSession(session), { replace: true });
      return;
    }

    if (!initialRole) {
      navigate("/signup", { replace: true });
    }
  }, [initialRole, navigate, session]);

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

  const email = session?.email || localStorage.getItem("userEmail") || "";

  const handleSubmit = async () => {
    setError("");

    if (fullName.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (!selectedUniversityId || !selectedDepartmentId || !selectedProgramId || !selectedTermId) {
      setError("Please complete your university, department, program, and term selection.");
      return;
    }

    setLoading(true);
    try {
      const nextSession = await completeOnboarding({
        email,
        role,
        fullName,
        phone,
        course: selectionSummary.programName,
        year,
        semester: selectionSummary.termName,
        department: selectionSummary.departmentName,
        designation,
        avatar: session?.profile?.avatar,
        universityId: selectedUniversityId,
        universitySlug: selectionSummary.universitySlug,
        departmentId: selectedDepartmentId,
        programId: selectedProgramId,
        termId: selectedTermId,
        verificationStatus:
          (pendingContext?.verificationStatus as string) ||
          (session?.verificationStatus as string) ||
          "otp_verified",
        referralCode:
          pendingContext?.referralCode || session?.referralCode || session?.profile?.referralCode,
        referredByCode: pendingContext?.referredByCode || session?.profile?.referredByCode,
        otpChannel: "email",
      });

      clearPendingSignupContext();
      navigate(getDefaultRouteForSession(nextSession), { replace: true });
    } catch (err) {
      setError((err as Error).message || "Failed to complete onboarding.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen px-4 py-10 transition-colors duration-300 ${
        isDarkTheme
          ? "bg-black text-white"
          : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(238,243,255,0.96),_rgba(228,236,252,0.98))] text-slate-900"
      }`}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <p
            className={`text-xs uppercase tracking-[0.28em] ${
              isDarkTheme ? "text-white/45" : "text-slate-500"
            }`}
          >
            Welcome To Lerno.ai
          </p>
          <h1 className="mt-4 text-4xl font-semibold">Complete your onboarding</h1>
          <p
            className={`mt-4 text-base ${
              isDarkTheme ? "text-white/60" : "text-slate-600"
            }`}
          >
            Your campus, department family, program, and term will decide which pilot content pack
            and workspace you land in.
          </p>
        </div>

        <div
          className={`mx-auto mt-10 max-w-4xl rounded-[32px] border p-6 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur-xl md:p-8 ${
            isDarkTheme
              ? "border-white/10 bg-zinc-950/75"
              : "border-slate-300/70 bg-white/88"
          }`}
        >
          <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
            <div
              className={`rounded-[28px] border p-5 ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.03]"
                  : "border-slate-200 bg-slate-50/85"
              }`}
            >
              <p
                className={`text-xs uppercase tracking-[0.24em] ${
                  isDarkTheme ? "text-white/40" : "text-slate-500"
                }`}
              >
                Account Setup
              </p>
              <p className="mt-3 text-2xl font-semibold">{email}</p>
              <p
                className={`mt-3 text-sm leading-6 ${
                  isDarkTheme ? "text-white/55" : "text-slate-600"
                }`}
              >
                This account is signing up as a{" "}
                <span className="font-semibold capitalize">{role}</span>. We will use the campus
                context below to scope your learning data and content pack.
              </p>
              <div
                className={`mt-6 rounded-2xl border px-4 py-4 ${
                  isDarkTheme
                    ? "border-violet-400/25 bg-violet-500/10"
                    : "border-violet-200 bg-violet-50"
                }`}
              >
                <p className="text-base font-semibold capitalize">{role}</p>
                <p
                  className={`mt-1 text-sm ${
                    isDarkTheme ? "text-white/55" : "text-slate-600"
                  }`}
                >
                  {role === "student"
                    ? "Students get a campus-scoped learning workspace with recent topics, bookmarks, AI support, and exam planning."
                    : "Faculty get a pilot dashboard focused on content quality and student-facing video overrides."}
                </p>
              </div>
              <div
                className={`mt-5 rounded-2xl border px-4 py-4 ${
                  isDarkTheme
                    ? "border-cyan-400/20 bg-cyan-400/5"
                    : "border-cyan-200 bg-cyan-50"
                }`}
              >
                <p className="text-sm font-semibold">{selectionSummary.universityName || "Choose a campus"}</p>
                <p className={`mt-2 text-sm ${isDarkTheme ? "text-white/60" : "text-slate-600"}`}>
                  {selectionSummary.departmentName || "Department family"}
                  {" · "}
                  {selectionSummary.programName || "Program"}
                  {" · "}
                  {selectionSummary.termName || "Term"}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-sm font-medium ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>
                    Full Name
                  </span>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.03] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                    placeholder="Enter your full name"
                  />
                </label>

                <label className="space-y-2">
                  <span className={`text-sm font-medium ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>
                    Phone Number
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.03] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                    placeholder="10-digit mobile number"
                  />
                </label>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-sm font-medium ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>
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
                        ? "border-white/10 bg-white/[0.03] text-white"
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
                  <span className={`text-sm font-medium ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>
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
                        ? "border-white/10 bg-white/[0.03] text-white"
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
                  <span className={`text-sm font-medium ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>
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
                        ? "border-white/10 bg-white/[0.03] text-white"
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
                  <span className={`text-sm font-medium ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>
                    Term
                  </span>
                  <select
                    value={selectedTermId}
                    onChange={(e) => setSelectedTermId(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.03] text-white"
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
                <label className="space-y-2">
                  <span className={`text-sm font-medium ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>
                    Cohort / Year (Optional)
                  </span>
                  <input
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.03] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                    placeholder="2026 intake / 3rd year"
                  />
                </label>
              ) : (
                <label className="space-y-2">
                  <span className={`text-sm font-medium ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>
                    Designation
                  </span>
                  <input
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.03] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                    placeholder="Assistant Professor"
                  />
                </label>
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
                  onClick={() => {
                    clearPendingSignupContext();
                    navigate("/signup");
                  }}
                  className={`rounded-2xl border px-5 py-3 text-sm font-medium transition ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="rounded-2xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  {loading ? "Saving..." : "Complete Setup"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
