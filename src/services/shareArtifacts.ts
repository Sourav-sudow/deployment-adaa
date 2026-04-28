import { API_BASE_URL } from "./apiBaseUrl";

export type ShareArtifactType = "topic" | "notes" | "explainer" | "quiz";

export type ShareArtifact = {
  id: string;
  artifactType: ShareArtifactType;
  shareTitle: string;
  shareText: string;
  topicTitle: string;
  subjectTitle: string;
  unitTitle: string;
  universityId: string;
  universitySlug: string;
  universityName: string;
  referralCode: string;
  createdAt: number;
  payload: {
    notes: string[];
    narration: string;
    fiveMarkQuestions: string[];
    tenMarkQuestions: string[];
    summary: string;
  };
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed.");
  }
  return data as T;
}

export async function createShareArtifact(input: {
  email: string;
  artifactType: ShareArtifactType;
  topicTitle: string;
  subjectTitle?: string;
  unitTitle?: string;
  shareTitle?: string;
  shareText?: string;
  universityId?: string;
  universitySlug?: string;
  departmentId?: string;
  programId?: string;
  termId?: string;
  referralCode?: string;
  payload?: Record<string, unknown>;
}) {
  const response = await fetch(`${API_BASE_URL}/share-artifacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse<{ success?: boolean; shareArtifact: ShareArtifact }>(response);
}

export async function fetchShareArtifact(shareId: string) {
  const response = await fetch(`${API_BASE_URL}/share-artifacts/${encodeURIComponent(shareId)}`);
  return parseResponse<{ success?: boolean; shareArtifact: ShareArtifact }>(response);
}
