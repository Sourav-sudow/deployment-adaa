import { API_BASE_URL } from "./apiBaseUrl";
import {
  findUniversityByEmailDomain,
  getDepartmentsForUniversity,
  getProgramsForDepartment,
  getTermsForProgram,
  type CampusSelection,
} from "./campusData";

export type UserRole = "student" | "faculty";
export type ThemeMode = "dark" | "light";
export type VerificationStatus = "unverified" | "otp_verified" | "trusted_domain";

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
  universityId?: string;
  universitySlug?: string;
  universityName?: string;
  departmentId?: string;
  departmentName?: string;
  programId?: string;
  programName?: string;
  termId?: string;
  termName?: string;
  verificationStatus?: VerificationStatus | string;
  referralCode?: string;
  referredByCode?: string;
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
  universityId?: string;
  universitySlug?: string;
  departmentId?: string;
  programId?: string;
  termId?: string;
  verificationStatus?: VerificationStatus | string;
  referralCode?: string;
};

export type PendingSignupContext = CampusSelection & {
  email?: string;
  role?: UserRole;
  departmentName?: string;
  programName?: string;
  termName?: string;
  verificationStatus?: VerificationStatus | string;
  referredByCode?: string;
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
  universityId?: string;
  universitySlug?: string;
  departmentId?: string;
  programId?: string;
  termId?: string;
  verificationStatus?: VerificationStatus | string;
  referralCode?: string;
  referredByCode?: string;
  otpChannel?: "email";
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
  universityId?: string;
  universitySlug?: string;
  departmentId?: string;
  programId?: string;
  termId?: string;
  verificationStatus?: VerificationStatus | string;
  referralCode?: string;
  referredByCode?: string;
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
const PENDING_SIGNUP_CONTEXT_STORAGE_KEY = "lernoPendingSignupContext";

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

function normalizePendingSignupContext(
  input: Partial<PendingSignupContext>
): PendingSignupContext | null {
  const email = input.email?.trim().toLowerCase() || "";
  const role = input.role === "faculty" || input.role === "student" ? input.role : undefined;
  const universityId = input.universityId?.trim() || "";
  const universitySlug = input.universitySlug?.trim() || "";
  const departmentId = input.departmentId?.trim() || "";
  const programId = input.programId?.trim() || "";
  const termId = input.termId?.trim() || "";

  if (!email && !role && !universityId && !departmentId && !programId && !termId) {
    return null;
  }

  return {
    email,
    role,
    universityId,
    universitySlug,
    departmentId,
    programId,
    termId,
    departmentName: input.departmentName || "",
    programName: input.programName || "",
    termName: input.termName || "",
    referralCode: input.referralCode || "",
    referredByCode: input.referredByCode || "",
    verificationStatus: input.verificationStatus || "otp_verified",
  };
}

function normalizeProfile(
  profile: Partial<SessionProfile> | null | undefined,
  email: string,
  role: UserRole | null
): SessionProfile | null {
  if (!profile || !role) return null;

  return {
    uid: profile.uid || email,
    email,
    role,
    fullName: profile.fullName || email.split("@")[0] || "Lerno User",
    phone: profile.phone || "",
    avatar:
      profile.avatar ||
      `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${encodeURIComponent(email)}`,
    isOnboarded: Boolean(profile.isOnboarded),
    course: profile.course || profile.programName || "",
    year: profile.year || "",
    semester: profile.semester || profile.termName || "",
    department: profile.department || profile.departmentName || "",
    designation: profile.designation || "",
    universityId: profile.universityId || "",
    universitySlug: profile.universitySlug || "",
    universityName: profile.universityName || "",
    departmentId: profile.departmentId || "",
    departmentName: profile.departmentName || "",
    programId: profile.programId || "",
    programName: profile.programName || "",
    termId: profile.termId || "",
    termName: profile.termName || "",
    verificationStatus: (profile.verificationStatus || "unverified") as VerificationStatus | string,
    referralCode: profile.referralCode || "",
    referredByCode: profile.referredByCode || "",
    createdAt: typeof profile.createdAt === "number" ? profile.createdAt : Date.now(),
    updatedAt: typeof profile.updatedAt === "number" ? profile.updatedAt : Date.now(),
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
  const email = input.email.trim().toLowerCase();
  const role =
    input.role === "student" || input.role === "faculty" ? input.role : null;
  const profile = normalizeProfile(input.profile, email, role);

  return {
    isAuthenticated: input.isAuthenticated ?? true,
    email,
    exists: Boolean(input.exists),
    isOnboarded: Boolean(input.isOnboarded),
    role,
    profile,
    preferences: {
      theme: preferences.theme === "light" ? "light" : "dark",
      sidebarCollapsed: Boolean(preferences.sidebarCollapsed),
    },
    learningState: {
      recentTopics: Array.isArray(learningState.recentTopics)
        ? (learningState.recentTopics.map(normalizeTopic).filter(Boolean) as SavedTopic[])
        : [],
      bookmarkedTopics: Array.isArray(learningState.bookmarkedTopics)
        ? (learningState.bookmarkedTopics.map(normalizeTopic).filter(Boolean) as SavedTopic[])
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
    universityId: input.universityId || profile?.universityId || "",
    universitySlug: input.universitySlug || profile?.universitySlug || "",
    departmentId: input.departmentId || profile?.departmentId || "",
    programId: input.programId || profile?.programId || "",
    termId: input.termId || profile?.termId || "",
    verificationStatus:
      input.verificationStatus || profile?.verificationStatus || "unverified",
    referralCode: input.referralCode || profile?.referralCode || "",
  };
}

function buildTrustedDomainFallbackSession(email: string): AppSession | null {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) return null;

  const university = findUniversityByEmailDomain(normalizedEmail);
  if (!university) {
    return null;
  }

  const department = getDepartmentsForUniversity(university.id)[0] || null;
  const program = department ? getProgramsForDepartment(university.id, department.id)[0] || null : null;
  const term = program ? getTermsForProgram(university.id, department?.id, program.id)[0] || null : null;

  return normalizeSession({
    email: normalizedEmail,
    isAuthenticated: true,
    exists: true,
    isOnboarded: true,
    role: "student",
    profile: {
      uid: normalizedEmail,
      email: normalizedEmail,
      role: "student",
      fullName: normalizedEmail.split("@")[0] || university.shortName || "Learner",
      phone: "",
      avatar: `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${encodeURIComponent(normalizedEmail)}`,
      isOnboarded: true,
      universityId: university.id,
      universitySlug: university.slug,
      universityName: university.name,
      departmentId: department?.id || "",
      departmentName: department?.name || "",
      programId: program?.id || "",
      programName: program?.name || "",
      termId: term?.id || "",
      termName: term?.name || "",
      verificationStatus: "trusted_domain",
      referralCode: "",
      referredByCode: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    preferences: {
      theme: "dark",
      sidebarCollapsed: false,
    },
    learningState: {
      recentTopics: [],
      bookmarkedTopics: [],
      currentSelection: {
        title: "",
        videoUrl: "",
        narration: "",
        subjectTitle: "",
        unitTitle: "",
        unitTopics: [],
      },
    },
    universityId: university.id,
    universitySlug: university.slug,
    departmentId: department?.id || "",
    programId: program?.id || "",
    termId: term?.id || "",
    verificationStatus: "trusted_domain",
  });
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
    "lernoCompletedPracticeTopics",
    PENDING_SIGNUP_CONTEXT_STORAGE_KEY,
  ].forEach((key) => localStorage.removeItem(key));
}

export function setPendingSignupContext(context: PendingSignupContext) {
  const normalized = normalizePendingSignupContext(context);
  if (!normalized) return;
  localStorage.setItem(PENDING_SIGNUP_CONTEXT_STORAGE_KEY, JSON.stringify(normalized));
}

export function getPendingSignupContext(): PendingSignupContext | null {
  const raw = localStorage.getItem(PENDING_SIGNUP_CONTEXT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizePendingSignupContext(JSON.parse(raw));
  } catch {
    localStorage.removeItem(PENDING_SIGNUP_CONTEXT_STORAGE_KEY);
    return null;
  }
}

export function clearPendingSignupContext() {
  localStorage.removeItem(PENDING_SIGNUP_CONTEXT_STORAGE_KEY);
}

export function setPendingSignupRole(role: UserRole) {
  const current = getPendingSignupContext() || {};
  setPendingSignupContext({ ...current, role });
}

export function getPendingSignupRole(): UserRole | null {
  const role = getPendingSignupContext()?.role;
  return role === "student" || role === "faculty" ? role : null;
}

export function clearPendingSignupRole() {
  clearPendingSignupContext();
}

export function getDefaultRouteForSession(session: AppSession | null) {
  if (!session?.isAuthenticated) return "/login";
  if (!session.isOnboarded) return "/onboarding";
  if (session.role === "faculty") return "/faculty";
  return "/learning";
}

export function getCampusSelectionFromSession(
  session: AppSession | null
): CampusSelection & { verificationStatus?: VerificationStatus | string } {
  return {
    universityId: session?.universityId || session?.profile?.universityId || "",
    universitySlug: session?.universitySlug || session?.profile?.universitySlug || "",
    departmentId: session?.departmentId || session?.profile?.departmentId || "",
    programId: session?.programId || session?.profile?.programId || "",
    termId: session?.termId || session?.profile?.termId || "",
    referralCode: session?.referralCode || session?.profile?.referralCode || "",
    verificationStatus:
      session?.verificationStatus || session?.profile?.verificationStatus || "unverified",
  };
}

export async function verifyOtpAndBootstrap(payload: {
  email: string;
  otp: string;
  mode?: "login" | "signup";
  role?: UserRole;
  universityId?: string;
  universitySlug?: string;
  departmentId?: string;
  programId?: string;
  termId?: string;
  referralCode?: string;
  referredByCode?: string;
  otpChannel?: "email";
}) {
  const response = await fetch(`${API_BASE_URL}/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await parseResponse<VerifyOtpResult>(response);
  cacheSession(data.session);
  return data;
}

export async function fetchSession(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const response = await fetch(
      `${API_BASE_URL}/session/me?email=${encodeURIComponent(normalizedEmail)}`
    );
    const data = await parseResponse<{ success?: boolean; session: AppSession }>(response);
    cacheSession(data.session);
    return data.session;
  } catch (error) {
    const message = (error as Error).message || "";
    const fallbackSession =
      message.toLowerCase().includes("firestore") && buildTrustedDomainFallbackSession(normalizedEmail);

    if (fallbackSession) {
      cacheSession(fallbackSession);
      return fallbackSession;
    }

    throw error;
  }
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
