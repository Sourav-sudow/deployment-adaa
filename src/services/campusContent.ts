import { API_BASE_URL } from "./apiBaseUrl";
import {
  buildCoursesDataFromContentPack,
  getStarterContentPack,
  type CampusContentPack,
  type CampusSelection,
} from "./campusData";

export async function fetchCampusContentPack(
  selection: CampusSelection,
  options?: { includeUnpublished?: boolean; email?: string }
): Promise<CampusContentPack | null> {
  if (!selection.programId || !selection.termId) {
    return getStarterContentPack(selection);
  }

  const params = new URLSearchParams({
    universityId: selection.universityId || "",
    universitySlug: selection.universitySlug || "",
    departmentId: selection.departmentId || "",
    programId: selection.programId,
    termId: selection.termId,
  });
  if (options?.includeUnpublished) {
    params.set("includeUnpublished", "true");
    if (options.email) {
      params.set("email", options.email);
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/content-pack?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.detail || data?.message || "Failed to load campus content.");
    }
    return (data?.contentPack as CampusContentPack) || getStarterContentPack(selection);
  } catch {
    return getStarterContentPack(selection);
  }
}

export function getCoursesDataForSelection(selection: CampusSelection) {
  return buildCoursesDataFromContentPack(getStarterContentPack(selection));
}
