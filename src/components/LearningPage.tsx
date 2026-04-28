// AuroraWave and SideConfettiUp imports removed
// ParticleText import removed
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import AIChatbot from "./AIChatbot";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { generateExamQuestions, GeneratedExamQuestions } from "../services/openRouterExamQuestions";
import { resolveTopicVideo } from "../services/youtubeVideos";
import { generateQuickNotes, fallbackQuickNotes, type QuickNoteSection } from "../services/quickNotes";
import {
  clearCachedSession,
  fetchSession,
  getCampusSelectionFromSession,
  getCachedSession,
  updateLearningState,
  updatePreferences,
  type SavedTopic as SessionSavedTopic,
} from "../services/appSession";
import { fetchCampusContentPack, getCoursesDataForSelection } from "../services/campusContent";
import { trackEvent } from "../services/activityTracker";
import { buildCoursesDataFromContentPack } from "../services/campusData";
import { createShareArtifact } from "../services/shareArtifacts";

const RECENT_TOPICS_STORAGE_KEY = "lernoRecentTopics";
const BOOKMARKED_TOPICS_STORAGE_KEY = "lernoBookmarkedTopics";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "lernoSidebarCollapsed";
const THEME_STORAGE_KEY = "lernoTheme";
const COMPLETED_PRACTICE_STORAGE_KEY = "lernoCompletedPracticeTopics";
const DEMO_TOPIC_PRELOADED_STORAGE_KEY = "lernoDemoTopicPreloaded";
const VIDEO_CACHE_PREFIX = "lernoResolvedVideo::v2::";
const MAX_RECENT_TOPICS = 8;
const FOCUS_DURATION_SECONDS = 25 * 60;
const DEMO_TOPIC_TITLE = "DBMS";
const SUGGESTED_TOPIC_TITLES = [
  "DBMS",
  "SQL Joins",
  "Computer Networks",
  "Operating System",
  "DSA",
];

type TopicItem = {
  title: string;
  videoUrl?: string;
  narration?: string;
  subjectTitle?: string;
  unitTitle?: string;
  unitTopics?: string[];
};

type UnitItem = { title: string; topics: string[] };

type SavedTopic = TopicItem & {
  lastVisitedAt: number;
};

type StudyPlanItem = {
  title: string;
  detail: string;
};

function sessionTopicsToSaved(topics: SessionSavedTopic[]): SavedTopic[] {
  return topics.map((t) => ({
    ...t,
    lastVisitedAt: t.lastVisitedAt ?? Date.now(),
  }));
}

type UnitSearchItem = {
  title: string;
  subjectTitle: string;
  topics: string[];
};

type TopicSearchItem = TopicItem & {
  subjectTitle: string;
  unitTitle: string;
};

type SearchSuggestionItem =
  | {
      id: string;
      kind: "topic";
      label: string;
      meta: string;
      value: TopicSearchItem;
    }
  | {
      id: string;
      kind: "unit";
      label: string;
      meta: string;
      value: UnitSearchItem;
    };

function readStoredTopics(storageKey: string): SavedTopic[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedTopic =>
        item &&
        typeof item === "object" &&
        typeof item.title === "string" &&
        typeof item.lastVisitedAt === "number"
    );
  } catch {
    return [];
  }
}

function writeStoredTopics(storageKey: string, topics: SavedTopic[]) {
  localStorage.setItem(storageKey, JSON.stringify(topics));
}

function upsertTopic(topics: SavedTopic[], entry: SavedTopic, limit?: number) {
  const next = [
    entry,
    ...topics.filter(
      (topic) => topic.title.toLowerCase() !== entry.title.toLowerCase()
    ),
  ];
  return typeof limit === "number" ? next.slice(0, limit) : next;
}

function formatTopicTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatFocusTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function isToday(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRelatedTopicTitles(topic: string, unitTopics: string[], subjectTopics: string[]) {
  const normalized = topic.toLowerCase();
  if (normalized.includes("network")) {
    return ["OSI Model", "TCP/IP", "LAN vs WAN", "Network Devices", "IP Addressing"];
  }
  if (normalized.includes("dbms") || normalized.includes("database")) {
    return ["SQL", "Normalization", "ER Model", "Transactions", "Indexing"];
  }
  if (normalized.includes("sql")) {
    return ["SQL Joins", "Group By", "Subqueries", "Keys", "Views"];
  }
  if (normalized.includes("operating") || normalized.includes("os")) {
    return ["Process Scheduling", "Deadlock", "Memory Management", "Paging", "File System"];
  }
  if (normalized.includes("dsa") || normalized.includes("data structure")) {
    return ["Arrays", "Linked List", "Stack", "Queue", "Trees"];
  }

  return [...unitTopics, ...subjectTopics, ...SUGGESTED_TOPIC_TITLES]
    .filter((title) => title && title.toLowerCase() !== normalized)
    .slice(0, 5);
}

function getPreferredFemaleVoice() {
  const voices = window.speechSynthesis.getVoices();
  const preferredNames = [
    "Moira",
    "Tessa",
    "Samantha",
    "Serena",
    "Ava",
    "Allison",
    "Susan",
    "Karen",
    "Tessa",
    "Veena",
    "Google UK English Female",
    "Google UK English Female",
    "Google US English",
    "Microsoft Sonia",
    "Microsoft Jenny",
    "Microsoft Aria",
    "Microsoft Zira",
  ];

  return (
    voices.find((voice) =>
      preferredNames.some((name) => voice.name.toLowerCase().includes(name.toLowerCase()))
    ) ||
    voices.find((voice) => /female|woman|moira|tessa|samantha|serena|ava|allison|susan|sonia|jenny|aria|veena/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ||
    null
  );
}

function buildStudyPlan(topic: string): StudyPlanItem[] {
  if (!topic) return [];

  return [
    {
      title: "Watch the video",
      detail: `Start with the lesson video for ${topic}.`,
    },
    {
      title: "Revise quick notes",
      detail: "Read definition, key points, example, and exam tip.",
    },
    {
      title: "Attempt 5-mark questions",
      detail: "Write 2 short answers before opening the AI tutor.",
    },
  ];
}

function buildStudyPlanSpeech(topic: string) {
  return `Today's study plan for ${topic}. First, watch the video. Second, revise the quick notes. Third, attempt the five mark questions. Keep it simple and finish one step at a time.`;
}

const LearningPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const cachedSession = useMemo(() => getCachedSession(), []);
  const campusSelection = useMemo(
    () => getCampusSelectionFromSession(cachedSession),
    [cachedSession]
  );
  const sessionEmail = cachedSession?.email || localStorage.getItem("userEmail") || "";
  const syncingFromServerRef = useRef(false);
  const hydratedSessionRef = useRef(false);
  const viewedLessonKeysRef = useRef<Set<string>>(new Set());
  const sharedTopicHandledRef = useRef("");
  const examWeekLaunchTimerRef = useRef<number | null>(null);
  const demoTopicPreloadedRef = useRef(false);
  const lastSpokenStudyPlanRef = useRef("");

  const profileRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState(
    cachedSession?.profile?.fullName || localStorage.getItem("profileName") || "Guest Learner"
  );
  const [profileAvatar, setProfileAvatar] = useState(
    cachedSession?.profile?.avatar ||
      localStorage.getItem("profileAvatar") ||
      "https://i.pravatar.cc/80?img=64"
  );

  const [search, setSearch] = useState("");
  const [selectedTopicTitle, setSelectedTopicTitle] = useState(
    localStorage.getItem("selectedTopicTitle") || ""
  );
  const [selectedTopicVideoUrl, setSelectedTopicVideoUrl] = useState(
    localStorage.getItem("selectedTopicVideoUrl") || ""
  );
  const [selectedTopicNarration, setSelectedTopicNarration] = useState(
    localStorage.getItem("selectedTopicNarration") || ""
  );
  const [videoMessage, setVideoMessage] = useState("Select a topic to start learning.");
  const [videoLoading, setVideoLoading] = useState(false);
  const latestVideoRequestRef = useRef(0);

  const [unitsList, setUnitsList] = useState<UnitItem[]>([]);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(null);
  const [syllabusSubjectTitle, setSyllabusSubjectTitle] = useState("");
  const [selectedUnitTitle, setSelectedUnitTitle] = useState("");
  const [selectedUnitTopicsDisplay, setSelectedUnitTopicsDisplay] = useState<string[]>([]);
  const [recentTopics, setRecentTopics] = useState<SavedTopic[]>(() =>
    readStoredTopics(RECENT_TOPICS_STORAGE_KEY)
  );
  const [bookmarkedTopics, setBookmarkedTopics] = useState<SavedTopic[]>(() =>
    readStoredTopics(BOOKMARKED_TOPICS_STORAGE_KEY)
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
  );
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" ? "light" : "dark";
  });
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [contentPack, setContentPack] = useState(() =>
    getCoursesDataForSelection(campusSelection)
  );
  const [completedPracticeTopics, setCompletedPracticeTopics] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COMPLETED_PRACTICE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const allTopics: TopicItem[] = useMemo(() => {
    const list: TopicItem[] = [];
    Object.values(contentPack).forEach((course) => {
      Object.values(course.years).forEach((year) => {
        Object.entries(year.subjects).forEach(([subjectKey, rawSubject]) => {
          const subject: any = rawSubject;
          const subjectTitle = subject?.name || subjectKey;
          const units = Array.isArray(subject?.units)
            ? (subject.units as UnitItem[])
            : [];
          const topics = subject.topics || [];
          topics.forEach((t: any) => {
            const title = typeof t === "string" ? t : t.title;
            const matchedUnit = units.find((unit) =>
              unit.topics.some((topic) => topic.toLowerCase() === title.toLowerCase())
            );
            if (typeof t === "string") {
              list.push({
                title: t,
                subjectTitle,
                unitTitle: matchedUnit?.title,
                unitTopics: matchedUnit?.topics || [],
              });
            } else {
              list.push({
                title: t.title,
                videoUrl: t.videoUrl,
                narration: t.narration,
                subjectTitle,
                unitTitle: matchedUnit?.title,
                unitTopics: matchedUnit?.topics || [],
              });
            }
          });
        });
      });
    });
    return list;
  }, [contentPack]);
  const allUnits = useMemo(() => {
    const list: UnitSearchItem[] = [];
    Object.values(contentPack).forEach((course) => {
      Object.values(course.years).forEach((year) => {
        Object.entries(year.subjects).forEach(([subjectKey, rawSubject]) => {
          const subject: any = rawSubject;
          const subjectTitle = subject?.name || subjectKey;
          const units = Array.isArray(subject?.units) ? subject.units : [];
          units.forEach((unit: UnitItem) => {
            list.push({
              title: unit.title,
              subjectTitle,
              topics: unit.topics,
            });
          });
        });
      });
    });
    return list;
  }, [contentPack]);
  const currentSlideIndex = 0;

  // Exam questions state
  const [examQuestions, setExamQuestions] = useState<GeneratedExamQuestions | null>(null);
  const [examQuestionsLoading, setExamQuestionsLoading] = useState(false);
  const [examQuestionsError, setExamQuestionsError] = useState<string | null>(null);
  const [quickNotesFromApi, setQuickNotesFromApi] = useState<QuickNoteSection[]>([]);
  const [quickNotesLoading, setQuickNotesLoading] = useState(false);
  const [examWeekLaunchPending, setExamWeekLaunchPending] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(FOCUS_DURATION_SECONDS);
  const [focusRunning, setFocusRunning] = useState(false);
  const [videoLanguage, setVideoLanguage] = useState<"english" | "hindi">("english");
  const [videoLength, setVideoLength] = useState<"short" | "long">("long");
  const [studyPlanSpeaking, setStudyPlanSpeaking] = useState(false);

  const displayTitle = selectedTopicTitle || "";
  const displayNarration = selectedTopicNarration || "";
  const currentTopicMeta = allTopics.find(
    (topic) => topic.title.toLowerCase() === displayTitle.toLowerCase()
  );
  const isCurrentTopicBookmarked = bookmarkedTopics.some(
    (topic) => topic.title.toLowerCase() === displayTitle.toLowerCase()
  );
  const structuredFallbackNotes = useMemo(
    () =>
      fallbackQuickNotes({
        topic: displayTitle,
        narration: displayNarration,
        unitTitle: selectedUnitTitle,
      }),
    [displayNarration, displayTitle, selectedUnitTitle]
  );
  const quickNotes = quickNotesFromApi.length ? quickNotesFromApi : structuredFallbackNotes;
  const subjectRevisionPack = useMemo(() => {
    if (!syllabusSubjectTitle) return [];
    return allTopics
      .filter((topic) => topic.subjectTitle === syllabusSubjectTitle)
      .slice(0, 6)
      .map((topic) => ({
        title: topic.title,
        summary:
          topic.narration ||
          `Revise ${topic.title.toLowerCase()} and connect it with ${topic.unitTitle || syllabusSubjectTitle}.`,
      }));
  }, [allTopics, syllabusSubjectTitle]);
  const plannerTopicTitles = useMemo(
    () =>
      (subjectRevisionPack.length
        ? subjectRevisionPack.map((topic) => topic.title)
        : displayTitle
          ? [displayTitle]
          : allTopics.slice(0, 6).map((topic) => topic.title)
      ).filter(Boolean),
    [allTopics, displayTitle, subjectRevisionPack]
  );
  const currentTopicPracticeDone = completedPracticeTopics.includes(
    displayTitle.toLowerCase()
  );
  const todayTopicsStudied = useMemo(
    () => recentTopics.filter((topic) => isToday(topic.lastVisitedAt)).length,
    [recentTopics]
  );
  const progressPercent = Math.min(
    100,
    Math.round(((todayTopicsStudied + completedPracticeTopics.length) / 5) * 100)
  );
  const relatedTopics = useMemo(
    () =>
      getRelatedTopicTitles(
        displayTitle,
        selectedUnitTopicsDisplay,
        subjectRevisionPack.map((topic) => topic.title)
      ),
    [displayTitle, selectedUnitTopicsDisplay, subjectRevisionPack]
  );
  const studyPlan = useMemo(() => buildStudyPlan(displayTitle), [displayTitle]);

  const slideVariants = {
    hidden: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    visible: {
      x: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 30,
      },
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
      transition: {
        duration: 0.2,
      },
    }),
  };

  const direction = 1;

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, []);

  useEffect(() => {
    return () => {
      if (examWeekLaunchTimerRef.current) {
        window.clearTimeout(examWeekLaunchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncProfile = () => {
      setProfileName(localStorage.getItem("profileName") || "Guest Learner");
      setProfileAvatar(localStorage.getItem("profileAvatar") || "https://i.pravatar.cc/80?img=64");
      setRecentTopics(readStoredTopics(RECENT_TOPICS_STORAGE_KEY));
      setBookmarkedTopics(readStoredTopics(BOOKMARKED_TOPICS_STORAGE_KEY));
    };
    window.addEventListener("focus", syncProfile);
    window.addEventListener("storage", syncProfile);
    return () => {
      window.removeEventListener("focus", syncProfile);
      window.removeEventListener("storage", syncProfile);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      sidebarCollapsed ? "true" : "false"
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(
      COMPLETED_PRACTICE_STORAGE_KEY,
      JSON.stringify(completedPracticeTopics)
    );
  }, [completedPracticeTopics]);

  useEffect(() => {
    if (!focusRunning) return;

    const timer = window.setInterval(() => {
      setFocusSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setFocusRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [focusRunning]);

  useEffect(() => {
    if (!sessionEmail || !hydratedSessionRef.current || syncingFromServerRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      updatePreferences({
        email: sessionEmail,
        theme,
        sidebarCollapsed,
      }).catch((error) => {
        console.error("Failed to sync preferences", error);
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [sessionEmail, sidebarCollapsed, theme]);

  useEffect(() => {
    if (!sessionEmail || !hydratedSessionRef.current || syncingFromServerRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      updateLearningState({
        email: sessionEmail,
        recentTopics,
        bookmarkedTopics,
        currentSelection: {
          title: selectedTopicTitle,
          videoUrl: selectedTopicVideoUrl,
          narration: selectedTopicNarration,
          subjectTitle: syllabusSubjectTitle,
          unitTitle: selectedUnitTitle,
          unitTopics: selectedUnitTopicsDisplay,
        },
      }).catch((error) => {
        console.error("Failed to sync learning state", error);
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    bookmarkedTopics,
    recentTopics,
    selectedTopicNarration,
    selectedTopicTitle,
    selectedTopicVideoUrl,
    selectedUnitTitle,
    selectedUnitTopicsDisplay,
    sessionEmail,
    syllabusSubjectTitle,
  ]);

  useEffect(() => {
    const session = getCachedSession();
    if (session?.role === "faculty") {
      navigate("/faculty", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!sessionEmail) return;

    let active = true;

    const hydrateSession = async () => {
      try {
        syncingFromServerRef.current = true;
        const session = await fetchSession(sessionEmail);
        if (!active) return;
        const remoteContentPack = await fetchCampusContentPack(
          getCampusSelectionFromSession(session)
        );
        if (!active) return;

        if (session.profile) {
          setProfileName(session.profile.fullName || "Guest Learner");
          setProfileAvatar(
            session.profile.avatar || "https://i.pravatar.cc/80?img=64"
          );
        }

        setTheme(session.preferences.theme);
        setSidebarCollapsed(Boolean(session.preferences.sidebarCollapsed));
        setRecentTopics(sessionTopicsToSaved(session.learningState.recentTopics || []));
        setBookmarkedTopics(
          sessionTopicsToSaved(session.learningState.bookmarkedTopics || [])
        );

        const currentSelection = session.learningState.currentSelection || {};
        setSelectedTopicTitle(currentSelection.title || "");
        setSelectedTopicVideoUrl(currentSelection.videoUrl || "");
        setSelectedTopicNarration(currentSelection.narration || "");
        setSyllabusSubjectTitle(currentSelection.subjectTitle || "");
        setSelectedUnitTitle(currentSelection.unitTitle || "");
        setSelectedUnitTopicsDisplay(currentSelection.unitTopics || []);
        setVideoMessage(
          currentSelection.title
            ? currentSelection.videoUrl
              ? ""
              : "Video search unavailable. Check YouTube API key or try another topic."
            : "Select a topic to start learning."
        );
        if (remoteContentPack) {
          setContentPack(buildCoursesDataFromContentPack(remoteContentPack));
        }
      } catch (error) {
        console.error("Failed to hydrate session", error);
      } finally {
        syncingFromServerRef.current = false;
        hydratedSessionRef.current = true;
      }
    };

    hydrateSession();

    return () => {
      active = false;
    };
  }, [sessionEmail]);

  const handleLogout = () => {
    setProfileOpen(false);
    clearCachedSession();
    navigate("/", { replace: true });
  };

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      setStudyPlanSpeaking(false);
    };
  }, []);

  useEffect(() => {
    window.speechSynthesis.cancel();
    setStudyPlanSpeaking(false);
  }, [currentSlideIndex, displayNarration]);

  const speakStudyPlan = (topicTitle = displayTitle) => {
    if (!topicTitle || typeof window === "undefined" || !window.speechSynthesis) return;

    if (studyPlanSpeaking) {
      window.speechSynthesis.cancel();
      setStudyPlanSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(buildStudyPlanSpeech(topicTitle));
    const voice = getPreferredFemaleVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || "en-IN";
    } else {
      utterance.lang = "en-IN";
    }
    utterance.rate = 0.86;
    utterance.pitch = 1.02;
    utterance.volume = 0.82;
    utterance.onend = () => setStudyPlanSpeaking(false);
    utterance.onerror = () => setStudyPlanSpeaking(false);
    setStudyPlanSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!displayTitle) {
      setExamQuestions(null);
      return;
    }

    const loadExamQuestions = async () => {
      setExamQuestionsLoading(true);
      setExamQuestionsError(null);
      try {
        const questions = await generateExamQuestions(
          displayTitle,
          displayNarration || undefined
        );
        setExamQuestions(questions);
      } catch (err) {
        const msg = (err as Error)?.message || "Failed to generate exam questions";
        setExamQuestionsError(msg);
      } finally {
        setExamQuestionsLoading(false);
      }
    };

    loadExamQuestions();
  }, [displayTitle, displayNarration]);

  useEffect(() => {
    if (!displayTitle) {
      setQuickNotesFromApi([]);
      setQuickNotesLoading(false);
      return;
    }

    let active = true;
    const loadQuickNotes = async () => {
      setQuickNotesLoading(true);
      try {
        const notes = await generateQuickNotes({
          topic: displayTitle,
          narration: displayNarration,
          unitTitle: selectedUnitTitle,
        });
        if (!active) return;
        setQuickNotesFromApi(notes);
      } catch {
        if (!active) return;
        setQuickNotesFromApi([]);
      } finally {
        if (active) {
          setQuickNotesLoading(false);
        }
      }
    };

    loadQuickNotes();

    return () => {
      active = false;
    };
  }, [displayNarration, displayTitle, selectedUnitTitle]);

  useEffect(() => {
    if (!displayTitle) return;

    const lessonKey = [
      campusSelection.universityId || "",
      syllabusSubjectTitle || "",
      selectedUnitTitle || "",
      displayTitle,
    ]
      .join("::")
      .toLowerCase();
    if (!viewedLessonKeysRef.current.has(lessonKey)) {
      viewedLessonKeysRef.current.add(lessonKey);
      trackEvent({
        eventType: "first_lesson_viewed",
        email: sessionEmail,
        selection: campusSelection,
        metadata: {
          topicTitle: displayTitle,
          subjectTitle: syllabusSubjectTitle,
          unitTitle: selectedUnitTitle,
        },
      });
    }

    const matchedTopic = allTopics.find(
      (topic) => topic.title.toLowerCase() === displayTitle.toLowerCase()
    );
    if (!matchedTopic) return;

    if (matchedTopic.subjectTitle) {
      setSyllabusSubjectTitle(matchedTopic.subjectTitle);
    }

    if (matchedTopic.unitTitle) {
      setSelectedUnitTitle(matchedTopic.unitTitle);
      setSelectedUnitTopicsDisplay(matchedTopic.unitTopics || []);
    }
  }, [allTopics, campusSelection, displayTitle, selectedUnitTitle, sessionEmail, syllabusSubjectTitle]);

  const saveRecentTopic = (entry: SavedTopic) => {
    setRecentTopics((prev) => {
      const next = upsertTopic(prev, entry, MAX_RECENT_TOPICS);
      writeStoredTopics(RECENT_TOPICS_STORAGE_KEY, next);
      return next;
    });
  };

  const syncBookmarkedTopicMetadata = (entry: SavedTopic) => {
    setBookmarkedTopics((prev) => {
      const exists = prev.some(
        (topic) => topic.title.toLowerCase() === entry.title.toLowerCase()
      );
      if (!exists) return prev;
      const next = upsertTopic(prev, entry);
      writeStoredTopics(BOOKMARKED_TOPICS_STORAGE_KEY, next);
      return next;
    });
  };

  const handleTopicSelect = async (topic: TopicItem | { title: string }) => {
    const matchedTopic =
      allTopics.find(
        (item) => item.title.toLowerCase() === topic.title.toLowerCase()
      ) || (topic as TopicItem);
    const narration = matchedTopic.narration || "";
    const requestId = Date.now();
    latestVideoRequestRef.current = requestId;

    setSelectedTopicTitle(matchedTopic.title);
    setSelectedTopicVideoUrl("");
    setSelectedTopicNarration(narration);
    setVideoLoading(true);
    setVideoMessage("Finding the best video for this topic...");
    setSelectedUnitTitle(matchedTopic.unitTitle || "");
    setSelectedUnitTopicsDisplay(matchedTopic.unitTopics || []);
    if (matchedTopic.subjectTitle) {
      setSyllabusSubjectTitle(matchedTopic.subjectTitle);
    }

    localStorage.setItem("selectedTopicTitle", matchedTopic.title);
    localStorage.setItem("selectedTopicNarration", narration);
    localStorage.setItem(
      "selectedTopicSubjectTitle",
      matchedTopic.subjectTitle || ""
    );
    localStorage.setItem("selectedTopicUnitTitle", matchedTopic.unitTitle || "");
    localStorage.setItem(
      "selectedTopicUnitTopics",
      JSON.stringify(matchedTopic.unitTopics || [])
    );
    setSearch("");

    let resolvedVideoUrl = "";
    try {
    resolvedVideoUrl =
        (await resolveTopicVideo({
          title: matchedTopic.title,
          universityId: campusSelection.universityId,
          subjectTitle: matchedTopic.subjectTitle,
          unitTitle: matchedTopic.unitTitle,
          language: videoLanguage,
          length: videoLength,
        })) ||
        matchedTopic.videoUrl ||
        "";
    } catch {
      resolvedVideoUrl = matchedTopic.videoUrl || "";
    }

    if (latestVideoRequestRef.current !== requestId) {
      return;
    }

    setSelectedTopicVideoUrl(resolvedVideoUrl);
    setVideoMessage(
      resolvedVideoUrl
        ? ""
        : "Video search unavailable. Check YouTube API key or try another topic."
    );
    setVideoLoading(false);
    localStorage.setItem("selectedTopicVideoUrl", resolvedVideoUrl);

    const savedTopic: SavedTopic = {
      title: matchedTopic.title,
      videoUrl: resolvedVideoUrl,
      narration,
      subjectTitle: matchedTopic.subjectTitle,
      unitTitle: matchedTopic.unitTitle,
      unitTopics: matchedTopic.unitTopics || [],
      lastVisitedAt: Date.now(),
    };
    saveRecentTopic(savedTopic);
    syncBookmarkedTopicMetadata(savedTopic);
    setSearchDropdownOpen(false);
    if (lastSpokenStudyPlanRef.current.toLowerCase() !== matchedTopic.title.toLowerCase()) {
      lastSpokenStudyPlanRef.current = matchedTopic.title;
      window.setTimeout(() => speakStudyPlan(matchedTopic.title), 250);
    }
  };

  const handleSuggestedTopicSelect = (title: string) => {
    const normalized = title.toLowerCase();
    const matchedTopic =
      allTopics.find((topic) => topic.title.toLowerCase() === normalized) ||
      allTopics.find((topic) => topic.title.toLowerCase().includes(normalized));

    void handleTopicSelect(matchedTopic || { title });
  };

  useEffect(() => {
    if (
      demoTopicPreloadedRef.current ||
      selectedTopicTitle ||
      recentTopics.length ||
      localStorage.getItem(DEMO_TOPIC_PRELOADED_STORAGE_KEY) === "true"
    ) {
      return;
    }

    demoTopicPreloadedRef.current = true;
    localStorage.setItem(DEMO_TOPIC_PRELOADED_STORAGE_KEY, "true");

    const timer = window.setTimeout(() => {
      const demoTopic =
        allTopics.find((topic) => topic.title.toLowerCase() === DEMO_TOPIC_TITLE.toLowerCase()) ||
        allTopics.find((topic) => topic.title.toLowerCase().includes("database")) ||
        allTopics.find((topic) => topic.title.toLowerCase().includes("computer network"));

      void handleTopicSelect(
        demoTopic || {
          title: DEMO_TOPIC_TITLE,
          narration:
            "Database Management Systems help store, organize, retrieve, and manage structured data efficiently.",
        }
      );
    }, 500);

    return () => window.clearTimeout(timer);
  }, [allTopics, recentTopics.length, selectedTopicTitle]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sharedTopic = params.get("topic");
    if (!sharedTopic || !allTopics.length) return;

    const normalized = sharedTopic.trim().toLowerCase();
    if (sharedTopicHandledRef.current === normalized) return;

    const matched = allTopics.find((topic) => topic.title.toLowerCase() === normalized);
    if (!matched) return;

    sharedTopicHandledRef.current = normalized;
    handleTopicSelect(matched);
  }, [allTopics, location.search]);

  const openUnitSuggestion = (unit: UnitSearchItem) => {
    setSyllabusSubjectTitle(unit.subjectTitle);
    setUnitsList([]);
    setSelectedUnitIndex(null);
    setSelectedUnitTitle(unit.title);
    setSelectedUnitTopicsDisplay(unit.topics);
    setSelectedTopicTitle("");
    setSelectedTopicVideoUrl("");
    setSelectedTopicNarration("");
    setVideoLoading(false);
    setVideoMessage("Select a topic to start learning.");
    setExamQuestions(null);
    setSearch("");
    setSearchDropdownOpen(false);
  };

  const suggestionGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return [] as Array<{ key: string; title: string; items: SearchSuggestionItem[] }>;
    }

    const topicItems: SearchSuggestionItem[] = allTopics
      .filter((topic) => {
        const title = topic.title.toLowerCase();
        const subjectTitle = (topic.subjectTitle || "").toLowerCase();
        const unitTitle = (topic.unitTitle || "").toLowerCase();
        const narration = (topic.narration || "").toLowerCase();
        return (
          title.includes(query) ||
          subjectTitle.includes(query) ||
          unitTitle.includes(query) ||
          narration.includes(query)
        );
      })
      .slice(0, 10)
      .map((topic) => {
        const subjectTitle = topic.subjectTitle || "General";
        const unitTitle = topic.unitTitle || "Topic";
        return {
          id: `topic-${subjectTitle}-${unitTitle}-${topic.title}`,
          kind: "topic" as const,
          label: topic.title,
          meta: `${subjectTitle} • ${unitTitle}`,
          value: {
            ...topic,
            subjectTitle,
            unitTitle,
          },
        };
      });

    const unitItems: SearchSuggestionItem[] = allUnits
      .filter((unit) => {
        const topicText = unit.topics.join(" ").toLowerCase();
        return (
          unit.title.toLowerCase().includes(query) ||
          unit.subjectTitle.toLowerCase().includes(query) ||
          topicText.includes(query)
        );
      })
      .slice(0, 8)
      .map((unit) => ({
        id: `unit-${unit.subjectTitle}-${unit.title}`,
        kind: "unit" as const,
        label: unit.title,
        meta: unit.subjectTitle,
        value: unit,
      }));

    return [
      { key: "topics", title: "Topics", items: topicItems },
      { key: "units", title: "Units", items: unitItems },
    ].filter((group) => group.items.length);
  }, [allTopics, allUnits, search]);

  const flatSuggestions = useMemo(
    () => suggestionGroups.flatMap((group) => group.items),
    [suggestionGroups]
  );

  const selectSuggestion = (item: SearchSuggestionItem) => {
    if (item.kind === "topic") {
      handleTopicSelect(item.value);
      return;
    }

    openUnitSuggestion(item.value);
  };

  const executeSearch = () => {
    const q = search.trim().toLowerCase();
    if (!q) return;

    if (flatSuggestions.length) {
      const nextSuggestion =
        flatSuggestions[activeSuggestionIndex] || flatSuggestions[0];
      selectSuggestion(nextSuggestion);
      return;
    }

    const exactTopic = allTopics.find((topic) => topic.title.toLowerCase() === q);
    const partialTopic = allTopics.find((topic) =>
      topic.title.toLowerCase().includes(q)
    );
    const topicMatch = exactTopic || partialTopic;
    if (topicMatch) {
      handleTopicSelect(topicMatch);
      return;
    }

    const exact = allUnits.find((unit) => unit.title.toLowerCase() === q);
    const partial = allUnits.find((unit) =>
      unit.title.toLowerCase().includes(q)
    );
    const match = exact || partial;
    if (match) {
      openUnitSuggestion(match);
      return;
    }

    handleTopicSelect({
      title: search.trim(),
      subjectTitle: syllabusSubjectTitle || "Custom Topic",
      unitTitle: selectedUnitTitle || "Direct Search",
      unitTopics: selectedUnitTopicsDisplay,
      narration: `Auto-selected from search query: ${search.trim()}`,
    });

    setSearchDropdownOpen(false);
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && flatSuggestions.length) {
      e.preventDefault();
      setSearchDropdownOpen(true);
      setActiveSuggestionIndex((prev) =>
        prev >= flatSuggestions.length - 1 ? 0 : prev + 1
      );
      return;
    }

    if (e.key === "ArrowUp" && flatSuggestions.length) {
      e.preventDefault();
      setSearchDropdownOpen(true);
      setActiveSuggestionIndex((prev) =>
        prev <= 0 ? flatSuggestions.length - 1 : prev - 1
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch();
      return;
    }

    if (e.key === "Escape") {
      setSearchDropdownOpen(false);
    }
  };

  const toggleBookmark = () => {
    if (!displayTitle) return;

    const matchedTopic = currentTopicMeta || {
      title: displayTitle,
      videoUrl: selectedTopicVideoUrl,
      narration: selectedTopicNarration,
      unitTitle: selectedUnitTitle,
      unitTopics: selectedUnitTopicsDisplay,
    };

    const entry: SavedTopic = {
      title: matchedTopic.title,
      videoUrl: selectedTopicVideoUrl || matchedTopic.videoUrl,
      narration: selectedTopicNarration || matchedTopic.narration,
      subjectTitle: matchedTopic.subjectTitle,
      unitTitle: selectedUnitTitle || matchedTopic.unitTitle,
      unitTopics: selectedUnitTopicsDisplay.length
        ? selectedUnitTopicsDisplay
        : matchedTopic.unitTopics || [],
      lastVisitedAt: Date.now(),
    };

    setBookmarkedTopics((prev) => {
      const exists = prev.some(
        (topic) => topic.title.toLowerCase() === displayTitle.toLowerCase()
      );
      const next = exists
        ? prev.filter(
            (topic) => topic.title.toLowerCase() !== displayTitle.toLowerCase()
          )
        : upsertTopic(prev, entry);
      writeStoredTopics(BOOKMARKED_TOPICS_STORAGE_KEY, next);
      return next;
    });
  };

  const createPublicShareUrl = async (artifact: "topic" | "notes" | "explainer" | "quiz") => {
    if (!displayTitle) return "";
    const revisionText = quickNotes
      .slice(0, 3)
      .map((section) => `${section.title}: ${section.points[0] || ""}`)
      .join(" | ");
    const shareTitle =
      artifact === "topic"
        ? `Lerno topic: ${displayTitle}`
        : artifact === "notes"
          ? `Revision notes: ${displayTitle}`
          : artifact === "explainer"
            ? `Topic explainer: ${displayTitle}`
            : `Quiz card: ${displayTitle}`;
    const shareText =
      artifact === "topic"
        ? `${displayTitle} • ${syllabusSubjectTitle || "Lerno study topic"}`
        : artifact === "notes"
          ? revisionText || `Quick revision for ${displayTitle}`
          : artifact === "explainer"
            ? displayNarration || `Open this explainer for ${displayTitle} on Lerno.`
            : `Practice set for ${displayTitle} • 5M: ${examQuestions?.fiveMarkQuestions.length || 0} • 10M: ${examQuestions?.tenMarkQuestions.length || 0}`;

    const created = await createShareArtifact({
      email: sessionEmail,
      artifactType: artifact,
      topicTitle: displayTitle,
      subjectTitle: syllabusSubjectTitle,
      unitTitle: selectedUnitTitle,
      universityId: campusSelection.universityId,
      universitySlug: campusSelection.universitySlug,
      departmentId: campusSelection.departmentId,
      programId: campusSelection.programId,
      termId: campusSelection.termId,
      referralCode: campusSelection.referralCode,
      shareTitle,
      shareText,
      payload: {
        notes: quickNotes,
        narration: displayNarration,
        fiveMarkQuestions: examQuestions?.fiveMarkQuestions.map((question) => question.question) || [],
        tenMarkQuestions: examQuestions?.tenMarkQuestions.map((question) => question.question) || [],
        summary: revisionText || displayNarration || shareText,
      },
    });

    return `${window.location.origin}/share/${created.shareArtifact.id}`;
  };

  const handleShareTopic = async () => {
    if (!displayTitle) return;

    try {
      const shareUrl = await createPublicShareUrl("topic");
      if (!shareUrl) return;
      const payload = {
        title: `Lerno topic: ${displayTitle}`,
        text: `${displayTitle} • ${syllabusSubjectTitle || "Lerno study topic"}`,
        url: shareUrl,
      };

      if (navigator.share) {
        await navigator.share(payload);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      trackEvent({
        eventType: "share_clicked",
        email: sessionEmail,
        selection: campusSelection,
        metadata: {
          artifact: "topic",
          topicTitle: displayTitle,
          subjectTitle: syllabusSubjectTitle,
        },
      });
    } catch {
      // Ignore cancelled shares.
    }
  };

  const shareArtifact = async (artifact: "notes" | "explainer" | "quiz") => {
    const shareUrl = await createPublicShareUrl(artifact);
    if (!shareUrl) return;

    const revisionText = quickNotes
      .slice(0, 3)
      .map((section) => `${section.title}: ${section.points[0] || ""}`)
      .join(" | ");
    const payload =
      artifact === "notes"
          ? {
              title: `Revision notes: ${displayTitle}`,
              text: revisionText || `Quick revision for ${displayTitle}`,
              url: shareUrl,
            }
          : artifact === "explainer"
            ? {
                title: `Topic explainer: ${displayTitle}`,
                text:
                  displayNarration || `Open this explainer for ${displayTitle} on Lerno.`,
                url: shareUrl,
              }
            : {
                title: `Quiz card: ${displayTitle}`,
                text: `Practice set for ${displayTitle} • 5M: ${examQuestions?.fiveMarkQuestions.length || 0} • 10M: ${examQuestions?.tenMarkQuestions.length || 0}`,
                url: shareUrl,
              };

    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `${payload.title}\n${payload.text}\n${payload.url}`
        );
      }

      trackEvent({
        eventType: "share_clicked",
        email: sessionEmail,
        selection: campusSelection,
        metadata: {
          artifact,
          topicTitle: displayTitle,
          subjectTitle: syllabusSubjectTitle,
        },
      });
    } catch {
      // Ignore cancelled shares.
    }
  };

  const handleMarkPracticeComplete = async () => {
    if (!displayTitle) return;

    const normalized = displayTitle.toLowerCase();
    setCompletedPracticeTopics((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized]
    );
    await trackEvent({
      eventType: "quiz_completed",
      email: sessionEmail,
      selection: campusSelection,
      metadata: {
        topicTitle: displayTitle,
        subjectTitle: syllabusSubjectTitle,
        source: "practice-set",
      },
    });
  };

  const handleRefreshVideo = () => {
    if (!displayTitle) return;

    Object.keys(localStorage)
      .filter((key) => key.startsWith(VIDEO_CACHE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));

    const topic = currentTopicMeta || {
      title: displayTitle,
      narration: displayNarration,
      subjectTitle: syllabusSubjectTitle,
      unitTitle: selectedUnitTitle,
      unitTopics: selectedUnitTopicsDisplay,
    };
    void handleTopicSelect(topic);
  };

  const handleDownloadSummary = () => {
    if (!displayTitle) return;

    const notesHtml = quickNotes
      .map(
        (section) => `
          <section>
            <h2>${escapeHtml(section.title)}</h2>
            <ul>${section.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
          </section>`
      )
      .join("");
    const fiveMarkHtml =
      examQuestions?.fiveMarkQuestions
        .map((question, index) => `<li><strong>Q${index + 1}.</strong> ${escapeHtml(question.question)}</li>`)
        .join("") || "<li>Select a topic and wait for exam questions to generate.</li>";
    const tenMarkHtml =
      examQuestions?.tenMarkQuestions
        .map((question, index) => `<li><strong>Q${index + 1}.</strong> ${escapeHtml(question.question)}</li>`)
        .join("") || "<li>Select a topic and wait for exam questions to generate.</li>";

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(displayTitle)} Notes</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; color: #111827; margin: 40px; line-height: 1.55; }
            h1 { margin: 0 0 6px; font-size: 30px; }
            h2 { margin: 24px 0 8px; font-size: 17px; color: #047857; text-transform: uppercase; letter-spacing: .08em; }
            p { color: #4b5563; }
            li { margin: 8px 0; }
            .meta { margin-bottom: 24px; color: #6b7280; }
            .box { border: 1px solid #d1d5db; border-radius: 14px; padding: 18px 22px; margin: 18px 0; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(displayTitle)}</h1>
          <p class="meta">${escapeHtml(syllabusSubjectTitle || "Lerno.ai")} ${selectedUnitTitle ? `• ${escapeHtml(selectedUnitTitle)}` : ""}</p>
          <div class="box">
            <h2>Quick Notes</h2>
            ${notesHtml}
          </div>
          <div class="box">
            <h2>5 Mark Questions</h2>
            <ol>${fiveMarkHtml}</ol>
          </div>
          <div class="box">
            <h2>10 Mark Questions</h2>
            <ol>${tenMarkHtml}</ol>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  const scrollToPanel = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleOpenExamWeek = () => {
    if (examWeekLaunchPending) return;

    setExamWeekLaunchPending(true);
    if (examWeekLaunchTimerRef.current) {
      window.clearTimeout(examWeekLaunchTimerRef.current);
    }

    examWeekLaunchTimerRef.current = window.setTimeout(() => {
      navigate("/exam-week", {
        state: {
          subjectTitle: syllabusSubjectTitle,
          topicTitle: displayTitle,
          topicTitles: plannerTopicTitles.slice(0, 8),
        },
      });
      setExamWeekLaunchPending(false);
    }, 420);
  };

  const isDarkTheme = theme === "dark";
  const textPrimary = isDarkTheme ? "text-white" : "text-slate-900";
  const textSecondary = isDarkTheme ? "text-white/70" : "text-slate-600";
  const textMuted = isDarkTheme ? "text-white/45" : "text-slate-500";
  const subtleBorder = isDarkTheme ? "border-white/10" : "border-slate-300/70";
  const glassCard = isDarkTheme
    ? "border-white/15 bg-zinc-900/60 shadow-[0_28px_90px_-55px_rgba(255,255,255,0.22)] hover:border-white/35 hover:bg-zinc-900/75"
    : "border-slate-300/70 bg-white/88 shadow-[0_24px_80px_-40px_rgba(148,163,184,0.45)] hover:border-slate-400/80 hover:bg-white";
  const sidebarShell = isDarkTheme
    ? "border-white/10 bg-zinc-950/80 shadow-[0_30px_120px_-60px_rgba(0,0,0,0.9)]"
    : "border-slate-300/70 bg-white/88 shadow-[0_24px_80px_-40px_rgba(148,163,184,0.5)]";
  const chipCard = isDarkTheme
    ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
    : "border-slate-300/70 bg-slate-50/95 hover:bg-slate-100";
  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkTheme
          ? "bg-black"
          : "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(237,242,255,0.96),_rgba(229,238,255,0.98))] text-slate-900"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1700px] gap-4 p-4 md:p-6">
        <aside
          className={`hidden lg:flex lg:flex-col lg:sticky lg:top-6 lg:self-start lg:h-[calc(100vh-3rem)] transition-all duration-300 ${
            sidebarCollapsed ? "lg:w-[92px]" : "lg:w-[290px]"
          }`}
        >
          <div className={`flex h-full flex-col overflow-hidden rounded-[28px] border backdrop-blur-xl ${sidebarShell}`}>
            <div className={`border-b ${subtleBorder} ${sidebarCollapsed ? "px-4 py-5" : "px-5 py-5"}`}>
              <div className={`flex ${sidebarCollapsed ? "justify-center" : "items-start justify-between gap-3"}`}>
                <div className={sidebarCollapsed ? "flex flex-col items-center gap-3" : ""}>
                  {!sidebarCollapsed ? (
                    <>
                      <p className={`text-xs uppercase tracking-[0.32em] ${textMuted}`}>
                        Workspace
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 text-lg font-semibold text-white shadow-[0_15px_40px_-18px_rgba(168,85,247,0.8)]">
                          L
                        </div>
                        <div>
                          <p className={`text-lg font-semibold ${textPrimary}`}>Lerno.ai</p>
                          <p className={`text-sm ${textMuted}`}>AI Learning Workspace</p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
                      : "border-slate-300/70 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    className={`h-5 w-5 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`}
                  >
                    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="2.25" />
                    <path strokeLinecap="round" d="M9 5v14" />
                  </svg>
                </button>
              </div>
            </div>

            {sidebarCollapsed ? (
              <div className="flex flex-1 flex-col items-center gap-4 px-3 py-5">
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 text-lg font-semibold text-white shadow-[0_15px_40px_-18px_rgba(168,85,247,0.8)]"
                  aria-label="Open Lerno workspace"
                  title="Lerno.ai"
                >
                  L
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className={`flex w-full flex-col items-center rounded-2xl border px-3 py-4 text-center transition ${chipCard}`}
                >
                  <span className={`text-[11px] uppercase tracking-[0.22em] ${textMuted}`}>
                    Today
                  </span>
                  <span className={`mt-2 text-xl font-semibold ${textPrimary}`}>
                    {todayTopicsStudied}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className={`flex w-full flex-col items-center rounded-2xl border px-3 py-4 text-center transition ${chipCard}`}
                >
                  <span className={`text-[11px] uppercase tracking-[0.22em] ${textMuted}`}>
                    Recent
                  </span>
                  <span className={`mt-2 text-xl font-semibold ${textPrimary}`}>
                    {recentTopics.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className={`flex w-full flex-col items-center rounded-2xl border px-3 py-4 text-center transition ${chipCard}`}
                >
                  <span className={`text-[11px] uppercase tracking-[0.22em] ${textMuted}`}>
                    Saves
                  </span>
                  <span className={`mt-2 text-xl font-semibold ${textPrimary}`}>
                    {bookmarkedTopics.length}
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <p className={`text-xs uppercase tracking-[0.28em] ${textMuted}`}>
                      Continue
                    </p>
                    <span className={`text-xs ${textMuted}`}>
                      {selectedTopicTitle ? "Ready" : "Idle"}
                    </span>
                  </div>
                  {selectedTopicTitle ? (
                    <button
                      type="button"
                      onClick={() => handleTopicSelect({ title: selectedTopicTitle })}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${chipCard}`}
                    >
                      <p className={`text-sm font-semibold ${textPrimary}`}>{selectedTopicTitle}</p>
                      <p className={`mt-1 text-xs ${textMuted}`}>
                        {selectedUnitTitle || syllabusSubjectTitle || "Continue where you left off"}
                      </p>
                    </button>
                  ) : (
                    <div className={`rounded-2xl border border-dashed px-4 py-5 text-sm ${subtleBorder} ${isDarkTheme ? "bg-white/[0.02] text-white/45" : "bg-slate-50 text-slate-500"}`}>
                      <p className={`font-medium ${textPrimary}`}>Start with a topic</p>
                      <p className={`mt-1 text-xs leading-5 ${textMuted}`}>
                        Search or tap a suggestion to generate video, notes, questions, and tutor help.
                      </p>
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <p className={`text-xs uppercase tracking-[0.28em] ${textMuted}`}>
                      Progress
                    </p>
                    <span className={`text-xs ${textMuted}`}>Today</span>
                  </div>
                  <div className={`rounded-2xl border p-4 ${chipCard}`}>
                    <div className="flex items-center gap-4">
                      <div
                        className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
                        style={{
                          background: `conic-gradient(#34d399 ${progressPercent * 3.6}deg, ${isDarkTheme ? "rgba(255,255,255,0.1)" : "#e2e8f0"} 0deg)`,
                        }}
                      >
                        <div className={`grid h-12 w-12 place-items-center rounded-full text-sm font-semibold ${
                          isDarkTheme ? "bg-zinc-950 text-white" : "bg-white text-slate-900"
                        }`}>
                          {progressPercent}%
                        </div>
                      </div>
                      <div className="min-w-0 space-y-1 text-sm">
                        <p className={textPrimary}>Today: {todayTopicsStudied} topics studied</p>
                        <p className={textMuted}>Practice: {completedPracticeTopics.length} set done</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <p className={`text-xs uppercase tracking-[0.28em] ${textMuted}`}>
                      Recent
                    </p>
                    <span className={`text-xs ${textMuted}`}>
                      {recentTopics.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {recentTopics.length ? (
                      recentTopics.map((topic) => {
                        const isActive =
                          topic.title.toLowerCase() === displayTitle.toLowerCase();
                        return (
                          <button
                            key={`recent-${topic.title}`}
                            type="button"
                            onClick={() => handleTopicSelect(topic)}
                            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                            isActive
                              ? isDarkTheme
                                ? "border-violet-400/50 bg-white/10"
                                : "border-violet-300 bg-violet-50"
                              : chipCard
                          }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`truncate text-sm font-medium ${textPrimary}`}>
                                  {topic.title}
                                </p>
                                <p className={`mt-1 truncate text-xs ${textMuted}`}>
                                  {topic.unitTitle || topic.subjectTitle || "Recent topic"}
                                </p>
                              </div>
                              <span className={`shrink-0 text-[11px] ${textMuted}`}>
                                {formatTopicTime(topic.lastVisitedAt)}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className={`rounded-2xl border border-dashed px-4 py-5 text-sm ${subtleBorder} ${isDarkTheme ? "bg-white/[0.02] text-white/45" : "bg-slate-50 text-slate-500"}`}>
                        <p className={`font-medium ${textPrimary}`}>Start learning</p>
                        <p className={`mt-1 text-xs leading-5 ${textMuted}`}>
                          Recent topics will appear here after your first search.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <p className={`text-xs uppercase tracking-[0.28em] ${textMuted}`}>
                      Bookmarks
                    </p>
                    <span className={`text-xs ${textMuted}`}>
                      {bookmarkedTopics.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {bookmarkedTopics.length ? (
                      bookmarkedTopics.map((topic) => {
                        const isActive =
                          topic.title.toLowerCase() === displayTitle.toLowerCase();
                        return (
                          <button
                            key={`bookmark-${topic.title}`}
                            type="button"
                            onClick={() => handleTopicSelect(topic)}
                            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                            isActive
                              ? isDarkTheme
                                ? "border-amber-400/45 bg-white/10"
                                : "border-amber-300 bg-amber-50"
                              : chipCard
                          }`}
                          >
                            <div className="flex items-start gap-3">
                              <span className={`mt-0.5 ${isDarkTheme ? "text-amber-300" : "text-amber-500"}`}>★</span>
                              <div className="min-w-0">
                                <p className={`truncate text-sm font-medium ${textPrimary}`}>
                                  {topic.title}
                                </p>
                                <p className={`mt-1 truncate text-xs ${textMuted}`}>
                                  {topic.unitTitle || topic.subjectTitle || "Saved topic"}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className={`rounded-2xl border border-dashed px-4 py-5 text-sm ${subtleBorder} ${isDarkTheme ? "bg-white/[0.02] text-white/45" : "bg-slate-50 text-slate-500"}`}>
                        <p className={`font-medium ${textPrimary}`}>Bookmark topics</p>
                        <p className={`mt-1 text-xs leading-5 ${textMuted}`}>
                          Use the bookmark button beside a topic to build your saved list.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className={`w-full flex flex-col items-center sticky top-0 z-20 pb-6 pt-3 md:pt-4 backdrop-blur-xl relative transition-colors duration-300 ${
        isDarkTheme ? "bg-black/50" : "bg-gradient-to-b from-white/85 via-white/55 to-transparent"
      }`}>
        <div ref={searchRef} className="mt-1 w-full max-w-5xl px-2 md:px-6 relative">
          <div
            className={`flex items-center gap-2 rounded-[28px] border p-2 shadow-[0_28px_90px_-55px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition-colors duration-300 ${
              isDarkTheme
                ? "border-white/10 bg-zinc-950/72"
                : "border-slate-300/80 bg-white/88"
            }`}
          >
            <motion.button
              type="button"
              onClick={handleOpenExamWeek}
              whileTap={{ scale: 0.97 }}
              animate={
                examWeekLaunchPending
                  ? {
                      scale: [1, 1.04, 0.98, 1],
                      boxShadow: isDarkTheme
                        ? [
                            "0 20px 60px -25px rgba(0,0,0,0.45)",
                            "0 24px 70px -18px rgba(168,85,247,0.45)",
                            "0 20px 60px -25px rgba(0,0,0,0.45)",
                          ]
                        : [
                            "0 20px 60px -25px rgba(30,41,59,0.18)",
                            "0 24px 70px -18px rgba(59,130,246,0.3)",
                            "0 20px 60px -25px rgba(30,41,59,0.18)",
                          ],
                    }
                  : { scale: 1 }
              }
              transition={{ duration: 0.38, ease: "easeInOut" }}
              className={`relative flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-2xl border px-3.5 transition-all duration-300 ${
                isDarkTheme
                  ? "border-white/10 bg-white/[0.04] text-white/85 hover:border-cyan-300/35 hover:bg-white/[0.08]"
                  : "border-slate-300/70 bg-slate-50 text-slate-800 hover:border-cyan-300 hover:bg-white"
              }`}
              aria-label="Open Exam Week planner"
              title="Open Exam Week planner"
            >
              <span
                className={`absolute inset-0 opacity-0 transition-opacity duration-300 ${
                  examWeekLaunchPending ? "opacity-100" : ""
                } ${isDarkTheme ? "bg-gradient-to-r from-cyan-500/20 via-fuchsia-500/20 to-cyan-500/20" : "bg-gradient-to-r from-cyan-100 via-fuchsia-100 to-cyan-100"}`}
              />
              <span className="relative z-10 flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    isDarkTheme ? "bg-cyan-400/10 text-cyan-100" : "bg-cyan-100 text-cyan-700"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    className="h-4 w-4"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3.75h7.5m-9 4.5h10.5m-10.5 4.5h10.5m-10.5 4.5h6" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 16.5 18 18l3-3" />
                  </svg>
                </span>
                <span className="hidden sm:block text-left">
                  <span className="block text-[10px] uppercase tracking-[0.18em] opacity-55">
                    Exam
                  </span>
                  <span className="block text-sm font-semibold leading-4">
                    {examWeekLaunchPending ? "Opening..." : "Planner"}
                  </span>
                </span>
              </span>
            </motion.button>
            <div className={`flex h-12 flex-1 items-center gap-3 rounded-2xl border px-4 transition-colors duration-300 focus-within:border-violet-300/70 ${
              isDarkTheme
                ? "border-white/10 bg-black/35"
                : "border-slate-300/70 bg-white"
            }`}>
            <button
              type="button"
              onClick={executeSearch}
              className={`p-1 rounded-full transition ${isDarkTheme ? "hover:bg-white/5" : "hover:bg-slate-100"}`}
              aria-label="Search topics"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className={`w-5 h-5 ${isDarkTheme ? "text-white/60" : "text-slate-500"}`}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m16 16 4 4" />
              </svg>
            </button>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchDropdownOpen(Boolean(e.target.value.trim()));
                setActiveSuggestionIndex(0);
              }}
              onFocus={() => {
                if (search.trim()) {
                  setSearchDropdownOpen(true);
                }
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search any topic: DBMS, SQL joins, OS scheduling..."
              className={`w-full bg-transparent outline-none text-sm md:text-base transition-colors duration-300 ${
                isDarkTheme
                  ? "text-white placeholder-white/40"
                  : "text-slate-900 placeholder-slate-500"
              }`}
            />
          </div>
            <div
              ref={profileRef}
              className={`flex h-12 shrink-0 items-center gap-1 rounded-2xl border p-1 ${
                isDarkTheme ? "border-white/10 bg-black/30" : "border-slate-300/70 bg-slate-50"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
                  isDarkTheme
                    ? "bg-amber-300/10 text-amber-200 hover:bg-amber-300/15"
                    : "bg-white text-slate-700 shadow-sm hover:text-slate-900"
                }`}
                aria-label={
                  isDarkTheme ? "Switch to light mode" : "Switch to dark mode"
                }
                title={isDarkTheme ? "Light mode" : "Dark mode"}
              >
                {isDarkTheme ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="4.5" />
                    <path strokeLinecap="round" d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5M18.54 5.46l-1.77 1.77M7.23 16.77l-1.77 1.77M18.54 18.54l-1.77-1.77M7.23 7.23 5.46 5.46" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    className="h-5 w-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 12.79A9 9 0 1 1 11.21 3c-.18.58-.28 1.2-.28 1.84 0 3.49 2.83 6.32 6.32 6.32.64 0 1.26-.1 1.84-.28Z"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => setProfileOpen((prev) => !prev)}
                className={`flex h-10 items-center gap-2 rounded-xl px-2.5 transition ${
                  isDarkTheme
                    ? "text-white/85 hover:bg-white/[0.06]"
                    : "text-slate-800 hover:bg-white"
                }`}
              >
                <img
                  src={profileAvatar}
                  alt={profileName}
                  className="h-7 w-7 rounded-lg object-cover"
                />
                <span className="hidden max-w-[120px] truncate text-sm font-semibold md:block">{profileName}</span>
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className={`absolute right-6 top-[calc(100%+0.75rem)] z-40 w-44 overflow-hidden rounded-2xl border backdrop-blur-2xl ${
                      isDarkTheme
                        ? "border-white/10 bg-zinc-900/95 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]"
                        : "border-slate-300/70 bg-white/95 shadow-[0_30px_80px_-40px_rgba(148,163,184,0.45)]"
                    }`}
                  >
                    <button
                      className={`w-full px-4 py-3 text-left text-sm transition-colors duration-150 ${
                        isDarkTheme ? "text-white/80 hover:bg-white/5" : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setProfileOpen(false);
                        navigate("/profile");
                      }}
                    >
                      My Profile
                    </button>
                    <button
                      className={`w-full px-4 py-3 text-left text-sm transition-colors duration-150 ${
                        isDarkTheme ? "text-white/80 hover:bg-white/5" : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={handleLogout}
                    >
                      Reset Session
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {searchDropdownOpen && search.trim() ? (
            <div className={`absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden rounded-[24px] border p-3 backdrop-blur-2xl ${
              isDarkTheme
                ? "border-white/10 bg-zinc-950/95 shadow-[0_35px_80px_-40px_rgba(0,0,0,0.95)]"
                : "border-slate-300/70 bg-white/96 shadow-[0_35px_80px_-40px_rgba(148,163,184,0.45)]"
            }`}>
              {suggestionGroups.length ? (
                <div className="space-y-3">
                  {(() => {
                    let runningIndex = -1;
                    return suggestionGroups.map((group) => (
                      <div key={group.key}>
                        <p className={`mb-2 px-2 text-[11px] uppercase tracking-[0.24em] ${textMuted}`}>
                          {group.title}
                        </p>
                        <div className="space-y-1">
                          {group.items.map((item) => {
                            runningIndex += 1;
                            const isActive = runningIndex === activeSuggestionIndex;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => selectSuggestion(item)}
                                className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                                  isActive
                                    ? isDarkTheme
                                      ? "border-violet-400/45 bg-white/10"
                                      : "border-violet-300 bg-violet-50"
                                    : isDarkTheme
                                      ? "border-white/5 bg-white/[0.02] hover:bg-white/[0.06]"
                                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className={`truncate text-sm font-medium ${textPrimary}`}>
                                    {item.label}
                                  </p>
                                  <p className={`mt-1 truncate text-xs ${textMuted}`}>
                                    {item.meta}
                                  </p>
                                </div>
                                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${
                                  isDarkTheme
                                    ? "border-white/10 bg-white/[0.04] text-white/45"
                                    : "border-slate-300 bg-white text-slate-500"
                                }`}>
                                  {item.kind === "topic" ? "Topic" : "Unit"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className={`rounded-2xl border border-dashed px-4 py-5 text-sm ${subtleBorder} ${isDarkTheme ? "bg-white/[0.02] text-white/45" : "bg-slate-50 text-slate-500"}`}>
                  No matches found. Try topic, subject, or unit name.
                </div>
              )}
            </div>
          ) : null}
        </div>

        {unitsList.length > 0 && (
          <div className="w-full max-w-2xl mt-3 space-y-3">
            <div className={`text-sm ${textSecondary}`}>{syllabusSubjectTitle} · Units</div>
            <div className="grid md:grid-cols-2 gap-3">
              {unitsList.map((unit, idx) => (
                <button
                  key={unit.title}
                  onClick={() => {
                    setSelectedUnitIndex(idx);
                    setSelectedUnitTitle(unit.title);
                    setSelectedUnitTopicsDisplay(unit.topics);
                    setUnitsList([]);
                    setSelectedTopicTitle("");
                    setSelectedTopicVideoUrl("");
                    setSelectedTopicNarration("");
                    setVideoLoading(false);
                    setVideoMessage("Select a topic to start learning.");
                    setExamQuestions(null);
                  }}
                  className={`text-left w-full px-4 py-3 rounded-xl border transition-all duration-200 ${
                    selectedUnitIndex === idx
                      ? isDarkTheme
                        ? "border-purple-400/60 bg-white/10 text-white"
                        : "border-violet-300 bg-violet-50 text-slate-900"
                      : isDarkTheme
                        ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {unit.title}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {displayTitle && studyPlan.length ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className={`mb-5 w-full max-w-6xl rounded-2xl border p-4 backdrop-blur-xl ${
            isDarkTheme
              ? "border-cyan-300/15 bg-cyan-300/[0.04] shadow-[0_24px_90px_-60px_rgba(34,211,238,0.5)]"
              : "border-cyan-200 bg-cyan-50/80 shadow-[0_24px_80px_-50px_rgba(14,165,233,0.35)]"
          }`}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${
                isDarkTheme ? "text-cyan-200/70" : "text-cyan-700"
              }`}>
                Today's Study Plan
              </p>
              <h2 className={`mt-1 text-xl font-semibold ${textPrimary}`}>
                Finish {displayTitle} in 3 simple steps
              </h2>
            </div>
            <button
              type="button"
              onClick={() => speakStudyPlan()}
              className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                studyPlanSpeaking
                  ? isDarkTheme
                    ? "border-rose-300/25 bg-rose-300/12 text-rose-100 hover:bg-rose-300/18"
                    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : isDarkTheme
                    ? "border-cyan-200/20 bg-cyan-200/10 text-cyan-100 hover:bg-cyan-200/16"
                    : "border-cyan-200 bg-white text-cyan-800 hover:bg-cyan-100"
              }`}
            >
              {studyPlanSpeaking ? "Stop voice" : "Play voice"}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {studyPlan.map((item, index) => (
              <div
                key={item.title}
                className={`rounded-2xl border p-3 ${
                  isDarkTheme
                    ? "border-white/10 bg-black/20"
                    : "border-cyan-200/80 bg-white/75"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-semibold ${
                    isDarkTheme ? "bg-cyan-300/12 text-cyan-100" : "bg-cyan-100 text-cyan-700"
                  }`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${textPrimary}`}>{item.title}</p>
                    <p className={`mt-1 text-xs leading-5 ${textMuted}`}>{item.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      ) : null}

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentSlideIndex}
          custom={direction}
          variants={slideVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-6xl"
        >
          <div className={`relative group overflow-hidden rounded-xl border md:col-span-2 h-[22rem] md:h-[28rem] backdrop-blur-sm transition-all duration-300 ${glassCard}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px] pointer-events-none"></div>
            <div className="relative z-10 flex h-full w-full flex-col p-3">
              <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
                <div className="min-w-0 text-left">
                  <p className={`truncate text-lg font-semibold ${textPrimary}`}>
                    {displayTitle || "Search any topic to start learning"}
                  </p>
                  <p className={`text-xs ${textMuted}`}>
                    {displayTitle ? "Video lesson" : "Video, notes, questions, and tutor will appear here"}
                  </p>
                  {displayTitle ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {["Beginner", "Exam Focus", "10 min"].map((tag) => (
                        <span
                          key={tag}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            isDarkTheme
                              ? "border-white/10 bg-white/[0.04] text-white/55"
                              : "border-slate-300 bg-slate-50 text-slate-500"
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleBookmark}
                    disabled={!displayTitle}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                      isCurrentTopicBookmarked
                        ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                        : isDarkTheme
                          ? "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white"
                          : "border-slate-300/80 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                    aria-label={
                      isCurrentTopicBookmarked
                        ? "Remove bookmark"
                        : "Bookmark current topic"
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill={isCurrentTopicBookmarked ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth={1.6}
                      className="h-4 w-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m17.25 21-5.25-3-5.25 3V5.25A2.25 2.25 0 0 1 9 3h6a2.25 2.25 0 0 1 2.25 2.25V21Z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareTopic}
                    disabled={!displayTitle}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                      isDarkTheme
                        ? "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white"
                        : "border-slate-300/80 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                    aria-label="Share current topic"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      className="h-4 w-4"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6.4 4.8 3.8 2.4m-3.8-2.4 3.8-2.4" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center text-center">
              {selectedTopicVideoUrl ? (
                <iframe
                  width="100%"
                  height="100%"
                  src={selectedTopicVideoUrl}
                  title="Topic Video"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="h-full w-full rounded-lg pointer-events-auto"
                />
              ) : (
                videoLoading ? (
                  <div className={textSecondary}>Loading video...</div>
                ) : (
                  <div className="max-w-xl px-4">
                    <p className={`text-xl font-semibold ${textPrimary}`}>
                      Search any topic.
                    </p>
                    <p className={`mt-3 text-sm leading-7 ${textSecondary}`}>
                      Lerno will find the best video, make quick notes, generate exam questions,
                      and keep an AI tutor ready for follow-up doubts.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {SUGGESTED_TOPIC_TITLES.map((title) => (
                        <button
                          key={`hero-suggestion-${title}`}
                          type="button"
                          onClick={() => handleSuggestedTopicSelect(title)}
                          className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                            isDarkTheme
                              ? "border-white/10 bg-white/[0.06] text-white/80 hover:border-violet-300/45 hover:bg-white/[0.12]"
                              : "border-slate-300 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                          }`}
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                    {videoMessage && videoMessage !== "Select a topic to start learning." ? (
                      <p className={`mt-4 text-xs ${textMuted}`}>{videoMessage}</p>
                    ) : null}
                  </div>
                )
              )}
              </div>
              {displayTitle ? (
                <div className={`mt-3 flex flex-wrap items-center gap-2 border-t pt-3 ${subtleBorder}`}>
                  <button
                    type="button"
                    onClick={handleRefreshVideo}
                    disabled={videoLoading}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.09]"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Change video
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoLanguage((prev) => (prev === "english" ? "hindi" : "english"))}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.09]"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Prefer: {videoLanguage === "english" ? "English" : "Hindi"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoLength((prev) => (prev === "long" ? "short" : "long"))}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.09]"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Length: {videoLength === "long" ? "Long" : "Short"}
                  </button>
                  <button
                    type="button"
                    onClick={toggleBookmark}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      isCurrentTopicBookmarked
                        ? isDarkTheme
                          ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
                          : "border-amber-300 bg-amber-50 text-amber-700"
                        : isDarkTheme
                          ? "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.09]"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {isCurrentTopicBookmarked ? "Saved" : "Save video"}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-xl"></div>
            <div className="absolute -inset-px bg-gradient-to-r from-purple-500/30 via-transparent to-cyan-500/30 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none"></div>
          </div>

          <div id="quick-notes" className={`relative group scroll-mt-28 overflow-hidden rounded-xl border p-6 h-72 md:h-96 backdrop-blur-sm transition-all duration-300 ${glassCard}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 via-emerald-500/20 to-teal-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]"></div>
            <div className="relative z-10 h-full flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isDarkTheme ? "bg-white/10" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className={`w-4 h-4 ${isDarkTheme ? "text-emerald-200" : "text-emerald-600"}`}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75m6 2.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className={`text-lg font-medium ${textPrimary}`}>Quick Notes</h3>
                  <p className={`text-xs uppercase tracking-[0.22em] ${isDarkTheme ? "text-emerald-200/55" : "text-emerald-600/70"}`}>
                    Fast Revision
                  </p>
                </div>
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className={`flex-grow overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent ${textSecondary}`}
              >
                {quickNotesLoading ? (
                  <div className={`mb-3 rounded-2xl border px-4 py-3 text-sm ${isDarkTheme ? "border-white/10 bg-white/[0.03] text-white/60" : "border-slate-300/70 bg-slate-50/90 text-slate-600"}`}>
                    Building structured revision notes...
                  </div>
                ) : null}
                <div className="space-y-3">
                  {quickNotes.map((section) => (
                    <div
                      key={`${displayTitle || "note"}-${section.title}`}
                      className={`rounded-2xl border px-4 py-3 ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.035]"
                          : "border-slate-300/70 bg-slate-50/90"
                      }`}
                    >
                      <p className={`mb-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                        isDarkTheme ? "text-emerald-200/70" : "text-emerald-700"
                      }`}>
                        {section.title}
                      </p>
                      <div className="space-y-1.5">
                        {section.points.map((point) => (
                          <div key={point} className="flex gap-2">
                            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                              isDarkTheme ? "bg-emerald-300/75" : "bg-emerald-500"
                            }`} />
                            <p className={`text-sm leading-6 ${
                              isDarkTheme ? "text-white/80" : "text-slate-700"
                            }`}>
                              {point}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
            <div className="absolute -inset-px bg-gradient-to-r from-green-500/30 via-transparent to-emerald-500/30 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"></div>
          </div>

          <div id="exam-practice" className={`relative group scroll-mt-28 overflow-hidden rounded-xl border p-4 h-[22rem] md:h-[30rem] backdrop-blur-sm transition-all duration-300 ${glassCard}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]"></div>
            <div className="relative z-10 flex h-full flex-col overflow-hidden">
              <div className="mb-3 flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-base ${
                    isDarkTheme ? "bg-white/10" : "bg-amber-50 text-amber-600"
                  }`}
                >
                  📋
                </div>
                <div>
                  <h3 className={`text-lg font-medium ${textPrimary}`}>Important Exam Questions</h3>
                  <p className={`text-xs uppercase tracking-[0.22em] ${textMuted}`}>
                    Exam Practice
                  </p>
                </div>
              </div>
              
              {examQuestionsLoading ? (
                <p className={textSecondary}>Generating exam questions...</p>
              ) : examQuestionsError ? (
                <p className="text-red-400">{examQuestionsError}</p>
              ) : !displayTitle ? (
                <div className="space-y-3">
                  <p className={`text-sm leading-6 ${textSecondary}`}>
                    After selecting a topic, you will get university-style 5-mark and 10-mark
                    questions for fast exam prep.
                  </p>
                  {[
                    "Q1. Define the topic and explain its importance.",
                    "Q2. Compare key concepts with one example.",
                  ].map((sample) => (
                    <div
                      key={sample}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.04] text-white/55"
                          : "border-slate-300/70 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {sample}
                    </div>
                  ))}
                </div>
              ) : examQuestions ? (
                <div className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleMarkPracticeComplete}
                      disabled={currentTopicPracticeDone}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                        currentTopicPracticeDone
                          ? isDarkTheme
                            ? "bg-emerald-500/10 text-emerald-200"
                            : "bg-emerald-100 text-emerald-700"
                          : isDarkTheme
                            ? "bg-blue-500/15 text-blue-200 hover:bg-blue-500/25"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      }`}
                    >
                      {currentTopicPracticeDone ? "Practice Completed" : "Mark Practice Set Done"}
                    </button>
                    <button
                      type="button"
                      onClick={() => shareArtifact("quiz")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                        isDarkTheme
                          ? "bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                          : "bg-violet-100 text-violet-700 hover:bg-violet-200"
                      }`}
                    >
                      Share Quiz Card
                    </button>
                  </div>
                  {/* 5 Mark Questions */}
                  <div>
                    <h4 className="text-amber-400 font-semibold text-sm mb-2">5 Marks Questions</h4>
                    <div className="space-y-2">
                      {examQuestions.fiveMarkQuestions.map((q, index) => (
                        <motion.div
                          key={`5m-${index}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.1 }}
                          className={`px-3 py-2 rounded-lg text-sm ${isDarkTheme ? "bg-white/5 border border-white/10 text-white/80" : "bg-slate-50 border border-slate-300/70 text-slate-700"}`}
                        >
                          <span className="text-amber-400 font-medium">Q{index + 1}.</span> {q.question}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 10 Mark Questions */}
                  <div>
                    <h4 className="text-emerald-400 font-semibold text-sm mb-2">10 Marks Questions</h4>
                    <div className="space-y-2">
                      {examQuestions.tenMarkQuestions.map((q, index) => (
                        <motion.div
                          key={`10m-${index}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: (index + 3) * 0.1 }}
                          className={`px-3 py-2 rounded-lg text-sm ${isDarkTheme ? "bg-white/5 border border-emerald-500/20 text-white/80" : "bg-emerald-50 border border-emerald-200 text-slate-700"}`}
                        >
                          <span className="text-emerald-400 font-medium">Q{index + 1}.</span> {q.question}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="absolute -inset-px bg-gradient-to-r from-blue-500/30 via-transparent to-purple-500/30 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"></div>
          </div>

          <div id="ai-tutor" className="md:col-span-1 h-full scroll-mt-28">
            <AIChatbot
              lessonTitle={displayTitle}
              lessonContent={displayNarration}
              currentQuestion={displayTitle || "Select a topic to start learning"}
              theme={theme}
            />
          </div>
          <div className={`relative group overflow-hidden rounded-xl border p-6 backdrop-blur-sm transition-all duration-300 ${glassCard}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-rose-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]"></div>
            <div className="h-full w-full flex flex-col gap-4 relative z-10">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`font-semibold text-lg ${textPrimary}`}>Related Topics</p>
                    <p className={`text-sm ${textSecondary}`}>
                      {displayTitle ? "Keep the learning flow moving" : "Pick a topic to start"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSummary}
                    disabled={!displayTitle}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      isDarkTheme
                        ? "bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                        : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    }`}
                  >
                    Summary PDF
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(displayTitle ? relatedTopics : SUGGESTED_TOPIC_TITLES).map((title) => (
                    <button
                      key={`related-${title}`}
                      type="button"
                      onClick={() => handleSuggestedTopicSelect(title)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                        isDarkTheme
                          ? "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.1]"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${isDarkTheme ? "border-white/10 bg-white/[0.035]" : "border-slate-300/70 bg-slate-50/90"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${textPrimary}`}>Focus Mode</p>
                    <p className={`text-xs ${textMuted}`}>25 min study session</p>
                  </div>
                  <p className={`font-mono text-2xl font-semibold ${textPrimary}`}>
                    {formatFocusTime(focusSeconds)}
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFocusRunning((prev) => !prev)}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold ${
                      isDarkTheme
                        ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    }`}
                  >
                    {focusRunning ? "Pause" : "Start"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusRunning(false);
                      setFocusSeconds(FOCUS_DURATION_SECONDS);
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                      isDarkTheme
                        ? "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => shareArtifact("notes")}
                  disabled={!displayTitle}
                  className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.09]"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Share Notes
                </button>
                <button
                  type="button"
                  onClick={() => scrollToPanel("ai-tutor")}
                  className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold transition ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.09]"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Ask Tutor
                </button>
              </div>
            </div>
            <div className="absolute -inset-px bg-gradient-to-r from-amber-500/30 via-transparent to-rose-500/30 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"></div>
          </div>

        </motion.div>
      </AnimatePresence>
        </div>
      </div>
      <nav
        className={`fixed inset-x-4 bottom-4 z-40 grid grid-cols-4 gap-2 rounded-3xl border p-2 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur-2xl lg:hidden ${
          isDarkTheme ? "border-white/10 bg-zinc-950/90" : "border-slate-300/80 bg-white/92"
        }`}
      >
        {[
          { label: "Search", action: () => searchRef.current?.querySelector("input")?.focus() },
          { label: "Notes", action: () => scrollToPanel("quick-notes") },
          { label: "Tutor", action: () => scrollToPanel("ai-tutor") },
          { label: "Exam", action: () => scrollToPanel("exam-practice") },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className={`rounded-2xl px-2 py-2 text-xs font-semibold transition ${
              isDarkTheme
                ? "text-white/70 hover:bg-white/[0.08] hover:text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default LearningPage;
