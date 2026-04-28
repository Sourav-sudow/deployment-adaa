import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchCampusContentPack } from "../services/campusContent";
import type { CampusContentPack } from "../services/campusData";
import { getCachedSession, getCampusSelectionFromSession } from "../services/appSession";
import { buildStudyPlan, type StudyPlan } from "../services/studyPlanner";

const THEME_STORAGE_KEY = "lernoTheme";
const COMPLETED_PRACTICE_STORAGE_KEY = "lernoCompletedPracticeTopics";

type RoutePlannerState = {
  subjectTitle?: string;
  topicTitle?: string;
  topicTitles?: string[];
};

type TopicMeta = {
  title: string;
  subjectTitle: string;
  unitTitle?: string;
};

function getDefaultExamDate() {
  const examDate = new Date();
  examDate.setDate(examDate.getDate() + 7);
  return examDate.toISOString().slice(0, 10);
}

function dedupeTopics(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export default function ExamWeekPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state || {}) as RoutePlannerState;
  const session = useMemo(() => getCachedSession(), []);
  const campusSelection = useMemo(
    () => getCampusSelectionFromSession(session),
    [session]
  );

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" ? "light" : "dark";
  });
  const [contentPack, setContentPack] = useState<CampusContentPack | null>(null);
  const [plannerExamDate, setPlannerExamDate] = useState(getDefaultExamDate);
  const [plannerDailyMinutes, setPlannerDailyMinutes] = useState(60);
  const [plannerConfidence, setPlannerConfidence] = useState<"low" | "medium" | "high">("medium");
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [studyPlanLoading, setStudyPlanLoading] = useState(false);
  const [studyPlanError, setStudyPlanError] = useState<string | null>(null);
  const [completedPracticeTopics] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COMPLETED_PRACTICE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    let active = true;

    fetchCampusContentPack(campusSelection)
      .then((pack) => {
        if (active) {
          setContentPack(pack);
        }
      })
      .catch(() => {
        if (active) {
          setContentPack(null);
        }
      });

    return () => {
      active = false;
    };
  }, [campusSelection]);

  const allTopics = useMemo<TopicMeta[]>(() => {
    if (!contentPack?.subjects?.length) return [];

    return contentPack.subjects.flatMap((subject) =>
      subject.topics.map((topic) => {
        const title = topic.title;
        const matchedUnit = subject.units.find((unit) =>
          unit.topics.some((unitTopic) => unitTopic.toLowerCase() === title.toLowerCase())
        );

        return {
          title,
          subjectTitle: subject.title,
          unitTitle: matchedUnit?.title,
        };
      })
    );
  }, [contentPack]);

  const currentSelection = session?.learningState.currentSelection || {};
  const selectedTopicTitle =
    routeState.topicTitle || currentSelection.title || localStorage.getItem("selectedTopicTitle") || "";
  const selectedSubjectTitle = routeState.subjectTitle || currentSelection.subjectTitle || "";

  const plannerTopicTitles = useMemo(() => {
    const routedTopics = dedupeTopics(routeState.topicTitles || []);
    if (routedTopics.length) return routedTopics;

    const subjectTopics = selectedSubjectTitle
      ? dedupeTopics(
          allTopics
            .filter((topic) => topic.subjectTitle === selectedSubjectTitle)
            .map((topic) => topic.title)
        )
      : [];

    if (subjectTopics.length) return subjectTopics.slice(0, 8);
    if (selectedTopicTitle) return [selectedTopicTitle];

    return dedupeTopics(allTopics.slice(0, 8).map((topic) => topic.title));
  }, [allTopics, routeState.topicTitles, selectedSubjectTitle, selectedTopicTitle]);

  const resolvedSubjectTitle =
    selectedSubjectTitle ||
    allTopics.find((topic) => topic.title.toLowerCase() === selectedTopicTitle.toLowerCase())
      ?.subjectTitle ||
    contentPack?.subjects?.[0]?.title ||
    "Current subject";

  const plannerIsExamWeek = (studyPlan?.daysUntilExam ?? 99) <= 7;
  const isDarkTheme = theme === "dark";
  const textPrimary = isDarkTheme ? "text-white" : "text-slate-900";
  const textSecondary = isDarkTheme ? "text-white/70" : "text-slate-600";
  const textMuted = isDarkTheme ? "text-white/45" : "text-slate-500";
  const surfaceClass = isDarkTheme
    ? "border-white/10 bg-zinc-950/70"
    : "border-slate-300/70 bg-white/90";

  const handleGenerateStudyPlan = async () => {
    if (!plannerExamDate) {
      setStudyPlanError("Please choose your exam date.");
      return;
    }

    if (!plannerTopicTitles.length) {
      setStudyPlanError("Open a lesson first so we know what to plan.");
      return;
    }

    setStudyPlanLoading(true);
    setStudyPlanError(null);
    try {
      const result = await buildStudyPlan({
        email: session?.email,
        universityId: campusSelection.universityId,
        universitySlug: campusSelection.universitySlug,
        departmentId: campusSelection.departmentId,
        programId: campusSelection.programId,
        termId: campusSelection.termId,
        subjectTitle: resolvedSubjectTitle,
        topicTitles: plannerTopicTitles,
        completedPracticeTopics,
        examDate: plannerExamDate,
        dailyMinutes: plannerDailyMinutes,
        confidenceLevel: plannerConfidence,
      });

      setStudyPlan(result.plan);
    } catch (error) {
      setStudyPlanError(
        (error as Error)?.message || "Failed to build your study plan."
      );
    } finally {
      setStudyPlanLoading(false);
    }
  };

  const openTopicInLearning = (topic: string) => {
    navigate(`/learning?topic=${encodeURIComponent(topic)}`);
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkTheme
          ? "bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(217,70,239,0.14),transparent_24%),#020308]"
          : "bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(217,70,239,0.12),transparent_24%),#f6f8fc]"
      }`}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-10 pt-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/learning")}
            className={`flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-medium shadow-[0_20px_60px_-25px_rgba(0,0,0,0.35)] backdrop-blur-xl ${surfaceClass}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Back to Learning
          </motion.button>

          <div className="flex items-center gap-3">
            <div
              className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.22em] ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.04] text-white/55"
                  : "border-slate-300 bg-white text-slate-500"
              }`}
            >
              Exam Week Mode
            </div>
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_20px_60px_-25px_rgba(0,0,0,0.25)] backdrop-blur-xl ${
                isDarkTheme
                  ? "border-white/10 bg-white/5 text-amber-200"
                  : "border-slate-300/80 bg-white text-slate-700"
              }`}
              aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkTheme ? "☀" : "☾"}
            </button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className={`mt-8 overflow-hidden rounded-[34px] border p-6 md:p-8 ${surfaceClass}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`text-xs uppercase tracking-[0.28em] ${textMuted}`}>
                Exam Week Mode
              </p>
              <h1 className={`mt-3 text-3xl font-semibold md:text-4xl ${textPrimary}`}>
                Personalized Study Planner
              </h1>
              <p className={`mt-3 max-w-2xl text-sm md:text-base ${textSecondary}`}>
                Opened from your learning workspace so you can lock in a day-wise revision
                plan without losing context.
              </p>
            </div>

            {studyPlan ? (
              <div
                className={`rounded-3xl border px-4 py-4 ${
                  plannerIsExamWeek
                    ? isDarkTheme
                      ? "border-rose-400/20 bg-rose-500/10 text-rose-100"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                    : isDarkTheme
                      ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-100"
                      : "border-cyan-200 bg-cyan-50 text-cyan-700"
                }`}
              >
                <p className="text-xs uppercase tracking-[0.22em] opacity-75">
                  {plannerIsExamWeek ? "Live Exam Week" : "Study Mode"}
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {studyPlan.daysUntilExam} day{studyPlan.daysUntilExam === 1 ? "" : "s"} left
                </p>
                <p className="mt-1 text-sm opacity-80">{studyPlan.summary}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <div
              className={`rounded-full border px-4 py-2 text-sm ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.03] text-white/75"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {resolvedSubjectTitle}
            </div>
            {selectedTopicTitle ? (
              <div
                className={`rounded-full border px-4 py-2 text-sm ${
                  isDarkTheme
                    ? "border-white/10 bg-white/[0.03] text-white/75"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                Current lesson: {selectedTopicTitle}
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div
              className={`rounded-3xl border p-5 ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.03]"
                  : "border-slate-300/70 bg-white/92"
              }`}
            >
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2 text-sm">
                  <span className={textMuted}>Exam date</span>
                  <input
                    type="date"
                    value={plannerExamDate}
                    onChange={(e) => setPlannerExamDate(e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className={textMuted}>Daily minutes</span>
                  <input
                    type="number"
                    min={20}
                    max={240}
                    step={10}
                    value={plannerDailyMinutes}
                    onChange={(e) => setPlannerDailyMinutes(Number(e.target.value) || 60)}
                    className={`w-full rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className={textMuted}>Confidence</span>
                  <select
                    value={plannerConfidence}
                    onChange={(e) =>
                      setPlannerConfidence(e.target.value as "low" | "medium" | "high")
                    }
                    className={`w-full rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                  >
                    <option value="low">Need help</option>
                    <option value="medium">Getting there</option>
                    <option value="high">Almost ready</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleGenerateStudyPlan}
                  className={`rounded-full px-5 py-3 text-sm font-semibold text-white ${
                    plannerIsExamWeek
                      ? "bg-gradient-to-r from-rose-500 to-orange-500"
                      : "bg-gradient-to-r from-cyan-500 to-fuchsia-500"
                  }`}
                >
                  {studyPlanLoading ? "Building plan..." : "Generate Plan"}
                </button>
                <div
                  className={`rounded-full border px-4 py-3 text-sm ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.03] text-white/65"
                      : "border-slate-300 bg-slate-50 text-slate-600"
                  }`}
                >
                  {resolvedSubjectTitle || "Open a lesson to make the plan more specific"}
                </div>
              </div>

              {studyPlanError ? (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                    isDarkTheme
                      ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {studyPlanError}
                </div>
              ) : null}

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div
                  className={`rounded-2xl border px-4 py-4 ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.02]"
                      : "border-slate-300/70 bg-slate-50/90"
                  }`}
                >
                  <p className={`text-xs uppercase tracking-[0.22em] ${textMuted}`}>
                    Priority Topics
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(studyPlan?.priorityTopics.length
                      ? studyPlan.priorityTopics
                      : plannerTopicTitles.slice(0, 6)
                    ).map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => openTopicInLearning(topic)}
                        className={`rounded-full border px-3 py-1.5 text-xs ${
                          isDarkTheme
                            ? "border-white/10 bg-white/[0.04] text-white/75"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className={`rounded-2xl border px-4 py-4 ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.02]"
                      : "border-slate-300/70 bg-slate-50/90"
                  }`}
                >
                  <p className={`text-xs uppercase tracking-[0.22em] ${textMuted}`}>Quick Wins</p>
                  <div className="mt-3 space-y-2">
                    {(studyPlan?.quickWins.length
                      ? studyPlan.quickWins
                      : [
                          "Choose your exam date and generate a day-wise revision plan.",
                          "Use the topic chips to jump back into lessons whenever needed.",
                          "Keep practice sets completed so the planner prioritizes weak areas.",
                        ]
                    ).map((item) => (
                      <div
                        key={item}
                        className={`rounded-2xl border px-3 py-3 text-sm ${
                          isDarkTheme
                            ? "border-white/10 bg-white/[0.03] text-white/75"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`rounded-3xl border p-5 ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.03]"
                  : "border-slate-300/70 bg-white/92"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-xs uppercase tracking-[0.22em] ${textMuted}`}>
                    Day-wise Plan
                  </p>
                  <p className={`mt-2 text-lg font-semibold ${textPrimary}`}>
                    {studyPlan
                      ? studyPlan.mode === "exam_week"
                        ? "Exam week sprint"
                        : "Steady revision rhythm"
                      : "Generate a planner to see your schedule"}
                  </p>
                </div>
                {studyPlan?.urgency ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                      studyPlan.urgency === "critical"
                        ? isDarkTheme
                          ? "bg-rose-500/15 text-rose-200"
                          : "bg-rose-100 text-rose-700"
                        : studyPlan.urgency === "high"
                          ? isDarkTheme
                            ? "bg-amber-500/15 text-amber-200"
                            : "bg-amber-100 text-amber-700"
                          : isDarkTheme
                            ? "bg-emerald-500/15 text-emerald-200"
                            : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {studyPlan.urgency}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {(studyPlan?.dailyPlan || []).length ? (
                  studyPlan?.dailyPlan.map((day) => (
                    <div
                      key={`${day.dayLabel}-${day.date}`}
                      className={`rounded-2xl border px-4 py-4 ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.03]"
                          : "border-slate-200 bg-slate-50/90"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-semibold ${textPrimary}`}>{day.dayLabel}</p>
                          <p className={`mt-1 text-xs ${textMuted}`}>
                            {day.date} · {day.minutes} mins
                          </p>
                        </div>
                        <p className={`text-sm ${textSecondary}`}>{day.focus}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {day.topicTitles.map((topic) => (
                          <button
                            key={`${day.dayLabel}-${topic}`}
                            type="button"
                            onClick={() => openTopicInLearning(topic)}
                            className={`rounded-full border px-3 py-1.5 text-xs ${
                              isDarkTheme
                                ? "border-white/10 bg-white/[0.04] text-white/75"
                                : "border-slate-300 bg-white text-slate-700"
                            }`}
                          >
                            {topic}
                          </button>
                        ))}
                      </div>
                      <p className={`mt-3 text-sm ${textSecondary}`}>{day.checkpoint}</p>
                    </div>
                  ))
                ) : (
                  <div
                    className={`rounded-2xl border border-dashed px-4 py-8 text-sm ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.02] text-white/45"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    Pick your exam date and we will build a personalized revision path for this
                    subject.
                  </div>
                )}
              </div>

              {studyPlan?.finalRevisionChecklist.length ? (
                <div className="mt-5">
                  <p className={`text-xs uppercase tracking-[0.22em] ${textMuted}`}>
                    Final Revision Checklist
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {studyPlan.finalRevisionChecklist.map((item) => (
                      <div
                        key={item}
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                          isDarkTheme
                            ? "border-white/10 bg-white/[0.03] text-white/75"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
