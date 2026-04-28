type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterChatRequest = {
  model: string;
  title: string;
  messages: OpenRouterMessage[];
  maxTokens: number;
  minTokens: number;
  temperature?: number;
  timeoutMs?: number;
};

type OpenRouterChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

class OpenRouterError extends Error {
  status: number;
  retriable: boolean;
  affordableTokens?: number;

  constructor(
    message: string,
    options?: { status?: number; retriable?: boolean; affordableTokens?: number }
  ) {
    super(message);
    this.name = "OpenRouterError";
    this.status = options?.status || 0;
    this.retriable = Boolean(options?.retriable);
    this.affordableTokens = options?.affordableTokens;
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt((value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isUsableApiKey(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  return ![
    "undefined",
    "null",
    "none",
    "false",
    "your_openrouter_api_key",
    "your-openrouter-api-key",
    "replace_me",
    "changeme",
  ].includes(normalized);
}

export function getOpenRouterApiKeys() {
  const envCandidates = [
    import.meta.env.VITE_OPENROUTER_API_KEY,
    import.meta.env.VITE_OPENROUTER_API_KEY_1,
    import.meta.env.VITE_OPENROUTER_API_KEY_2,
    import.meta.env.VITE_OPENROUTER_API_KEY_3,
    import.meta.env.VITE_OPENROUTER_API_KEYS,
  ];

  const keys = envCandidates
    .flatMap((entry) => String(entry || "").split(/[,\n]/g))
    .map((entry) => entry.trim())
    .filter(isUsableApiKey);

  return [...new Set(keys)];
}

export function getOpenRouterMaxTokens(kind: "tutor" | "exam" | "quiz") {
  if (kind === "tutor") {
    return parsePositiveInt(import.meta.env.VITE_OPENROUTER_TUTOR_MAX_TOKENS, 192);
  }
  if (kind === "exam") {
    return parsePositiveInt(import.meta.env.VITE_OPENROUTER_EXAM_MAX_TOKENS, 720);
  }
  return parsePositiveInt(import.meta.env.VITE_OPENROUTER_QUIZ_MAX_TOKENS, 360);
}

export function compressModelContext(context: string | undefined, maxChars = 900) {
  const normalized = (context || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;

  const head = normalized.slice(0, Math.max(0, Math.floor(maxChars * 0.68))).trim();
  const tail = normalized.slice(-Math.max(0, Math.floor(maxChars * 0.22))).trim();
  return `${head} ... ${tail}`.slice(0, maxChars + 5).trim();
}

function extractAffordableTokens(message: string) {
  const match = message.match(/can only afford\s+(\d+)/i);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isRetriableStatus(status: number) {
  return status === 401 || status === 402 || status === 429 || status >= 500;
}

function isRetriableMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("more credits") ||
    lower.includes("insufficient credits") ||
    lower.includes("rate limit") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("timed out")
  );
}

function normalizeAdaptiveTokens(requested: number, affordable: number, minimum: number) {
  const candidate = Math.min(requested - 16, affordable - 16, affordable);
  return Math.max(minimum, candidate);
}

async function callOpenRouterWithKey(
  apiKey: string,
  request: OpenRouterChatRequest,
  maxTokens: number,
  alreadyAdapted = false
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    request.timeoutMs || 20000
  );

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "HTTP-Referer":
          typeof window !== "undefined" ? window.location.origin : "http://localhost",
        "X-Title": request.title,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: maxTokens,
        temperature: request.temperature ?? 0.6,
      }),
      signal: controller.signal,
    });

    let data: OpenRouterChatResponse | null = null;
    try {
      data = (await response.json()) as OpenRouterChatResponse;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        data?.error?.message || `OpenRouter error ${response.status}`;
      const affordableTokens = extractAffordableTokens(message);

      if (
        !alreadyAdapted &&
        affordableTokens &&
        affordableTokens < maxTokens &&
        affordableTokens >= request.minTokens
      ) {
        return callOpenRouterWithKey(
          apiKey,
          request,
          normalizeAdaptiveTokens(maxTokens, affordableTokens, request.minTokens),
          true
        );
      }

      throw new OpenRouterError(message, {
        status: response.status,
        retriable: isRetriableStatus(response.status) || isRetriableMessage(message),
        affordableTokens,
      });
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new OpenRouterError("OpenRouter returned an empty response.", {
        retriable: false,
        status: response.status,
      });
    }

    return text;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new OpenRouterError("OpenRouter request timed out.", {
        retriable: true,
      });
    }
    if (error instanceof OpenRouterError) {
      throw error;
    }
    throw new OpenRouterError((error as Error)?.message || "OpenRouter request failed.", {
      retriable: true,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function createOpenRouterChatCompletion(request: OpenRouterChatRequest) {
  const keys = getOpenRouterApiKeys();
  if (!keys.length) {
    throw new Error(
      "Add VITE_OPENROUTER_API_KEY or VITE_OPENROUTER_API_KEY_1..3 to .env.local, then restart the app."
    );
  }

  let lastError: Error | null = null;
  for (const key of keys) {
    try {
      return await callOpenRouterWithKey(key, request, request.maxTokens);
    } catch (error) {
      lastError = error as Error;
      if (!(error instanceof OpenRouterError) || !error.retriable) {
        break;
      }
    }
  }

  throw (
    lastError ||
    new Error("OpenRouter request failed across all configured API keys.")
  );
}
