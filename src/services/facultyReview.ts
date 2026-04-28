import { API_BASE_URL } from "./apiBaseUrl";

export type ReviewInboxItem = {
  id: string;
  name: string;
  universityId: string;
  universityName: string;
  departmentName: string;
  programName: string;
  termName: string;
  reviewStatus: "draft" | "review" | "approved";
  reviewNotes: string;
  generatedByAI: boolean;
  subjectCount: number;
  unitCount: number;
  topicCount: number;
  source: string;
  ingestedBy: string;
  reviewedBy: string;
  reviewedAt: number;
  updatedAt: number;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed.");
  }
  return data as T;
}

export async function fetchFacultyReviewInbox(email: string) {
  const params = new URLSearchParams({ email });
  const response = await fetch(`${API_BASE_URL}/faculty/review-inbox?${params.toString()}`);
  return parseResponse<{
    success?: boolean;
    pendingItems: ReviewInboxItem[];
    recentApproved: ReviewInboxItem[];
  }>(response);
}

export async function applyFacultyReviewAction(input: {
  facultyEmail: string;
  contentPackId: string;
  action: "approve" | "request_changes" | "save_draft";
  reviewNotes?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/faculty/review-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<{ success?: boolean; contentPack: ReviewInboxItem }>(response);
}
