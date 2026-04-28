import { API_BASE_URL } from "./apiBaseUrl";

export type LeaderboardEntry = {
  rank: number;
  email: string;
  fullName: string;
  avatar: string;
  value: number;
  label: string;
};

export type CampusGrowthData = {
  leaderboards: {
    referrals: LeaderboardEntry[];
    streaks: LeaderboardEntry[];
    quizzes: LeaderboardEntry[];
  };
  ambassadorMetrics: {
    inviteCount: number;
    referralCode: string;
    topSharedContent: Array<{ topicTitle: string; shares: number }>;
    weeklyActivationProgress: {
      activeStudents: number;
      targetStudents: number;
      progressPercent: number;
    };
    streakDays: number;
    quizzesCompleted: number;
  };
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed.");
  }
  return data as T;
}

export async function fetchCampusGrowth(email: string) {
  const params = new URLSearchParams({ email });
  const response = await fetch(`${API_BASE_URL}/campus/growth?${params.toString()}`);
  return parseResponse<{ success?: boolean } & CampusGrowthData>(response);
}
