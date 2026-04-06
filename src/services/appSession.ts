import { API_BASE_URL } from "./apiBaseUrl";

export type UserRole = "student" | "faculty";
export type ThemeMode = "dark" | "light";

export type SavedTopic = {
  title: string;
  videoUrl?: string;
  narration?: string;
  subjectTitle?: string;
  unitTitle?: string;
  unitTopics?: string[];
  lastVisitedAt?: number;
};

export type LearningSelection = {
  title?: string;
  videoUrl?: string;
  narration?: string;
  subjectTitle?: string;
  unitTitle?: string;
  unitTopics?: string[];
};

export type SessionProfile = {
  uid: string;
  email: string;
  role: UserRole;
  fullName: string;
  phone: string;
  avatar: string;
  isOnboarded: boolean;
  course?: string;
  year?: string;
  semester?: string;
  department?: string;
  designation?: string;
  createdAt: number;
  updatedAt: number;
};

export type SessionPreferences = {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
};

export type LearningState = {
  recentTopics: SavedTopic[];
  bookmarkedTopics: SavedTopic[];
  currentSelection: LearningSelection;
  updatedAt?: number;
};

export type AppSession = {
  isAuthenticated: boolean;
  email: string;
  exists: boolean;
  isOnboarded: boolean;
  role: UserRole | null;
  profile: SessionProfile | null;
  preferences: SessionPreferences;
  learningState: LearningState;
};

export type VerifyOtpResult = {
  success?: boolean;
  message?: string;
  session: AppSession;
};

export type OnboardingPayload = {
  email: string;
  role: UserRole;
  fullName: string;
  phone: string;
  avatar?: string;
  course?: string;
  year?: string;
  semester?: string;
  department?: string;
  designation?: string;
};

export type ProfileUpdatePayload = {
  email: string;
  fullName: string;
  phone: string;
  avatar?: string;
  course?: string;
  year?: string;
  semester?: string;
  department?: string;
  designation?: string;
};

export type FacultyDashboardData = {
  facultyProfile: SessionProfile;
  stats: {
    studentCount: number;
    facultyCount: number;
    newUsersThisWeek: number;
  };
  recentOnboardings: SessionProfile[];
  assignedSubjects: string[];
};

const SESSION_STORAGE_KEY = "lernoSession";
const THEME_STORAGE_KEY = "lernoTheme";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "lernoSidebarCollapsed";
const RECENT_TOPICS_STORAGE_KEY = "lernoRecentTopics";
const BOOKMARKED_TOPICS_STORAGE_KEY = "lernoBookmarkedTopics";
const PENDING_SIGNUP_ROLE_STORAGE_KEY = "lernoPendingSignupRole";

function normalizeTopic(topic: SavedTopic): SavedTopic | null {
  const title = topic?.title?.trim();
  if (!title) return null;

  return {
    title,
    videoUrl: topic.videoUrl || "",
    narration: topic.narration || "",
    subjectTitle: topic.subjectTitle || "",
    unitTitle: topic.unitTitle || "",
    unitTopics: Array.isArray(topic.unitTopics) ? topic.unitTopics : [],
    lastVisitedAt: typeof topic.lastVisitedAt === "number" ? topic.lastVisitedAt : Date.now(),
  };
}

