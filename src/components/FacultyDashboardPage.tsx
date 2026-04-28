import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearCachedSession,
  fetchFacultyDashboard,
  fetchSession,
  getCampusSelectionFromSession,
  getCachedSession,
  getDefaultRouteForSession,
  type FacultyDashboardData,
} from "../services/appSession";
import {
  listTopicVideoOverrides,
  saveTopicVideoOverride,
  type TopicVideoOverride,
} from "../services/topicVideoOverrides";
import { fetchCampusContentPack, getCoursesDataForSelection } from "../services/campusContent";
import { upsertCampusContentPack } from "../services/campusAdmin";
import { buildCoursesDataFromContentPack } from "../services/campusData";
import { fetchCampusGrowth, type CampusGrowthData } from "../services/campusGrowth";
import {
  applyFacultyReviewAction,
  fetchFacultyReviewInbox,
  type ReviewInboxItem,
} from "../services/facultyReview";
import { importSyllabusPayload } from "../services/syllabusImporter";

const THEME_STORAGE_KEY = "lernoTheme";

function readTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function formatDateTime(timestamp: number) {
  if (!timestamp) return "Just now";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export default function FacultyDashboardPage() {
  const navigate = useNavigate();
  const initialSession = useMemo(() => getCachedSession(), []);
  const [theme, setTheme] = useState<"dark" | "light">(readTheme());
  const [dashboard, setDashboard] = useState<FacultyDashboardData | null>(null);
  const [overrides, setOverrides] = useState<TopicVideoOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [videoInfo, setVideoInfo] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const campusSelection = useMemo(
    () => getCampusSelectionFromSession(initialSession),
    [initialSession]
  );
  const [contentData, setContentData] = useState(() =>
    getCoursesDataForSelection(campusSelection)
  );
  const [contentJson, setContentJson] = useState("");
  const [contentError, setContentError] = useState("");
  const [contentInfo, setContentInfo] = useState("");
  const [savingContent, setSavingContent] = useState(false);
  const [contentReviewStatus, setContentReviewStatus] = useState<"draft" | "review" | "approved">("approved");
  const [contentReviewNotes, setContentReviewNotes] = useState("");
  const [growth, setGrowth] = useState<CampusGrowthData | null>(null);
  const [reviewInbox, setReviewInbox] = useState<ReviewInboxItem[]>([]);
  const [recentApprovedPacks, setRecentApprovedPacks] = useState<ReviewInboxItem[]>([]);
  const [reviewActionLoadingId, setReviewActionLoadingId] = useState("");
  const [importSourceText, setImportSourceText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState("");
  const [importInfo, setImportInfo] = useState("");
  const [importingSyllabus, setImportingSyllabus] = useState(false);

  const isDarkTheme = theme === "dark";

  const refreshReviewInbox = async (email: string) => {
    const reviewData = await fetchFacultyReviewInbox(email);
    setReviewInbox(reviewData.pendingItems || []);
    setRecentApprovedPacks(reviewData.recentApproved || []);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkTheme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isDarkTheme, theme]);

  useEffect(() => {
    if (!initialSession?.isAuthenticated || !initialSession.email) {
      navigate("/login", { replace: true });
      return;
    }

    if (!initialSession.isOnboarded) {
      navigate("/onboarding", { replace: true });
      return;
    }

    if (initialSession.role !== "faculty") {
      navigate(getDefaultRouteForSession(initialSession), { replace: true });
      return;
    }

    const loadDashboard = async () => {
      try {
        await fetchSession(initialSession.email);
        const data = await fetchFacultyDashboard(initialSession.email);
        setDashboard(data);
        const overrideList = await listTopicVideoOverrides(initialSession.email);
        setOverrides(overrideList);
        const pack = await fetchCampusContentPack(campusSelection, {
          includeUnpublished: true,
          email: initialSession.email,
        });
        if (pack) {
          setContentData(buildCoursesDataFromContentPack(pack));
          setContentJson(JSON.stringify(pack.subjects || [], null, 2));
          setContentReviewStatus(pack.reviewStatus || "approved");
          setContentReviewNotes(pack.reviewNotes || "");
        }
        const growthData = await fetchCampusGrowth(initialSession.email);
        setGrowth(growthData);
        await refreshReviewInbox(initialSession.email);
      } catch (err) {
        setError((err as Error).message || "Failed to load faculty dashboard.");
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [campusSelection, initialSession, navigate]);

  const handleLogout = () => {
    clearCachedSession();
    navigate("/login", { replace: true });
  };

  const profile = dashboard?.facultyProfile || initialSession?.profile;

  const allSubjects = useMemo(() => {
    const subjects: Array<{ subjectTitle: string; units: Array<{ title: string; topics: string[] }> }> = [];
    Object.values(contentData).forEach((course) => {
      Object.values(course.years).forEach((year) => {
        Object.entries(year.subjects).forEach(([subjectKey, rawSubject]) => {
          const subject: any = rawSubject;
          const subjectTitle = subject?.name || subjectKey;
          const units = Array.isArray(subject?.units) ? subject.units : [];
          if (!units.length) return;
          if (subjects.some((item) => item.subjectTitle === subjectTitle)) return;
          subjects.push({ subjectTitle, units });
        });
      });
    });
    return subjects;
  }, [contentData]);

  const subjectUnits = useMemo(
    () => allSubjects.find((subject) => subject.subjectTitle === selectedSubject)?.units || [],
    [allSubjects, selectedSubject]
  );

  const unitTopics = useMemo(
    () => subjectUnits.find((unit) => unit.title === selectedUnit)?.topics || [],
    [selectedUnit, subjectUnits]
  );

  const handleSaveTopicVideo = async () => {
    if (!initialSession?.email) return;
    setVideoError("");
    setVideoInfo("");

    if (!selectedSubject || !selectedUnit || !selectedTopic || !videoUrl.trim()) {
      setVideoError("Subject, unit, topic, aur video URL sab required hain.");
      return;
    }

    setSavingVideo(true);
    try {
      await saveTopicVideoOverride({
        facultyEmail: initialSession.email,
        universityId: campusSelection.universityId,
        subjectTitle: selectedSubject,
        unitTitle: selectedUnit,
        topicTitle: selectedTopic,
        videoUrl: videoUrl.trim(),
      });
      const overrideList = await listTopicVideoOverrides(initialSession.email);
      setOverrides(overrideList);
      setVideoInfo("Faculty-selected video save ho gaya. Ab students ke liye ye topic isi video se open hoga.");
    } catch (err) {
      setVideoError((err as Error).message || "Failed to save faculty video.");
    } finally {
      setSavingVideo(false);
    }
  };

  const handlePublishContentPack = async () => {
    if (!initialSession?.email) return;
    setContentError("");
    setContentInfo("");
    setSavingContent(true);

    try {
      const parsedSubjects = JSON.parse(contentJson);
      const result = await upsertCampusContentPack({
        facultyEmail: initialSession.email,
        universityId: campusSelection.universityId,
        universitySlug: campusSelection.universitySlug,
        departmentId: campusSelection.departmentId || "",
        programId: campusSelection.programId || "",
        termId: campusSelection.termId || "",
        packName: `${dashboard?.facultyProfile?.universityName || "Campus"} pilot pack`,
        reviewStatus: contentReviewStatus,
        reviewNotes: contentReviewNotes,
        generatedByAI: true,
        subjects: Array.isArray(parsedSubjects) ? parsedSubjects : [],
      });
      setContentData(buildCoursesDataFromContentPack(result.contentPack));
      setContentJson(JSON.stringify(result.contentPack.subjects || [], null, 2));
      setContentReviewStatus(result.contentPack.reviewStatus || "approved");
      setContentReviewNotes(result.contentPack.reviewNotes || "");
      setContentInfo(
        result.contentPack.reviewStatus === "approved"
          ? "Campus content pack approved aur publish ho gaya."
          : result.contentPack.reviewStatus === "review"
            ? "AI draft human review queue me move ho gaya."
            : "Content draft save ho gaya. Students ko sirf approved content dikhega."
      );
      await refreshReviewInbox(initialSession.email);
    } catch (err) {
      setContentError((err as Error).message || "Failed to publish campus content pack.");
    } finally {
      setSavingContent(false);
    }
  };

  const handleReviewAction = async (
    contentPackId: string,
    action: "approve" | "request_changes" | "save_draft"
  ) => {
    if (!initialSession?.email) return;
    setReviewActionLoadingId(contentPackId);
    setContentError("");
    setContentInfo("");

    try {
      const result = await applyFacultyReviewAction({
        facultyEmail: initialSession.email,
        contentPackId,
        action,
        reviewNotes: contentReviewNotes,
      });
      await refreshReviewInbox(initialSession.email);
      setContentInfo(
        result.contentPack.reviewStatus === "approved"
          ? "Pack approved and published."
          : result.contentPack.reviewStatus === "review"
            ? "Pack moved back to the review queue."
            : "Pack saved as draft."
      );
    } catch (err) {
      setContentError((err as Error).message || "Failed to update review status.");
    } finally {
      setReviewActionLoadingId("");
    }
  };

  const handleSyllabusImport = async () => {
    if (!initialSession?.email) return;
    setImportError("");
    setImportInfo("");
    setImportingSyllabus(true);

    try {
      const result = await importSyllabusPayload({
        facultyEmail: initialSession.email,
        universityId: campusSelection.universityId,
        universitySlug: campusSelection.universitySlug,
        departmentId: campusSelection.departmentId,
        programId: campusSelection.programId || "",
        termId: campusSelection.termId || "",
        sourceText: importSourceText,
        file: importFile,
      });
      setContentJson(JSON.stringify(result.subjects || [], null, 2));
      setContentReviewStatus("review");
      setContentReviewNotes("Imported from syllabus. Pending human review for accuracy and exam fit.");
      setImportInfo(
        `Imported ${result.detectedCounts.subjects} subjects and ${result.detectedCounts.topics} topics into the editor. Review and publish when ready.`
      );
    } catch (err) {
      setImportError((err as Error).message || "Failed to import syllabus.");
    } finally {
      setImportingSyllabus(false);
    }
  };

  return (
    <div
      className={`min-h-screen px-4 py-8 transition-colors duration-300 ${
        isDarkTheme
          ? "bg-black text-white"
          : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(238,243,255,0.96),_rgba(228,236,252,0.98))] text-slate-900"
      }`}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p
              className={`text-xs uppercase tracking-[0.28em] ${
                isDarkTheme ? "text-white/45" : "text-slate-500"
              }`}
            >
              Faculty Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Faculty Dashboard</h1>
            <p
              className={`mt-2 text-sm ${
                isDarkTheme ? "text-white/60" : "text-slate-600"
              }`}
            >
              Monitor onboarding, review learner activity, and manage your profile from one place.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/[0.1]"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isDarkTheme ? "Light Mode" : "Dark Mode"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/[0.1]"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              My Profile
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              Logout
            </button>
          </div>
        </div>

        {loading ? (
          <div
            className={`rounded-[28px] border p-8 ${
              isDarkTheme
                ? "border-white/10 bg-zinc-950/80"
                : "border-slate-300/70 bg-white/88"
            }`}
          >
            Loading faculty dashboard...
          </div>
        ) : error ? (
          <div
            className={`rounded-[28px] border p-8 ${
              isDarkTheme
                ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {error}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <section
                className={`rounded-[30px] border p-6 ${
                  isDarkTheme
                    ? "border-white/10 bg-zinc-950/80"
                    : "border-slate-300/70 bg-white/88"
                }`}
              >
                <div className="flex flex-wrap items-center gap-5">
                  <img
                    src={
                      profile?.avatar ||
                      "https://api.dicebear.com/7.x/notionists-neutral/svg?seed=faculty"
                    }
                    alt={profile?.fullName || "Faculty"}
                    className="h-20 w-20 rounded-full border border-white/10 object-cover"
                  />
                  <div>
                    <h2 className="text-2xl font-semibold">
                      {profile?.fullName || "Faculty User"}
                    </h2>
                    <p
                      className={`mt-1 text-sm ${
                        isDarkTheme ? "text-white/60" : "text-slate-600"
                      }`}
                    >
                      {profile?.email}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isDarkTheme
                            ? "bg-violet-500/15 text-violet-200"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {profile?.designation || "Faculty Member"}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isDarkTheme
                            ? "bg-cyan-500/15 text-cyan-200"
                            : "bg-cyan-100 text-cyan-700"
                        }`}
                      >
                        {profile?.department || "Department not set"}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                {[
                  ["Students", dashboard?.stats.studentCount ?? 0],
                  ["Faculty", dashboard?.stats.facultyCount ?? 0],
                  ["New This Week", dashboard?.stats.newUsersThisWeek ?? 0],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className={`rounded-[26px] border p-5 ${
                      isDarkTheme
                        ? "border-white/10 bg-zinc-950/80"
                        : "border-slate-300/70 bg-white/88"
                    }`}
                  >
                    <p
                      className={`text-xs uppercase tracking-[0.22em] ${
                        isDarkTheme ? "text-white/40" : "text-slate-500"
                      }`}
                    >
                      {label}
                    </p>
                    <p className="mt-4 text-3xl font-semibold">{value}</p>
                  </div>
                ))}
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                {[
                  ["Referral Signups", growth?.ambassadorMetrics.inviteCount ?? 0],
                  ["Top Streak", growth?.leaderboards.streaks[0]?.value ?? 0],
                  ["Campus WAU Progress", `${growth?.ambassadorMetrics.weeklyActivationProgress.progressPercent ?? 0}%`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className={`rounded-[26px] border p-5 ${
                      isDarkTheme
                        ? "border-white/10 bg-zinc-950/80"
                        : "border-slate-300/70 bg-white/88"
                    }`}
                  >
                    <p
                      className={`text-xs uppercase tracking-[0.22em] ${
                        isDarkTheme ? "text-white/40" : "text-slate-500"
                      }`}
                    >
                      {label}
                    </p>
                    <p className="mt-4 text-3xl font-semibold">{value}</p>
                  </div>
                ))}
              </section>

              <section
                className={`rounded-[30px] border p-6 ${
                  isDarkTheme
                    ? "border-white/10 bg-zinc-950/80"
                    : "border-slate-300/70 bg-white/88"
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-semibold">Ambassador Pulse</h3>
                  <p className={isDarkTheme ? "text-white/45" : "text-slate-500"}>
                    Referral and sharing basics for the pilot campus
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div
                    className={`rounded-2xl border p-4 ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.03]"
                        : "border-slate-200 bg-slate-50/85"
                    }`}
                  >
                    <p className={`text-xs uppercase tracking-[0.22em] ${isDarkTheme ? "text-white/40" : "text-slate-500"}`}>
                      Top Shared Content
                    </p>
                    <div className="mt-4 space-y-2">
                      {(growth?.ambassadorMetrics.topSharedContent?.length
                        ? growth.ambassadorMetrics.topSharedContent
                        : [{ topicTitle: "No shares tracked yet", shares: 0 }]).map((item) => (
                        <div
                          key={item.topicTitle}
                          className={`rounded-2xl border px-4 py-3 text-sm ${
                            isDarkTheme
                              ? "border-white/10 bg-white/[0.02] text-white/75"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span>{item.topicTitle}</span>
                            <span className={isDarkTheme ? "text-cyan-200" : "text-cyan-700"}>
                              {item.shares}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className={`rounded-2xl border p-4 ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.03]"
                        : "border-slate-200 bg-slate-50/85"
                    }`}
                  >
                    <p className={`text-xs uppercase tracking-[0.22em] ${isDarkTheme ? "text-white/40" : "text-slate-500"}`}>
                      Campus Leaderboards
                    </p>
                    <div className="mt-4 space-y-4 text-sm">
                      {[
                        { title: "Referrals", items: growth?.leaderboards.referrals || [] },
                        { title: "Streaks", items: growth?.leaderboards.streaks || [] },
                        { title: "Quizzes", items: growth?.leaderboards.quizzes || [] },
                      ].map(({ title, items }) => (
                        <div key={title}>
                          <p className={`mb-2 font-semibold ${isDarkTheme ? "text-white/75" : "text-slate-700"}`}>{title}</p>
                          <div className="space-y-2">
                            {(items as Array<{ fullName: string; value: number; rank: number }>).length ? (
                              (items as Array<{ fullName: string; value: number; rank: number }>).slice(0, 3).map((entry) => (
                                <div
                                  key={`${title}-${entry.rank}-${entry.fullName}`}
                                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                                    isDarkTheme
                                      ? "border-white/10 bg-white/[0.02] text-white/75"
                                      : "border-slate-200 bg-white text-slate-700"
                                  }`}
                                >
                                  <span>{entry.rank}. {entry.fullName}</span>
                                  <span>{entry.value}</span>
                                </div>
                              ))
                            ) : (
                              <div
                                className={`rounded-2xl border px-4 py-3 ${
                                  isDarkTheme
                                    ? "border-white/10 bg-white/[0.02] text-white/45"
                                    : "border-slate-200 bg-white text-slate-500"
                                }`}
                              >
                                No leaderboard data yet.
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section
                className={`rounded-[30px] border p-6 ${
                  isDarkTheme
                    ? "border-white/10 bg-zinc-950/80"
                    : "border-slate-300/70 bg-white/88"
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">Faculty Approval Inbox</h3>
                    <p className={`mt-2 text-sm ${isDarkTheme ? "text-white/55" : "text-slate-600"}`}>
                      Review AI-generated campus packs before they reach students.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isDarkTheme
                        ? "bg-amber-500/15 text-amber-200"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {reviewInbox.length} pending
                  </span>
                </div>

                <div className="space-y-3">
                  {reviewInbox.length ? (
                    reviewInbox.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-3xl border p-4 ${
                          isDarkTheme
                            ? "border-white/10 bg-white/[0.03]"
                            : "border-slate-200 bg-slate-50/90"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold">{item.name}</p>
                            <p className={`mt-1 text-sm ${isDarkTheme ? "text-white/55" : "text-slate-600"}`}>
                              {item.programName} · {item.termName} · {item.subjectCount} subjects · {item.topicCount} topics
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                              item.reviewStatus === "review"
                                ? isDarkTheme
                                  ? "bg-fuchsia-500/15 text-fuchsia-200"
                                  : "bg-fuchsia-100 text-fuchsia-700"
                                : isDarkTheme
                                  ? "bg-slate-500/15 text-slate-200"
                                  : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {item.reviewStatus}
                          </span>
                        </div>
                        {item.reviewNotes ? (
                          <p className={`mt-3 rounded-2xl border px-3 py-3 text-sm ${
                            isDarkTheme
                              ? "border-white/10 bg-white/[0.02] text-white/70"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}>
                            {item.reviewNotes}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <p className={`text-xs ${isDarkTheme ? "text-white/40" : "text-slate-500"}`}>
                            Updated {formatDateTime(item.updatedAt)}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleReviewAction(item.id, "save_draft")}
                              disabled={reviewActionLoadingId === item.id}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                isDarkTheme
                                  ? "bg-white/5 text-white/75 hover:bg-white/10 disabled:bg-white/5 disabled:text-white/35"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              }`}
                            >
                              Save Draft
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewAction(item.id, "request_changes")}
                              disabled={reviewActionLoadingId === item.id}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                isDarkTheme
                                  ? "bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:bg-white/5 disabled:text-white/35"
                                  : "bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:bg-slate-100 disabled:text-slate-400"
                              }`}
                            >
                              Request Changes
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewAction(item.id, "approve")}
                              disabled={reviewActionLoadingId === item.id}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                isDarkTheme
                                  ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:bg-white/5 disabled:text-white/35"
                                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:bg-slate-100 disabled:text-slate-400"
                              }`}
                            >
                              {reviewActionLoadingId === item.id ? "Updating..." : "Approve"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      className={`rounded-3xl border border-dashed px-4 py-5 text-sm ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.02] text-white/45"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      No campus packs are waiting for review right now.
                    </div>
                  )}
                </div>

                {recentApprovedPacks.length ? (
                  <div className="mt-5">
                    <p className={`mb-3 text-xs uppercase tracking-[0.22em] ${isDarkTheme ? "text-white/40" : "text-slate-500"}`}>
                      Recently Approved
                    </p>
                    <div className="space-y-2">
                      {recentApprovedPacks.slice(0, 3).map((item) => (
                        <div
                          key={`approved-${item.id}`}
                          className={`rounded-2xl border px-4 py-3 text-sm ${
                            isDarkTheme
                              ? "border-white/10 bg-white/[0.02] text-white/70"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span>{item.name}</span>
                            <span className={isDarkTheme ? "text-emerald-200" : "text-emerald-700"}>
                              {formatDateTime(item.updatedAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section
                className={`rounded-[30px] border p-6 ${
                  isDarkTheme
                    ? "border-white/10 bg-zinc-950/80"
                    : "border-slate-300/70 bg-white/88"
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-semibold">Recent Onboardings</h3>
                  <p className={isDarkTheme ? "text-white/45" : "text-slate-500"}>
                    Latest users in Firestore
                  </p>
                </div>

                <div className="space-y-3">
                  {dashboard?.recentOnboardings?.length ? (
                    dashboard.recentOnboardings.map((user) => (
                      <div
                        key={user.uid}
                        className={`rounded-2xl border px-4 py-4 ${
                          isDarkTheme
                            ? "border-white/10 bg-white/[0.03]"
                            : "border-slate-200 bg-slate-50/85"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold">{user.fullName}</p>
                            <p
                              className={`mt-1 truncate text-sm ${
                                isDarkTheme ? "text-white/55" : "text-slate-600"
                              }`}
                            >
                              {user.email}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                              user.role === "faculty"
                                ? isDarkTheme
                                  ? "bg-violet-500/15 text-violet-200"
                                  : "bg-violet-100 text-violet-700"
                                : isDarkTheme
                                  ? "bg-emerald-500/15 text-emerald-200"
                                  : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {user.role}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      className={`rounded-2xl border border-dashed px-4 py-5 ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.02] text-white/45"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      No onboarding records yet.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section
                className={`rounded-[30px] border p-6 ${
                  isDarkTheme
                    ? "border-white/10 bg-zinc-950/80"
                    : "border-slate-300/70 bg-white/88"
                }`}
              >
                <h3 className="text-xl font-semibold">Manage Topic Videos</h3>
                <p
                  className={`mt-2 text-sm ${
                    isDarkTheme ? "text-white/55" : "text-slate-600"
                  }`}
                >
                  Mam agar kisi topic ke liye apni pasand ki video set karegi, toh student side par wahi video pehle chalegi. Agar faculty video set nahi karegi, toh existing default video hi play hoga.
                </p>

                <div className="mt-5 grid gap-4">
                  <select
                    value={selectedSubject}
                    onChange={(e) => {
                      setSelectedSubject(e.target.value);
                      setSelectedUnit("");
                      setSelectedTopic("");
                    }}
                    className={`rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                  >
                    <option value="">Select subject</option>
                    {allSubjects.map((subject) => (
                      <option key={subject.subjectTitle} value={subject.subjectTitle}>
                        {subject.subjectTitle}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedUnit}
                    onChange={(e) => {
                      setSelectedUnit(e.target.value);
                      setSelectedTopic("");
                    }}
                    className={`rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                  >
                    <option value="">Select unit</option>
                    {subjectUnits.map((unit) => (
                      <option key={unit.title} value={unit.title}>
                        {unit.title}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className={`rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                  >
                    <option value="">Select topic</option>
                    {unitTopics.map((topic) => (
                      <option key={topic} value={topic}>
                        {topic}
                      </option>
                    ))}
                  </select>

                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Paste YouTube link or video ID"
                    className={`rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
                        : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                    }`}
                  />

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSaveTopicVideo}
                      className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    >
                      {savingVideo ? "Saving..." : "Save Topic Video"}
                    </button>
                    <span
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.03] text-white/60"
                          : "border-slate-300 bg-slate-50 text-slate-600"
                      }`}
                    >
                      No faculty video? Current default video automatically chalega.
                    </span>
                  </div>

                  {videoError ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkTheme
                          ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {videoError}
                    </div>
                  ) : null}

                  {videoInfo ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkTheme
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {videoInfo}
                    </div>
                  ) : null}
                </div>
              </section>

              <section
                className={`rounded-[30px] border p-6 ${
                  isDarkTheme
                    ? "border-white/10 bg-zinc-950/80"
                    : "border-slate-300/70 bg-white/88"
                }`}
              >
                <h3 className="text-xl font-semibold">Syllabus PDF Importer</h3>
                <p
                  className={`mt-2 text-sm ${
                    isDarkTheme ? "text-white/55" : "text-slate-600"
                  }`}
                >
                  Upload a PDF or paste raw syllabus text. We will convert it into a starter campus pack that you can review before publishing.
                </p>

                <div className="mt-5 grid gap-4">
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white file:mr-4 file:rounded-full file:border-0 file:bg-cyan-500/15 file:px-4 file:py-2 file:text-cyan-200"
                        : "border-slate-300 bg-white text-slate-900 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-100 file:px-4 file:py-2 file:text-cyan-700"
                    }`}
                  />

                  <textarea
                    value={importSourceText}
                    onChange={(e) => setImportSourceText(e.target.value)}
                    rows={6}
                    placeholder="Or paste syllabus text here: subject names, unit names, and topic bullets..."
                    className={`rounded-2xl border px-4 py-3 text-sm outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
                        : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                    }`}
                  />

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSyllabusImport}
                      className="rounded-2xl bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-700"
                    >
                      {importingSyllabus ? "Importing..." : "Import Syllabus"}
                    </button>
                    <span
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.03] text-white/60"
                          : "border-slate-300 bg-slate-50 text-slate-600"
                      }`}
                    >
                      Output goes into the campus pack editor below.
                    </span>
                  </div>

                  {importError ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkTheme
                          ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {importError}
                    </div>
                  ) : null}

                  {importInfo ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkTheme
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {importInfo}
                    </div>
                  ) : null}
                </div>
              </section>

              <section
                className={`rounded-[30px] border p-6 ${
                  isDarkTheme
                    ? "border-white/10 bg-zinc-950/80"
                    : "border-slate-300/70 bg-white/88"
                }`}
              >
                <h3 className="text-xl font-semibold">Campus Content Pack</h3>
                <p
                  className={`mt-2 text-sm ${
                    isDarkTheme ? "text-white/55" : "text-slate-600"
                  }`}
                >
                  Paste a JSON array of subjects to ingest or update one pilot campus pack without touching the codebase.
                </p>

                <textarea
                  value={contentJson}
                  onChange={(e) => setContentJson(e.target.value)}
                  rows={12}
                  className={`mt-5 w-full rounded-2xl border px-4 py-3 font-mono text-xs outline-none ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
                      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                  }`}
                  placeholder='[{"id":"subject-id","title":"Subject Title","units":[...],"topics":[...]}]'
                />

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <select
                    value={contentReviewStatus}
                    onChange={(e) =>
                      setContentReviewStatus(e.target.value as "draft" | "review" | "approved")
                    }
                    className={`rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white"
                        : "border-slate-300 bg-white text-slate-900"
                    }`}
                  >
                    <option value="draft">Save as Draft</option>
                    <option value="review">Send for Human Review</option>
                    <option value="approved">Approve and Publish</option>
                  </select>

                  <input
                    value={contentReviewNotes}
                    onChange={(e) => setContentReviewNotes(e.target.value)}
                    placeholder="Review note: checked accuracy, syllabus fit, exam relevance..."
                    className={`rounded-2xl border px-4 py-3 outline-none ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
                        : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handlePublishContentPack}
                    className="rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700"
                  >
                    {savingContent ? "Publishing..." : "Publish Campus Pack"}
                  </button>
                  <span
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.03] text-white/60"
                        : "border-slate-300 bg-slate-50 text-slate-600"
                    }`}
                  >
                    Current scope: {dashboard?.facultyProfile?.universityName || "Campus"} · {dashboard?.facultyProfile?.programName || "Program"} · {dashboard?.facultyProfile?.termName || "Term"} · status {contentReviewStatus}
                  </span>
                </div>

                {contentError ? (
                  <div
                    className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                      isDarkTheme
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {contentError}
                  </div>
                ) : null}

                {contentInfo ? (
                  <div
                    className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                      isDarkTheme
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {contentInfo}
                  </div>
                ) : null}
              </section>

              <section
                className={`rounded-[30px] border p-6 ${
                  isDarkTheme
                    ? "border-white/10 bg-zinc-950/80"
                    : "border-slate-300/70 bg-white/88"
                }`}
              >
                <h3 className="text-xl font-semibold">Saved Video Overrides</h3>
                <div className="mt-5 space-y-3">
                  {(overrides.length
                    ? overrides.slice(0, 5).map(
                        (item) =>
                          `${item.topicTitle} -> faculty-selected video active`
                      )
                    : [
                        "Approve or review newly onboarded users.",
                        "Track student learning activity by unit and topic.",
                        "Assign subjects and topic bundles to faculty members.",
                        "Export onboarding and learning reports.",
                      ]).map((item) => (
                    <div
                      key={item}
                      className={`rounded-2xl border px-4 py-4 ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.03] text-white/75"
                          : "border-slate-200 bg-slate-50/85 text-slate-700"
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
