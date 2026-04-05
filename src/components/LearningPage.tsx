// AuroraWave and SideConfettiUp imports removed
// ParticleText import removed
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import AIChatbot from "./AIChatbot";
import { HoverBorderGradient } from "@/ui/hover-border-gradient";
import { AnimatedShinyText } from "@/ui/animated-shiny-text";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { generateExamQuestions, GeneratedExamQuestions } from "../services/openRouterExamQuestions";
import { resolveTopicVideo } from "../services/youtubeVideos";
import { coursesData } from "../data/coursesData";
import {
  clearCachedSession,
  fetchSession,
  getCachedSession,
  updateLearningState,
  updatePreferences,
  type SavedTopic as SessionSavedTopic,
} from "../services/appSession";

const RECENT_TOPICS_STORAGE_KEY = "lernoRecentTopics";
const BOOKMARKED_TOPICS_STORAGE_KEY = "lernoBookmarkedTopics";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "lernoSidebarCollapsed";
const THEME_STORAGE_KEY = "lernoTheme";
const MAX_RECENT_TOPICS = 8;

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

type SearchSuggestionItem =
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

function toSentenceCase(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildQuickNotes(input: {
  title: string;
  narration: string;
  unitTitle: string;
}) {
  const cleanNarration = input.narration
    .replace(/\s+/g, " ")
    .replace(/\band\b/gi, ",")
    .trim();

  const derivedNotes = cleanNarration
    .split(/[.,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 10)
    .slice(0, 4)
    .map((part) => toSentenceCase(part));

  if (derivedNotes.length) {
    return derivedNotes;
  }

  if (!input.title) {
    return [
      "Pick a topic to get short revision notes here.",
      "You will see the core ideas, important terms, and what to focus on first.",
    ];
  }

  return [
    `Revise the core idea behind ${input.title}.`,
    input.unitTitle
      ? `Connect this topic with ${input.unitTitle}.`
      : `Understand where this topic fits in your syllabus.`,
    `Focus on the important terms, examples, and exam-friendly explanation.`,
  ];
}

const LearningPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const cachedSession = useMemo(() => getCachedSession(), []);
  const sessionEmail = cachedSession?.email || localStorage.getItem("userEmail") || "";
  const syncingFromServerRef = useRef(false);
  const hydratedSessionRef = useRef(false);

  const profileRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState(
    cachedSession?.profile?.fullName || localStorage.getItem("profileName") || "Sourav Kumar"
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

  const allTopics: TopicItem[] = useMemo(() => {
    const list: TopicItem[] = [];
    Object.values(coursesData).forEach((course) => {
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
  }, []);
  const allUnits = useMemo(() => {
    const list: UnitSearchItem[] = [];
    Object.values(coursesData).forEach((course) => {
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
  }, []);
  const FetchData = location.state?.responseData || [
    {
      title: "Introduction to Vectors",
      assessment: {
        multiple_choice: {
          question: "What is the primary purpose of vectors in computing?",
          choices: [
            "A. Data storage only",
            "B. Mathematical operations and graphics",
            "C. Text processing",
            "D. Audio manipulation",
          ],
          correctAnswerIndex: 1,
        },
      },
      narration:
        "Vectors are a fundamental concept in computing, especially in graphics programming and mathematical operations.",
    },
  ];

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Exam questions state
  const [examQuestions, setExamQuestions] = useState<GeneratedExamQuestions | null>(null);
  const [examQuestionsLoading, setExamQuestionsLoading] = useState(false);
  const [examQuestionsError, setExamQuestionsError] = useState<string | null>(null);

  const displayTitle = selectedTopicTitle || "";
  const displayNarration = selectedTopicNarration || "";
  const currentTopicMeta = allTopics.find(
    (topic) => topic.title.toLowerCase() === displayTitle.toLowerCase()
  );
  const isCurrentTopicBookmarked = bookmarkedTopics.some(
    (topic) => topic.title.toLowerCase() === displayTitle.toLowerCase()
  );
  const quickNotes = useMemo(
    () =>
      buildQuickNotes({
        title: displayTitle,
        narration: displayNarration,
        unitTitle: selectedUnitTitle,
      }),
    [displayNarration, displayTitle, selectedUnitTitle]
  );

  function handleNextSlide() {
    const totalSlides = Math.min(FetchData.length, 5);

    if (currentSlideIndex < totalSlides - 1) {
      setCurrentSlideIndex((prevIndex) => prevIndex + 1);
    } else {
      setCurrentSlideIndex(0);
    }
  }

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

  const [direction, setDirection] = useState(1);

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
    const syncProfile = () => {
      setProfileName(localStorage.getItem("profileName") || "Sourav Kumar");
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
    if (!session?.isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }
    if (!session.isOnboarded) {
      navigate("/onboarding", { replace: true });
      return;
    }
    if (session.role === "faculty") {
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

        if (session.profile) {
          setProfileName(session.profile.fullName || "Sourav Kumar");
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
              : "No topic video found right now. Try another lesson."
            : "Select a topic to start learning."
        );
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
    navigate("/login", { replace: true });
  };

  function animatedNextSlide() {
    setDirection(1);
    handleNextSlide();
  }

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    window.speechSynthesis.cancel();
  }, [currentSlideIndex, displayNarration]);

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
    if (!displayTitle) return;

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
  }, [allTopics, displayTitle]);

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

    let resolvedVideoUrl = matchedTopic.videoUrl || "";
    try {
      resolvedVideoUrl =
        matchedTopic.videoUrl ||
        (await resolveTopicVideo({
          title: matchedTopic.title,
          subjectTitle: matchedTopic.subjectTitle,
          unitTitle: matchedTopic.unitTitle,
        })) ||
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
        : "No topic video found right now. Try another lesson topic."
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
  };

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
      { key: "units", title: "Units", items: unitItems },
    ].filter((group) => group.items.length);
  }, [allUnits, search]);

  const flatSuggestions = useMemo(
    () => suggestionGroups.flatMap((group) => group.items),
    [suggestionGroups]
  );

  const selectSuggestion = (item: SearchSuggestionItem) => {
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

    const exact = allUnits.find((unit) => unit.title.toLowerCase() === q);
    const partial = allUnits.find((unit) =>
      unit.title.toLowerCase().includes(q)
    );
    const match = exact || partial;
    if (match) {
      openUnitSuggestion(match);
      return;
    }

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

  const lastSelectionHint = selectedTopicTitle || (allTopics[0]?.title ?? "");
  const isDarkTheme = theme === "dark";
  const textPrimary = isDarkTheme ? "text-white" : "text-slate-900";
  const textSecondary = isDarkTheme ? "text-white/70" : "text-slate-600";
  const textMuted = isDarkTheme ? "text-white/45" : "text-slate-500";
  const subtleBorder = isDarkTheme ? "border-white/10" : "border-slate-300/70";
  const glassCard = isDarkTheme
    ? "border-white/10 bg-zinc-900/50 hover:border-white/30 hover:bg-zinc-900/70"
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
                          <p className={`text-sm ${textMuted}`}>Learning Dashboard</p>
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
                        Open a few lessons and your recent topics will show here.
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
                        Star any topic from the lesson header to save it here.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className={`w-full flex flex-col items-center sticky top-0 z-20 pb-6 backdrop-blur-xl relative transition-colors duration-300 ${
        isDarkTheme ? "bg-black/50" : "bg-gradient-to-b from-white/85 via-white/55 to-transparent"
      }`}>
        <div
          ref={profileRef}
          className="absolute right-2 top-2 md:right-6 md:top-3 flex flex-col items-end"
        >
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-2 rounded-full border shadow-[0_20px_60px_-25px_rgba(0,0,0,0.7)] backdrop-blur-xl transition duration-200 ${
              isDarkTheme
                ? "bg-white/5 border-white/10 hover:bg-white/10"
                : "bg-white/92 border-slate-300/70 hover:bg-white"
            }`}
          >
            <img
              src={profileAvatar}
              alt={profileName}
              className="h-9 w-9 rounded-full object-cover border border-white/10 shadow-inner shadow-black/40"
            />
            <span className={`text-sm font-medium hidden sm:block ${isDarkTheme ? "text-white/90" : "text-slate-800"}`}>{profileName}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`w-4 h-4 transition-transform ${profileOpen ? "rotate-180" : "rotate-0"} ${isDarkTheme ? "text-white/70" : "text-slate-500"}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className={`mt-2 w-44 rounded-2xl backdrop-blur-2xl border overflow-hidden ${
                  isDarkTheme
                    ? "bg-zinc-900/90 border-white/10 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]"
                    : "bg-white/95 border-slate-300/70 shadow-[0_30px_80px_-40px_rgba(148,163,184,0.45)]"
                }`}
              >
                <button
                  className={`w-full text-left px-4 py-3 text-sm transition-colors duration-150 ${
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
                  className={`w-full text-left px-4 py-3 text-sm transition-colors duration-150 ${
                    isDarkTheme ? "text-white/80 hover:bg-white/5" : "text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div ref={searchRef} className="w-full max-w-2xl relative">
          <div className="flex items-center gap-3">
            <div className={`flex flex-1 items-center gap-3 px-4 py-3 rounded-full shadow-[0_20px_60px_-25px_rgba(0,0,0,0.7)] focus-within:ring-2 focus-within:ring-purple-500/60 backdrop-blur-xl transition-colors duration-300 ${
              isDarkTheme
                ? "bg-white/5 border border-white/10"
                : "bg-white/90 border border-slate-300/80"
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
              placeholder={
                lastSelectionHint
                  ? `Search unit... (e.g., Unit 1 – Foundations of Computer Networks)`
                  : "Search unit... (Unit 1, Network Layer, Generative AI...)"
              }
              className={`w-full bg-transparent outline-none text-base md:text-lg transition-colors duration-300 ${
                isDarkTheme
                  ? "text-white placeholder-white/40"
                  : "text-slate-900 placeholder-slate-500"
              }`}
            />
          </div>
            <button
              type="button"
              onClick={() =>
                setTheme((prev) => (prev === "dark" ? "light" : "dark"))
              }
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border shadow-[0_20px_60px_-25px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 ${
                isDarkTheme
                  ? "border-white/10 bg-white/5 text-amber-200 hover:bg-white/10"
                  : "border-slate-300/80 bg-white/90 text-slate-700 hover:bg-white"
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
                                  Unit
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

        <div className="z-10 flex mt-6">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                `group rounded-full border text-base transition-all ease-in hover:cursor-pointer shadow-lg ${
                  isDarkTheme
                    ? "border-black/5 bg-neutral-900 hover:bg-neutral-800 text-white"
                    : "border-slate-300/80 bg-white/95 text-slate-900 hover:bg-white"
                }`
              )}
            >
              {isDarkTheme ? (
                <AnimatedShinyText className="inline-flex items-center justify-center px-6 py-2.5 font-medium text-lg transition ease-out">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentSlideIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      {displayTitle || "Select a topic to start learning."}
                    </motion.span>
                  </AnimatePresence>
                </AnimatedShinyText>
              ) : (
                <div className="inline-flex items-center justify-center px-6 py-2.5 font-semibold text-lg text-slate-800">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentSlideIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      {displayTitle || "Select a topic to start learning."}
                    </motion.span>
                  </AnimatePresence>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleBookmark}
              disabled={!displayTitle}
              className={`flex h-12 w-12 items-center justify-center rounded-full border transition ${
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
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m17.25 21-5.25-3-5.25 3V5.25A2.25 2.25 0 0 1 9 3h6a2.25 2.25 0 0 1 2.25 2.25V21Z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

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
          <div className={`relative group overflow-hidden rounded-xl border md:col-span-2 h-72 md:h-96 backdrop-blur-sm transition-all duration-300 ${glassCard}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px] pointer-events-none"></div>
            <div className="h-full w-full flex flex-col gap-3 items-center justify-center p-2 text-center">
              {displayTitle ? <h3 className={`font-semibold text-lg ${textPrimary}`}>{displayTitle}</h3> : null}

              {selectedTopicVideoUrl ? (
                <iframe
                  width="100%"
                  height="420"
                  src={selectedTopicVideoUrl}
                  title="Topic Video"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="rounded-lg w-full max-w-4xl pointer-events-auto"
                />
              ) : (
                <div className={textSecondary}>
                  {videoLoading ? "Loading video..." : videoMessage}
                </div>
              )}
            </div>
            <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-xl"></div>
            <div className="absolute -inset-px bg-gradient-to-r from-purple-500/30 via-transparent to-cyan-500/30 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none"></div>
          </div>

          <div className={`relative group overflow-hidden rounded-xl border p-6 h-72 md:h-96 backdrop-blur-sm transition-all duration-300 ${glassCard}`}>
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
                <div className="space-y-3">
                  {quickNotes.map((note, index) => (
                    <div
                      key={`${displayTitle || "note"}-${index}`}
                      className={`rounded-2xl border px-4 py-3 ${isDarkTheme ? "border-white/10 bg-white/[0.03]" : "border-slate-300/70 bg-slate-50/90"}`}
                    >
                      <p className={`text-sm leading-7 ${isDarkTheme ? "text-white/80" : "text-slate-700"}`}>
                        <span className={`mr-2 ${isDarkTheme ? "text-emerald-300" : "text-emerald-500"}`}>•</span>
                        {note}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
            <div className="absolute -inset-px bg-gradient-to-r from-green-500/30 via-transparent to-emerald-500/30 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"></div>
          </div>

          <div className={`relative group overflow-hidden rounded-xl border p-4 h-[22rem] md:h-[30rem] backdrop-blur-sm transition-all duration-300 ${glassCard}`}>
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
                <p className={textSecondary}>Select a topic to view important exam questions.</p>
              ) : examQuestions ? (
                <div className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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

          <div className="md:col-span-1 h-full">
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
              {selectedUnitTopicsDisplay.length > 0 ? (
                <div className="space-y-3">
                  <p className={`font-semibold text-lg ${textPrimary}`}>Unit Topics</p>
                  {selectedUnitTitle ? (
                    <p className={`text-sm ${textSecondary}`}>{selectedUnitTitle}</p>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    {selectedUnitTopicsDisplay.map((topic) => (
                      <button
                        key={topic}
                        onClick={() => {
                          const found = allTopics.find((t) => t.title.toLowerCase() === topic.toLowerCase());
                          if (found) {
                            handleTopicSelect(found);
                          } else {
                            handleTopicSelect({ title: topic });
                          }
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-lg border transition ${
                          isDarkTheme
                            ? "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                            : "bg-slate-50 border-slate-300/70 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full w-full flex flex-col justify-center gap-4">
                  <div>
                    <p className={`font-semibold text-lg mb-1 ${textPrimary}`}>
                      📚 Topic Box
                    </p>
                    <p className={`text-sm mb-3 ${textSecondary}`}>
                      {displayTitle
                        ? `Current topic: ${displayTitle}`
                        : "Topics will appear here after you choose a unit."}
                    </p>
                    <div className={`w-full h-3 rounded-full overflow-hidden ${isDarkTheme ? "bg-white/10" : "bg-slate-200"}`}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 transition-all duration-300"
                        style={{ width: displayTitle ? "100%" : "0%" }}
                      ></div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <HoverBorderGradient
                      containerClassName="rounded-full"
                      as="button"
                      className={`flex items-center space-x-2 px-6 py-3 ${isDarkTheme ? "bg-black text-white" : "bg-slate-900 text-white"}`}
                      onClick={animatedNextSlide}
                    >
                      <span>Open Topics</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </HoverBorderGradient>
                  </div>
                </div>
              )}
            </div>
            <div className="absolute -inset-px bg-gradient-to-r from-amber-500/30 via-transparent to-rose-500/30 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"></div>
          </div>
        </motion.div>
      </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default LearningPage;
