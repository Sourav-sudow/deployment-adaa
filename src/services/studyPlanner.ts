import { API_BASE_URL } from "./apiBaseUrl";

export type StudyPlan = {
  mode: "exam_week" | "study_planner";
  daysUntilExam: number;
  examDate: string;
  urgency: "critical" | "high" | "steady";
  subjectTitle: string;
  priorityTopics: string[];
  completedTopics: string[];
  dailyPlan: Array<{
    dayLabel: string;
    date: string;
    focus: string;
    topicTitles: string[];
    minutes: number;
    checkpoint: string;
  }>;
  quickWins: string[];
  finalRevisionChecklist: string[];
  summary: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed.");
  }
  return data as T;
}

export async function buildStudyPlan(input: {
  email?: string;
  universityId?: string;
  universitySlug?: string;
  departmentId?: string;
  programId?: string;
  termId?: string;
  subjectTitle?: string;
  topicTitles: string[];
  completedPracticeTopics?: string[];
  examDate: string;
  dailyMinutes: number;
  confidenceLevel: "low" | "medium" | "high";
}) {
  const response = await fetch(`${API_BASE_URL}/study-planner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<{ success?: boolean; plan: StudyPlan }>(response);
}
