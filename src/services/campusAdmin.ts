import { API_BASE_URL } from "./apiBaseUrl";
import type { CampusContentPack } from "./campusData";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed.");
  }
  return data as T;
}

export async function upsertCampusContentPack(input: {
  facultyEmail: string;
  universityId?: string;
  universitySlug?: string;
  departmentId: string;
  programId: string;
  termId: string;
  packName?: string;
  reviewStatus?: "draft" | "review" | "approved";
  reviewNotes?: string;
  generatedByAI?: boolean;
  subjects: Array<Record<string, unknown>>;
}) {
  const response = await fetch(`${API_BASE_URL}/admin/content-pack`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      reviewStatus: input.reviewStatus || "approved",
    }),
  });

  return parseResponse<{ success?: boolean; contentPack: CampusContentPack }>(response);
}