function normalizeSession(input: Partial<AppSession> & { email: string }): AppSession {
  const preferences = input.preferences || {
    theme: "dark",
    sidebarCollapsed: false,
  };
  const learningState = input.learningState || {
    recentTopics: [],
    bookmarkedTopics: [],
    currentSelection: {},
  };

  return {
    isAuthenticated: input.isAuthenticated ?? true,
    email: input.email.trim().toLowerCase(),
    exists: Boolean(input.exists),
    isOnboarded: Boolean(input.isOnboarded),
    role: input.role || null,
    profile: input.profile || null,
    preferences: {
      theme: preferences.theme === "light" ? "light" : "dark",
      sidebarCollapsed: Boolean(preferences.sidebarCollapsed),
    },
    learningState: {
      recentTopics: Array.isArray(learningState.recentTopics)
        ? learningState.recentTopics.map(normalizeTopic).filter(Boolean) as SavedTopic[]
        : [],
      bookmarkedTopics: Array.isArray(learningState.bookmarkedTopics)
        ? learningState.bookmarkedTopics.map(normalizeTopic).filter(Boolean) as SavedTopic[]
        : [],
      currentSelection: {
        title: learningState.currentSelection?.title || "",
        videoUrl: learningState.currentSelection?.videoUrl || "",
        narration: learningState.currentSelection?.narration || "",
        subjectTitle: learningState.currentSelection?.subjectTitle || "",
        unitTitle: learningState.currentSelection?.unitTitle || "",
        unitTopics: Array.isArray(learningState.currentSelection?.unitTopics)
          ? learningState.currentSelection.unitTopics
          : [],
      },
      updatedAt: learningState.updatedAt,
    },
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.detail || data?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function applySessionToLocalStorage(session: AppSession) {
  const normalized = normalizeSession(session);
  const profile = normalized.profile;
  const avatar =
    profile?.avatar ||
    `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${encodeURIComponent(normalized.email)}`;
  const displayName =
    profile?.fullName || normalized.email.split("@")[0] || "Lerno User";

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized));
  localStorage.setItem("isLoggedIn", normalized.isAuthenticated ? "true" : "false");
  localStorage.setItem("userEmail", normalized.email);
  localStorage.setItem("userRole", normalized.role || "");
  localStorage.setItem("isOnboarded", normalized.isOnboarded ? "true" : "false");
  localStorage.setItem("userName", displayName);
  localStorage.setItem("profileName", displayName);
  localStorage.setItem("userAvatar", avatar);
  localStorage.setItem("profileAvatar", avatar);
  localStorage.setItem("profilePhone", profile?.phone || "");
  localStorage.setItem("userPhone", profile?.phone || "");
  localStorage.setItem(THEME_STORAGE_KEY, normalized.preferences.theme);
  localStorage.setItem(
    SIDEBAR_COLLAPSED_STORAGE_KEY,
    normalized.preferences.sidebarCollapsed ? "true" : "false"
  );
  localStorage.setItem(
    RECENT_TOPICS_STORAGE_KEY,
    JSON.stringify(normalized.learningState.recentTopics)
  );
  localStorage.setItem(
    BOOKMARKED_TOPICS_STORAGE_KEY,
    JSON.stringify(normalized.learningState.bookmarkedTopics)
  );

  const current = normalized.learningState.currentSelection;
  localStorage.setItem("selectedTopicTitle", current.title || "");
  localStorage.setItem("selectedTopicVideoUrl", current.videoUrl || "");
  localStorage.setItem("selectedTopicNarration", current.narration || "");
  localStorage.setItem("selectedTopicSubjectTitle", current.subjectTitle || "");
  localStorage.setItem("selectedTopicUnitTitle", current.unitTitle || "");
  localStorage.setItem("selectedTopicUnitTopics", JSON.stringify(current.unitTopics || []));
}

export function cacheSession(session: AppSession) {
  applySessionToLocalStorage(session);
}

