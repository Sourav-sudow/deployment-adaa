import { API_BASE_URL } from "./apiBaseUrl";

export type TopicVideoOverride = {
  subjectTitle: string;
  unitTitle: string;
  topicTitle: string;
  videoUrl: string;
  updatedByFaculty: string;
  updatedAt: number;
};

function normalizeEmbedUrl(url: string): string {
  if (!url) return "";
  if (url.includes("youtube.com/embed/")) return url;

  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/i);
  if (shortMatch?.[1]) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }

  const watchMatch = url.match(/[?&]v=([^?&/]+)/i);
  if (watchMatch?.[1]) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`;
  }

  const idMatch = url.match(/^([a-zA-Z0-9_-]{11})$/);
  if (idMatch?.[1]) {
    return `https://www.youtube.com/embed/${idMatch[1]}`;
  }

  return "";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed.");
  }
  return data as T;
}

export async function fetchTopicVideoOverride(input: {
  subjectTitle?: string;
  unitTitle?: string;
  topicTitle: string;
}) {
  if (!input.subjectTitle || !input.unitTitle || !input.topicTitle) {
    return null;
  }

  const params = new URLSearchParams({
    subjectTitle: input.subjectTitle,
    unitTitle: input.unitTitle,
    topicTitle: input.topicTitle,
  });

  const response = await fetch(`${API_BASE_URL}/topic-video-override?${params.toString()}`);
  const data = await parseResponse<{ success?: boolean; override: TopicVideoOverride | null }>(
    response
  );

  if (!data.override?.videoUrl) return null;
  return {
    ...data.override,
    videoUrl: normalizeEmbedUrl(data.override.videoUrl) || data.override.videoUrl,
  };
}

export async function saveTopicVideoOverride(input: {
  facultyEmail: string;
  subjectTitle: string;
  unitTitle: string;
  topicTitle: string;
  videoUrl: string;
}) {
  const normalized = normalizeEmbedUrl(input.videoUrl) || input.videoUrl.trim();

  const response = await fetch(`${API_BASE_URL}/topic-video-override`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      videoUrl: normalized,
    }),
  });

  return parseResponse<{ success?: boolean; message?: string }>(response);
}

export async function listTopicVideoOverrides(email: string) {
  const params = new URLSearchParams({ email });
  const response = await fetch(`${API_BASE_URL}/topic-video-overrides?${params.toString()}`);
  const data = await parseResponse<{ success?: boolean; overrides: TopicVideoOverride[] }>(
    response
  );
  return data.overrides || [];
}
