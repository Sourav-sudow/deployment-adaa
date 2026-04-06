const TUTOR_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const OPENROUTER_TUTOR_MODEL =
  import.meta.env.VITE_OPENROUTER_TUTOR_MODEL || "openrouter/auto";

type TutorRequest = {
  topic: string;
  question: string;
  lessonContent?: string;
};

function buildTutorPrompt(topic: string, question: string, lessonContent?: string) {
  const lessonContext = lessonContent?.trim()
    ? `Lesson context:\n${lessonContent.trim()}`
    : "Lesson context unavailable.";

  return `You are Lerno AI Tutor for the topic "${topic}".

Rules:
- Answer only questions related to the current topic or lesson context.
- If the user goes off-topic, politely redirect them back to "${topic}".
- Explain in simple English with a friendly teaching tone.
- Prefer short sections, bullets, and small examples over one long paragraph.
- Keep the answer concise unless the user asks for detail.
- When useful, use headings like "Quick answer", "Key points", and "Example".

${lessonContext}

Student question:
${question}`;
}

async function askGemini(topic: string, question: string, lessonContent: string | undefined, apiKey: string) {
  const prompt = buildTutorPrompt(topic, question, lessonContent);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(TUTOR_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 320,
        },
      }),
    }
  );

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    const fallback = await res.text();
    throw new Error(`Gemini tutor parse error: ${fallback}`);
  }

  if (!res.ok) {
    const d = data as { error?: { message?: string; status?: string } };
    const errText =
      d?.error?.message || d?.error?.status || JSON.stringify(data);
    throw new Error(`Gemini tutor error ${res.status}: ${errText}`);
  }

  const d = data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };

  const content =
    d?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("") || "";

  if (!content || !String(content).trim()) {
    const detail =
      d?.promptFeedback?.blockReason ||
      d?.error?.message ||
      "Tutor response was empty. Check your Gemini model/key env settings.";
    throw new Error(detail);
  }

  return String(content).trim();
}

async function askOpenRouter(
  topic: string,
  question: string,
  lessonContent: string | undefined,
  apiKey: string
) {
  const lessonContext = lessonContent?.trim()
    ? `Lesson context:\n${lessonContent.trim()}`
    : "Lesson context unavailable.";

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "http://localhost",
      "X-Title": "Lerno AI Tutor",
    },
    body: JSON.stringify({
      model: OPENROUTER_TUTOR_MODEL,
      messages: [
        {
          role: "system",
          content: `You are Lerno AI Tutor for the topic "${topic}".

Rules:
- Answer only questions related to the current topic or lesson context.
- If the user goes off-topic, politely redirect them back to "${topic}".
- Explain in simple English with a friendly teaching tone.
- Prefer short sections, bullets, and small examples over one long paragraph.
- Keep the answer concise unless the user asks for detail.
- When useful, use headings like "Quick answer", "Key points", and "Example".`,
        },
        {
          role: "system",
          content: lessonContext,
        },
        {
          role: "user",
          content: question,
        },
      ],
      max_tokens: 320,
      temperature: 0.6,
    }),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(
      data?.error?.message || `OpenRouter tutor error ${res.status}`
    );
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenRouter tutor returned an empty response.");
  }

  return text;
}

export async function askAITutor({
  topic,
  question,
  lessonContent,
}: TutorRequest) {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  const openRouterKey = import.meta.env.VITE_OPENROUTER_API_KEY?.trim();

  if (geminiKey) {
    return askGemini(topic, question, lessonContent, geminiKey);
  }

  if (openRouterKey) {
    return askOpenRouter(topic, question, lessonContent, openRouterKey);
  }

  throw new Error(
    "Add VITE_GEMINI_API_KEY or VITE_OPENROUTER_API_KEY to .env.local (project root), then restart npm run dev."
  );
}
