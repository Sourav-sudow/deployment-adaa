import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { SparklesCore } from "../ui/sparkles";
import {
  clearCachedSession,
  clearPendingSignupContext,
  fetchSession,
  getCachedSession,
  getDefaultRouteForSession,
  getPendingSignupContext,
  setPendingSignupContext,
  verifyOtpAndBootstrap,
  type UserRole,
} from "../services/appSession";
import { API_BASE_URL } from "../services/apiBaseUrl";
import {
  getCampusSelectionSummary,
  getDepartmentsForUniversity,
  getProgramsForDepartment,
  getTermsForProgram,
  getUniversityDomainMatch,
  getUniversityRegistry,
} from "../services/campusData";

const OTP_LENGTH = 6;

type OtpResponse = {
  success?: boolean;
  message?: string;
  email_sent?: boolean;
  expires_in?: number;
  debug_otp?: string;
};

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  if (name.length <= 4) return `${name[0] ?? ""}***@${domain}`;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 4, 2))}${name.slice(-2)}@${domain}`;
}

async function parseError(response: Response) {
  try {
    const data = await response.json();
    return data?.detail || data?.message || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

type LoginPageProps = {
  mode?: "login" | "signup";
};

export default function LoginPage({ mode = "login" }: LoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingContext = useMemo(() => getPendingSignupContext(), []);
  const universities = useMemo(() => getUniversityRegistry(), []);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryReferral = searchParams.get("ref") || "";
  const queryUniversity = searchParams.get("university") || "";

  const [email, setEmail] = useState(pendingContext?.email || "");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [selectedRole, setSelectedRole] = useState<UserRole>(pendingContext?.role || "student");
  const [selectedUniversityId, setSelectedUniversityId] = useState(
    pendingContext?.universityId || queryUniversity || universities[0]?.id || ""
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(
    pendingContext?.departmentId || ""
  );
  const [selectedProgramId, setSelectedProgramId] = useState(
    pendingContext?.programId || ""
  );
  const [selectedTermId, setSelectedTermId] = useState(pendingContext?.termId || "");
  const [referralCode, setReferralCode] = useState(
    pendingContext?.referredByCode || queryReferral || ""
  );
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [debugOtp, setDebugOtp] = useState("");

  const maskedEmail = useMemo(() => maskEmail(email), [email]);
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
    const session = getCachedSession();
    if (session?.isAuthenticated) {
      navigate(getDefaultRouteForSession(session), { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (mode === "login") {
      clearPendingSignupContext();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "signup") return;
    if (queryReferral) {
      setReferralCode(queryReferral.toUpperCase());
    }
    if (queryUniversity) {
      setSelectedUniversityId(queryUniversity);
    }
  }, [mode, queryReferral, queryUniversity]);

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

  useEffect(() => {
    if (step !== "otp" || resendCountdown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, resendCountdown]);

  const isValidEmail = (value: string) =>
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i.test(value.trim());
  const isKrmuEmail = (value: string) => /@krmu\.edu\.in$/i.test(value.trim());

  const persistPendingContext = (normalizedEmail: string) => {
    setPendingSignupContext({
      email: normalizedEmail,
      role: selectedRole,
      universityId: selectedUniversityId,
      universitySlug: selectionSummary.universitySlug,
      departmentId: selectedDepartmentId,
      programId: selectedProgramId,
      termId: selectedTermId,
      departmentName: selectionSummary.departmentName,
      programName: selectionSummary.programName,
      termName: selectionSummary.termName,
      referredByCode: referralCode.trim(),
      verificationStatus: getUniversityDomainMatch(normalizedEmail, selectedUniversityId)
        ? "trusted_domain"
        : "otp_verified",
    });
  };

  const handleSendOtp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setDebugOtp("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (mode === "signup" && (!selectedUniversityId || !selectedDepartmentId || !selectedProgramId || !selectedTermId)) {
      setError("Please choose your university, department family, program, and term.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const session = await fetchSession(normalizedEmail);

        if (!session.exists) {
          clearCachedSession();
          setError("No account found for this email. Please sign up first.");
          return;
        }

        if (!session.isOnboarded) {
          persistPendingContext(normalizedEmail);
          setInfo("Please complete your onboarding to continue.");
          navigate("/onboarding", { replace: true });
          return;
        }

        clearPendingSignupContext();
        navigate(getDefaultRouteForSession(session), { replace: true });
        return;
      }

      persistPendingContext(normalizedEmail);

      const response = await fetch(`${API_BASE_URL}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          mode,
          role: selectedRole,
          universityId: selectedUniversityId,
          universitySlug: selectionSummary.universitySlug,
          departmentId: selectedDepartmentId,
          programId: selectedProgramId,
          termId: selectedTermId,
          referredByCode: referralCode.trim(),
          otpChannel: "email",
        }),
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const data = (await response.json()) as OtpResponse;
      setEmail(normalizedEmail);
      setStep("otp");
      setOtp("");
      setInfo(
        data.email_sent
          ? "OTP sent to your inbox."
          : data.message || "OTP generated in demo mode."
      );
      setDebugOtp(data.debug_otp || "");
      setResendCountdown(30);
    } catch (err) {
      setError((err as Error).message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (otp.trim().length !== OTP_LENGTH) {
      setError("Please enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    try {
      const data = await verifyOtpAndBootstrap({
        email,
        otp: otp.trim(),
        mode,
        role: selectedRole,
        universityId: selectedUniversityId,
        universitySlug: selectionSummary.universitySlug,
        departmentId: selectedDepartmentId,
        programId: selectedProgramId,
        termId: selectedTermId,
        referredByCode: referralCode.trim(),
        otpChannel: "email",
      });
      if (mode === "login") {
        if (!data.session.exists) {
          clearCachedSession();
          setStep("email");
          setOtp("");
          setError("Account not found. Please use Signup first.");
          return;
        }

        if (!data.session.isOnboarded) {
          persistPendingContext(email);
          setInfo("Please complete your onboarding to continue.");
          navigate("/onboarding", { replace: true });
          return;
        }

        clearPendingSignupContext();
        navigate(getDefaultRouteForSession(data.session), { replace: true });
        return;
      }

      if (data.session.exists && data.session.isOnboarded) {
        clearCachedSession();
        setStep("email");
        setOtp("");
        setError("Account already exists. Please login instead.");
        return;
      }

      persistPendingContext(email);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError((err as Error).message || "Failed to verify OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0 || loading) return;
    setInfo("");
    setError("");
    setDebugOtp("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          mode,
          role: selectedRole,
          universityId: selectedUniversityId,
          universitySlug: selectionSummary.universitySlug,
          departmentId: selectedDepartmentId,
          programId: selectedProgramId,
          termId: selectedTermId,
          referredByCode: referralCode.trim(),
          otpChannel: "email",
        }),
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const data = (await response.json()) as OtpResponse;
      setInfo(
        data.email_sent
          ? "A fresh OTP has been sent."
          : data.message || "A fresh demo OTP has been generated."
      );
      setDebugOtp(data.debug_otp || "");
      setResendCountdown(30);
    } catch (err) {
      setError((err as Error).message || "Failed to resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    if (mode === "signup") {
      clearPendingSignupContext();
    }
    setStep("email");
    setOtp("");
    setError("");
    setInfo("");
    setDebugOtp("");
    setResendCountdown(0);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_32%),radial-gradient(circle_at_80%_18%,_rgba(217,70,239,0.12),_transparent_24%),linear-gradient(180deg,_#06070c_0%,_#030408_100%)]" />
      <div className="absolute inset-0 opacity-70">
        <SparklesCore
          id="tsparticles-login"
          background="transparent"
          minSize={0.5}
          maxSize={1.4}
          particleDensity={85}
          className="h-full w-full"
          particleColor="#f8fafc"
        />
      </div>
      <div className="pointer-events-none absolute left-[-10%] top-[14%] h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-8%] top-[50%] h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 py-10 md:px-10">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55 }}
            className="hidden lg:block"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-white/5 px-4 py-2 text-sm text-cyan-200/90 backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
              Pilot-Ready Campus Access
            </div>
            <h1 className="mt-7 max-w-xl font-serif text-6xl leading-[1.05] text-white">
              {mode === "login"
                ? "Log into your campus workspace without losing the KRMU login path."
                : "Create a multi-campus learner profile in one guided flow."}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300/80">
              {mode === "login"
                ? "Existing students and faculty can re-enter directly. KRMU users can still continue with their `@krmu.edu.in` email."
                : "Choose your university, department family, program, and term before OTP so Lerno can route you into the right pilot content pack."}
            </p>

            <div className="mt-10 grid max-w-2xl gap-4 md:grid-cols-3">
              {[
                ["Multi-University", "The same auth flow now works for multiple campuses, not just one domain."],
                [
                  mode === "login" ? "KRMU Direct Login" : "OTP Verification",
                  mode === "login"
                    ? "Returning `@krmu.edu.in` users still get the old direct campus-style re-entry."
                    : "Signup context is captured before OTP so onboarding stays structured.",
                ],
                ["Pilot Packs", "Starter content is ready for CS, Management, and Commerce families."],
              ].map(([title, copy]) => (
                <div
                  key={title}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">
                    {title}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-300/75">{copy}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mx-auto w-full max-w-xl"
          >
            <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/70 shadow-[0_35px_120px_-55px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
              <div className="border-b border-white/10 px-7 py-6 md:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.34em] text-white/35">Lerno.ai</p>
                    <h2 className="mt-3 text-3xl font-semibold text-white">
                      {step === "email"
                        ? mode === "login"
                          ? "Welcome back"
                          : "Create your pilot account"
                        : "Verify OTP"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300/70">
                      {step === "email"
                        ? mode === "login"
                          ? "Enter the email tied to your Lerno account."
                          : "Select your campus context, then verify OTP to unlock onboarding."
                        : `Enter the 6-digit code sent to ${maskedEmail}.`}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right text-xs text-white/55">
                    <p>Step</p>
                    <p className="mt-1 text-base font-semibold text-white">
                      {step === "email" ? "01 / 02" : "02 / 02"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 px-7 py-7 md:px-8 md:py-8">
                {step === "email" ? (
                  <form onSubmit={handleSendOtp} className="space-y-6">
                    {mode === "signup" ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(["student", "faculty"] as UserRole[]).map((role) => {
                            const active = selectedRole === role;
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => setSelectedRole(role)}
                                className={`rounded-3xl border px-4 py-4 text-left transition ${
                                  active
                                    ? "border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]"
                                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                                }`}
                              >
                                <p className="text-base font-semibold capitalize text-white">{role}</p>
                                <p className="mt-1 text-sm text-slate-300/70">
                                  {role === "student"
                                    ? "Campus-scoped learner workspace with AI study tools."
                                    : "Faculty workspace for pilot content quality and topic video control."}
                                </p>
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <select
                            value={selectedUniversityId}
                            onChange={(e) => {
                              setSelectedUniversityId(e.target.value);
                              setSelectedDepartmentId("");
                              setSelectedProgramId("");
                              setSelectedTermId("");
                            }}
                            className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none"
                          >
                            {universities.map((university) => (
                              <option key={university.id} value={university.id} className="bg-slate-950">
                                {university.name}
                              </option>
                            ))}
                          </select>

                          <select
                            value={selectedDepartmentId}
                            onChange={(e) => {
                              setSelectedDepartmentId(e.target.value);
                              setSelectedProgramId("");
                              setSelectedTermId("");
                            }}
                            className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none"
                          >
                            {departments.map((department) => (
                              <option key={department.id} value={department.id} className="bg-slate-950">
                                {department.name}
                              </option>
                            ))}
                          </select>

                          <select
                            value={selectedProgramId}
                            onChange={(e) => {
                              setSelectedProgramId(e.target.value);
                              setSelectedTermId("");
                            }}
                            className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none"
                          >
                            {programs.map((program) => (
                              <option key={program.id} value={program.id} className="bg-slate-950">
                                {program.name}
                              </option>
                            ))}
                          </select>

                          <select
                            value={selectedTermId}
                            onChange={(e) => setSelectedTermId(e.target.value)}
                            className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none"
                          >
                            {terms.map((term) => (
                              <option key={term.id} value={term.id} className="bg-slate-950">
                                {term.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="rounded-3xl border border-cyan-400/15 bg-cyan-400/5 px-4 py-4 text-sm text-cyan-100/85">
                          <span className="font-semibold">{selectionSummary.universityName || "Campus not selected"}</span>
                          {" · "}
                          {selectionSummary.departmentName || "Department family"}
                          {" · "}
                          {selectionSummary.programName || "Program"}
                          {" · "}
                        {selectionSummary.termName || "Term"}
                        </div>
                      </>
                    ) : null}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">
                        {mode === "login" ? "Account Email" : "Email for OTP"}
                      </label>
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-2 focus-within:border-cyan-400/60 focus-within:shadow-[0_0_0_1px_rgba(34,211,238,0.3)]">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={mode === "login" ? "2301201171@krmu.edu.in" : "you@college.edu"}
                          className="w-full rounded-[20px] bg-transparent px-4 py-4 text-lg text-white outline-none placeholder:text-slate-500"
                          autoComplete="email"
                          required
                        />
                      </div>
                      {mode === "login" ? (
                        <p className="mt-2 text-xs text-slate-400">
                          KRMU users can still log in with their `@krmu.edu.in` email here. Other pilot campuses can use their saved account email too.
                        </p>
                      ) : null}
                      {mode === "login" && isKrmuEmail(email) ? (
                        <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                          KRMU direct login path active for this email.
                        </div>
                      ) : null}
                    </div>

                    {mode === "signup" ? (
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-300">
                          Referral Code (Optional)
                        </label>
                        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-2">
                          <input
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                            placeholder="Friend or ambassador referral code"
                            className="w-full rounded-[20px] bg-transparent px-4 py-4 text-lg text-white outline-none placeholder:text-slate-500"
                          />
                        </div>
                      </div>
                    ) : null}

                    {error ? (
                      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {error}
                      </div>
                    ) : null}

                    {info ? (
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                        {info}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-3xl bg-[linear-gradient(135deg,_#2563eb_0%,_#7c3aed_55%,_#d946ef_100%)] px-5 py-4 text-lg font-semibold text-white shadow-[0_24px_60px_-24px_rgba(147,51,234,0.8)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading
                        ? mode === "login"
                          ? "Checking account..."
                          : "Sending OTP..."
                        : mode === "login"
                          ? "Continue to Workspace"
                          : `Send OTP for ${selectedRole === "faculty" ? "Faculty" : "Student"} Signup`}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-6">
                    <div className="rounded-3xl border border-cyan-400/15 bg-cyan-400/5 p-4 text-sm text-cyan-100/90">
                      Verification code sent to <span className="font-semibold">{maskedEmail}</span>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">
                        Enter OTP
                      </label>
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-2 focus-within:border-cyan-400/60 focus-within:shadow-[0_0_0_1px_rgba(34,211,238,0.3)]">
                        <input
                          type="text"
                          value={otp}
                          onChange={(e) =>
                            setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
                          }
                          inputMode="numeric"
                          maxLength={OTP_LENGTH}
                          placeholder="000000"
                          className="w-full rounded-[20px] bg-transparent px-4 py-4 text-center text-3xl font-semibold tracking-[0.55em] text-white outline-none placeholder:text-slate-600"
                          autoFocus
                          required
                        />
                      </div>
                    </div>

                    {error ? (
                      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {error}
                      </div>
                    ) : null}

                    {info ? (
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                        {info}
                      </div>
                    ) : null}

                    {debugOtp ? (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        Dev mode OTP: <span className="font-semibold tracking-[0.2em]">{debugOtp}</span>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300/70">
                      <button
                        type="button"
                        onClick={handleBackToEmail}
                        className="rounded-full border border-white/10 px-4 py-2 transition hover:bg-white/5 hover:text-white"
                      >
                        Change Email
                      </button>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCountdown > 0 || loading}
                        className="rounded-full border border-white/10 px-4 py-2 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend OTP"}
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-3xl bg-[linear-gradient(135deg,_#0ea5e9_0%,_#8b5cf6_58%,_#ec4899_100%)] px-5 py-4 text-lg font-semibold text-white shadow-[0_24px_60px_-24px_rgba(14,165,233,0.8)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading
                        ? "Verifying..."
                        : mode === "login"
                          ? "Verify & Continue"
                          : "Verify & Continue Signup"}
                    </button>
                  </form>
                )}
              </div>

              <div className="border-t border-white/10 px-7 py-4 text-xs text-slate-400 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>
                    {mode === "login"
                      ? "KRMU email login and pilot-campus login both stay supported."
                      : "Signup currently supports starter packs for CS / Engineering, Management, and Commerce."}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(mode === "login" ? "/signup" : "/login")}
                    className="text-cyan-300 transition hover:text-cyan-200"
                  >
                    {mode === "login"
                      ? "New user? Go to Signup"
                      : "Already have an account? Login"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
