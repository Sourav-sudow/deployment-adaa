import { API_BASE_URL } from "./apiBaseUrl";
import type { CampusSubject } from "./campusData";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed.");
  }
  return data as T;
}

async function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64 = ""] = result.split(",", 2);
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read syllabus file."));
    reader.readAsDataURL(file);
  });
}

export async function importSyllabusPayload(input: {
  facultyEmail: string;
  universityId?: string;
  universitySlug?: string;
  departmentId?: string;
  programId: string;
  termId: string;
  sourceText?: string;
  file?: File | null;
}) {
  const fileContentBase64 = input.file ? await toBase64(input.file) : "";
  const response = await fetch(`${API_BASE_URL}/admin/syllabus-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facultyEmail: input.facultyEmail,
      universityId: input.universityId || "",
      universitySlug: input.universitySlug || "",
      departmentId: input.departmentId || "",
      programId: input.programId,
      termId: input.termId,
      sourceText: input.sourceText || "",
      fileName: input.file?.name || "",
      fileContentBase64,
    }),
  });

  return parseResponse<{
    success?: boolean;
    subjects: CampusSubject[];
    suggestedPackName: string;
    previewText: string;
    detectedCounts: {
      subjects: number;
      topics: number;
    };
  }>(response);
}
