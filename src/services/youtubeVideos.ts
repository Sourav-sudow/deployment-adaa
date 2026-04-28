import topicVideos from "../../data/topicVideos.json";
import { fetchTopicVideoOverride } from "./topicVideoOverrides";

const VIDEO_CACHE_PREFIX = "lernoResolvedVideo::v2::";

type TopicVideoValue = string | string[];

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

function getMappedVideoUrl(title: string): string | null {
  const normalizedTitle = title.trim().toLowerCase();
  const subjects = Object.values(topicVideos || {}) as Record<string, Record<string, TopicVideoValue>>[];

  for (const subject of subjects) {
    for (const unit of Object.values(subject || {})) {
      for (const [topicName, value] of Object.entries(unit || {})) {
        if (topicName.trim().toLowerCase() !== normalizedTitle) continue;

        if (Array.isArray(value)) {
          return normalizeEmbedUrl(value[0] || "");
        }

        if (typeof value === "string") {
          return normalizeEmbedUrl(value);
        }
      }
    }
  }

  return null;
}

function parseYouTubeDurationToSeconds(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function scoreVideoTitle(title: string, topic: string): number {
  const t = title.toLowerCase();
  const q = topic.toLowerCase().trim();
  if (!q) return 0;

  let score = 0;
  if (t === `what is ${q}`) score += 1200;
  if (t.startsWith(`what is ${q}`)) score += 1000;
  if (t.includes(`what is ${q}`)) score += 850;
  if (t.includes(q)) score += 400;
  if (t.includes("tutorial") || t.includes("explained")) score += 80;
  if (t.includes("one shot") || t.includes("full course") || t.includes("complete")) score += 30;
  if (t.includes("shorts") || t.includes("#shorts")) score -= 1000;

  return score;
}

async function searchYoutubeVideo(input: { query: string; topic: string }): Promise<string | null> {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `${VIDEO_CACHE_PREFIX}${input.topic.toLowerCase().trim()}`;
  const cachedUrl = localStorage.getItem(cacheKey);
  if (cachedUrl) return cachedUrl;

  const runSearch = async (options: { embeddable: boolean; maxResults: number }) => {
    const params = new URLSearchParams({
      part: "snippet",
      maxResults: String(options.maxResults),
      q: input.query,
      type: "video",
      key: apiKey,
    });

    if (options.embeddable) {
      params.set("videoEmbeddable", "true");
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const items: Array<{ id?: { videoId?: string } }> = Array.isArray(data?.items)
      ? data.items
      : [];

    // Extract video IDs from search results
    const videoIds = items
      .map((item: { id?: { videoId?: string } }) => item?.id?.videoId)
      .filter((id: string | undefined): id is string => Boolean(id));

    if (videoIds.length === 0) return null;

    // Fetch details (statistics + duration + snippet) for all videos
    const statsParams = new URLSearchParams({
      part: "statistics,contentDetails,snippet",
      id: videoIds.join(","),
      key: apiKey,
    });

    try {
      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${statsParams.toString()}`
      );

      if (!statsResponse.ok) {
        // Fallback: return first valid video if stats fetch fails
        for (const item of items) {
          const videoId = item?.id?.videoId;
          const embedUrl = normalizeEmbedUrl(String(videoId || ""));
          if (embedUrl) {
            localStorage.setItem(cacheKey, embedUrl);
            return embedUrl;
          }
        }
        return null;
      }

      const statsData = await statsResponse.json();
      const statsItems = Array.isArray(statsData?.items) ? statsData.items : [];

      // Create a map of video ID to searchable metadata
      const statsMap: Record<
        string,
        { viewCount: number; likeCount: number; durationSec: number; title: string }
      > = {};
      for (const stat of statsItems) {
        const videoId = stat?.id;
        const viewCount = parseInt(stat?.statistics?.viewCount || "0", 10);
        const likeCount = parseInt(stat?.statistics?.likeCount || "0", 10);
        const durationSec = parseYouTubeDurationToSeconds(String(stat?.contentDetails?.duration || ""));
        const title = String(stat?.snippet?.title || "");
        if (videoId) {
          statsMap[videoId] = { viewCount, likeCount, durationSec, title };
        }
      }

      // Filter out shorts and rank by title relevance first, then popularity.
      const rankedVideos = videoIds
        .filter((videoId: string) => {
          const meta = statsMap[videoId];
          if (!meta) return false;
          if (meta.durationSec > 0 && meta.durationSec < 180) return false; // Shorts-like videos
          const loweredTitle = meta.title.toLowerCase();
          if (loweredTitle.includes("shorts") || loweredTitle.includes("#shorts")) return false;
          return true;
        })
        .map((videoId: string) => ({
          videoId,
          score:
            scoreVideoTitle(statsMap[videoId]?.title || "", input.topic) * 1000000 +
            (statsMap[videoId]?.viewCount || 0) +
            (statsMap[videoId]?.likeCount || 0) * 10,
        }))
        .sort((a: { videoId: string; score: number }, b: { videoId: string; score: number }) => b.score - a.score);

      // Return first ranked video
      if (rankedVideos.length > 0) {
        const topVideoId = rankedVideos[0].videoId;
        const embedUrl = normalizeEmbedUrl(topVideoId);
        if (embedUrl) {
          localStorage.setItem(cacheKey, embedUrl);
          return embedUrl;
        }
      }
    } catch (statsError) {
      console.warn("Failed to fetch video statistics:", statsError);
      // Fallback: return first video if stats fail
      for (const item of items) {
        const videoId = item?.id?.videoId;
        const embedUrl = normalizeEmbedUrl(String(videoId || ""));
        if (embedUrl) {
          localStorage.setItem(cacheKey, embedUrl);
          return embedUrl;
        }
      }
    }

    return null;
  };

  try {
    const strictResult = await runSearch({ embeddable: true, maxResults: 12 });
    if (strictResult) return strictResult;

    const relaxedResult = await runSearch({ embeddable: false, maxResults: 20 });
    if (relaxedResult) return relaxedResult;
  } catch (error) {
    console.warn("YouTube search failed for query:", input.query, error);
  }

  return null;
}

export async function resolveTopicVideo(input: {
  title: string;
  universityId?: string;
  subjectTitle?: string;
  unitTitle?: string;
}): Promise<string | null> {
  let override: Awaited<ReturnType<typeof fetchTopicVideoOverride>> = null;
  try {
    override = await fetchTopicVideoOverride({
      universityId: input.universityId,
      subjectTitle: input.subjectTitle,
      unitTitle: input.unitTitle,
      topicTitle: input.title,
    });
  } catch {
    // Production has no local FastAPI; failed fetch must not block JSON / YouTube fallbacks.
    override = null;
  }
  if (override?.videoUrl) {
    return override.videoUrl;
  }

  const mappedUrl = getMappedVideoUrl(input.title);
  if (mappedUrl) return mappedUrl;

  const searchTerms = [
    `what is ${input.title}`,
    `${input.title} tutorial`,
    `${input.title} explained`,
  ];

  for (const query of searchTerms) {
    const result = await searchYoutubeVideo({
      query: query.trim(),
      topic: input.title,
    });
    if (result) return result;
  }

  return null;
}

export { normalizeEmbedUrl };
