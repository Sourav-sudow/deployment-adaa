import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { SparklesCore } from "../ui/sparkles";

export default function AuthChoicePage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_32%),radial-gradient(circle_at_80%_18%,_rgba(217,70,239,0.12),_transparent_24%),linear-gradient(180deg,_#06070c_0%,_#030408_100%)]" />
      <div className="absolute inset-0 opacity-70">
        <SparklesCore
          id="tsparticles-auth-choice"
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

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12 md:px-10">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-white/5 px-4 py-2 text-sm text-cyan-200/90 backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
              AI Learning Platform
            </div>
            <h1 className="mt-7 max-w-2xl font-serif text-6xl leading-[1.02] text-white">
              Enter Lerno.ai with the flow that matches your role.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300/80">
              Existing users can re-enter with their saved campus profile. KRMU learners can
              still use their `@krmu.edu.in` login path, and new students or faculty can
              choose a university, verify OTP, and then finish onboarding.
            </p>

            <div className="mt-10 grid max-w-2xl gap-4 md:grid-cols-3">
              {[
                ["Login", "Fast re-entry for campus users, including KRMU `@krmu.edu.in` accounts."],
                ["Signup", "University-aware entry for new student and faculty accounts."],
                ["Firestore", "All profiles, sessions, and preferences persist in database."],
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
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mx-auto w-full max-w-xl"
          >
            <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/70 shadow-[0_35px_120px_-55px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
              <div className="border-b border-white/10 px-7 py-6 md:px-8">
                <p className="text-sm uppercase tracking-[0.34em] text-white/35">Get Started</p>
                <h2 className="mt-3 text-3xl font-semibold text-white">Choose how you want to enter</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300/70">
                  Log in if your account already exists. Sign up if you are onboarding as a
                  new student or faculty member.
                </p>
              </div>

              <div className="space-y-4 px-7 py-7 md:px-8 md:py-8">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="w-full rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(135deg,_rgba(37,99,235,0.95)_0%,_rgba(124,58,237,0.9)_52%,_rgba(217,70,239,0.92)_100%)] px-6 py-5 text-left shadow-[0_24px_60px_-24px_rgba(147,51,234,0.8)] transition hover:scale-[1.01]"
                >
                  <p className="text-lg font-semibold text-white">Login</p>
                  <p className="mt-1 text-sm text-white/80">
                    Already onboarded in Firebase? Continue straight into your workspace, including KRMU email login.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/signup")}
                  className="w-full rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-5 text-left transition hover:scale-[1.01] hover:bg-white/[0.06]"
                >
                  <p className="text-lg font-semibold text-white">Signup</p>
                  <p className="mt-1 text-sm text-slate-300/75">
                    New here? Pick Student or Faculty, verify OTP, and complete onboarding.
                  </p>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