export function getCachedSession(): AppSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (raw) {
    try {
      return normalizeSession(JSON.parse(raw));
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  const email = localStorage.getItem("userEmail");
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  if (!email || !isLoggedIn) return null;

  const role = (localStorage.getItem("userRole") as UserRole | null) || null;
  const isOnboarded = localStorage.getItem("isOnboarded") === "true";

  return normalizeSession({
    email,
    isAuthenticated: true,
    exists: true,
    isOnboarded,
    role,
    profile: role
      ? {
          uid: email,
          email,
          role,
          fullName: localStorage.getItem("profileName") || email.split("@")[0],
          phone: localStorage.getItem("profilePhone") || "",
          avatar:
            localStorage.getItem("profileAvatar") ||
            `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${encodeURIComponent(email)}`,
          isOnboarded,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      : null,
    preferences: {
      theme: localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark",
      sidebarCollapsed: localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true",
    },
    learningState: {
      recentTopics: JSON.parse(localStorage.getItem(RECENT_TOPICS_STORAGE_KEY) || "[]"),
      bookmarkedTopics: JSON.parse(
        localStorage.getItem(BOOKMARKED_TOPICS_STORAGE_KEY) || "[]"
      ),
      currentSelection: {
        title: localStorage.getItem("selectedTopicTitle") || "",
        videoUrl: localStorage.getItem("selectedTopicVideoUrl") || "",
        narration: localStorage.getItem("selectedTopicNarration") || "",
        subjectTitle: localStorage.getItem("selectedTopicSubjectTitle") || "",
        unitTitle: localStorage.getItem("selectedTopicUnitTitle") || "",
        unitTopics: JSON.parse(localStorage.getItem("selectedTopicUnitTopics") || "[]"),
      },
    },
  });
}

export function clearCachedSession() {
  [
    SESSION_STORAGE_KEY,
    THEME_STORAGE_KEY,
    SIDEBAR_COLLAPSED_STORAGE_KEY,
    RECENT_TOPICS_STORAGE_KEY,
    BOOKMARKED_TOPICS_STORAGE_KEY,
    "userEmail",
    "isLoggedIn",
    "userRole",
    "isOnboarded",
    "userName",
    "userAvatar",
    "userPhone",
    "profileName",
    "profilePhone",
    "profileAvatar",
    "selectedCourse",
    "selectedYear",
    "selectedSubject",
    "selectedTopic",
    "selectedTopicTitle",
    "selectedTopicVideoUrl",
    "selectedTopicNarration",
    "selectedTopicSubjectTitle",
    "selectedTopicUnitTitle",
    "selectedTopicUnitTopics",
    PENDING_SIGNUP_ROLE_STORAGE_KEY,
  ].forEach((key) => localStorage.removeItem(key));
}

export function setPendingSignupRole(role: UserRole) {
  localStorage.setItem(PENDING_SIGNUP_ROLE_STORAGE_KEY, role);
}

export function getPendingSignupRole(): UserRole | null {
  const value = localStorage.getItem(PENDING_SIGNUP_ROLE_STORAGE_KEY);
  return value === "student" || value === "faculty" ? value : null;
}

export function clearPendingSignupRole() {
  localStorage.removeItem(PENDING_SIGNUP_ROLE_STORAGE_KEY);
}

export function getDefaultRouteForSession(session: AppSession | null) {
  if (!session?.isAuthenticated) return "/login";
  if (!session.isOnboarded) return "/onboarding";
  if (session.role === "faculty") return "/faculty";
  return "/learning";
}

export async function verifyOtpAndBootstrap(email: string, otp: string) {
  const response = await fetch(`${API_BASE_URL}/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });

  const data = await parseResponse<VerifyOtpResult>(response);
  cacheSession(data.session);
  return data;
}

export async function fetchSession(email: string) {
  const response = await fetch(
    `${API_BASE_URL}/session/me?email=${encodeURIComponent(email.trim().toLowerCase())}`
  );
  const data = await parseResponse<{ success?: boolean; session: AppSession }>(response);
  cacheSession(data.session);
  return data.session;
}

export async function completeOnboarding(payload: OnboardingPayload) {
  const response = await fetch(`${API_BASE_URL}/onboarding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseResponse<{ success?: boolean; session: AppSession }>(response);
  cacheSession(data.session);
  return data.session;
}

export async function updateProfile(payload: ProfileUpdatePayload) {
  const response = await fetch(`${API_BASE_URL}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseResponse<{ success?: boolean; session: AppSession }>(response);
  cacheSession(data.session);
  return data.session;
}

export async function updatePreferences(payload: {
  email: string;
  theme?: ThemeMode;
  sidebarCollapsed?: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseResponse<{ success?: boolean; session: AppSession }>(response);
  cacheSession(data.session);
  return data.session;
}

export async function updateLearningState(payload: {
  email: string;
  recentTopics?: SavedTopic[];
  bookmarkedTopics?: SavedTopic[];
  currentSelection?: LearningSelection;
}) {
  const response = await fetch(`${API_BASE_URL}/learning-state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseResponse<{ success?: boolean; session: AppSession }>(response);
  cacheSession(data.session);
  return data.session;
}

export async function fetchFacultyDashboard(email: string) {
  const response = await fetch(
    `${API_BASE_URL}/faculty/dashboard?email=${encodeURIComponent(email.trim().toLowerCase())}`
  );
  return parseResponse<FacultyDashboardData>(response);
}
