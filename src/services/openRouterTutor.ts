import {
  compressModelContext,
  createOpenRouterChatCompletion,
  getOpenRouterApiKeys,
  getOpenRouterMaxTokens,
} from "./openRouterClient";

const TUTOR_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const OPENROUTER_TUTOR_MODEL =
  import.meta.env.VITE_OPENROUTER_TUTOR_MODEL || "openrouter/auto";

type TutorRequest = {
  topic: string;
  question: string;
  lessonContent?: string;
};

function getLessonHints(lessonContent?: string) {
  return compressModelContext(lessonContent, 420)
    .split(/[.!?\n]+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 12)
    .slice(0, 3);
}

function buildFallbackTutorAnswer(topic: string, question: string, lessonContent?: string) {
  const normalizedQuestion = question.toLowerCase();
  const hints = getLessonHints(lessonContent);
  const topicName = topic || "this topic";

  if (
    normalizedQuestion.includes("viva") ||
    normalizedQuestion.includes("question")
  ) {
    return [
      `Here are quick viva questions for ${topicName}:`,
      "",
      `1. What is ${topicName}?`,
      `2. Why is ${topicName} important?`,
      `3. Where is ${topicName} used in real life?`,
      "",
      "Short answer tip: define it first, mention 2-3 key points, then give one simple example.",
    ].join("\n");
  }

  if (
    normalizedQuestion.includes("note") ||
    normalizedQuestion.includes("key point") ||
    normalizedQuestion.includes("bullet")
  ) {
    const points = hints.length
      ? hints
      : [
          `${topicName} is an important concept in this lesson.`,
          `Focus on its definition, components, uses, and examples.`,
          `Revise the advantages, limitations, and common exam questions.`,
        ];

    return [
      `Short notes on ${topicName}:`,
      "",
      ...points.map((point) => `- ${point}`),
      `- For exams, write a clear definition and support it with an example.`,
    ].join("\n");
  }

  if (
    normalizedQuestion.includes("summary") ||
    normalizedQuestion.includes("summarize")
  ) {
    return [
      `${topicName} summary:`,
      "",
      hints.length
        ? hints.join(" ")
        : `${topicName} explains the core idea, its purpose, and how it is applied in practical situations.`,
      "",
      "Remember it as: definition -> key parts -> example -> importance.",
    ].join("\n");
  }

  return [
    `Quick answer: ${topicName} is the main concept you are studying here.`,
    "",
    hints.length
      ? `From the lesson: ${hints.join(" ")}`
      : `To understand it, start with the definition, then learn the important parts and one real-life example.`,
    "",
    "Simple exam structure:",
    `- Define ${topicName}.`,
    "- Explain 2-3 key points.",
    "- Add one practical example.",
  ].join("\n");
}

function shouldFallbackToOpenRouter(error: unknown) {
  const message = (error as Error)?.message?.toLowerCase() || "";
  return (
    message.includes("gemini tutor error 429") ||
    message.includes("gemini tutor error 500") ||
    message.includes("gemini tutor error 502") ||
    message.includes("gemini tutor error 503") ||
    message.includes("gemini tutor error 504") ||
    message.includes("api key") ||
    message.includes("authentication") ||
    message.includes("authorization") ||
    message.includes("permission") ||
    message.includes("high demand") ||
    message.includes("try again later")
  );
}

function buildTutorPrompt(topic: string, question: string, lessonContent?: string) {
  const lessonContext = compressModelContext(lessonContent, 900);

  return `You are Lerno AI Tutor for the topic "${topic}".

Rules:
- Answer only questions related to the current topic or lesson context.
- If the user goes off-topic, politely redirect them back to "${topic}".
- Explain in simple English with a friendly teaching tone.
- Prefer short sections, bullets, and small examples over one long paragraph.
- Keep the answer concise unless the user asks for detail.
- When useful, use headings like "Quick answer", "Key points", and "Example".

${lessonContext ? `Lesson context:\n${lessonContext}` : "Lesson context unavailable."}

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
  lessonContent: string | undefined
) {
  const lessonContext = compressModelContext(lessonContent, 900);

  return createOpenRouterChatCompletion({
    model: OPENROUTER_TUTOR_MODEL,
    title: "Lerno AI Tutor",
    maxTokens: getOpenRouterMaxTokens("tutor"),
    minTokens: 96,
    temperature: 0.55,
    messages: [
      {
        role: "system",
        content:
          `You are Lerno AI Tutor for "${topic}". Stay on-topic, explain simply, use short sections, and keep the answer compact unless asked for more detail.`,
      },
      {
        role: "user",
        content: [
          `Topic: ${topic}`,
          lessonContext ? `Lesson context: ${lessonContext}` : "",
          `Student question: ${question}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
}

export async function askAITutor({
  topic,
  question,
  lessonContent,
}: TutorRequest) {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  const hasOpenRouterKey = getOpenRouterApiKeys().length > 0;

  if (geminiKey) {
    try {
      return await askGemini(topic, question, lessonContent, geminiKey);
    } catch (error) {
      if (hasOpenRouterKey && shouldFallbackToOpenRouter(error)) {
        try {
          return await askOpenRouter(topic, question, lessonContent);
        } catch (openRouterError) {
          console.warn("OpenRouter tutor fallback failed, using local fallback", openRouterError);
        }
      }
      console.warn("Gemini tutor request failed, using local fallback", error);
      return buildFallbackTutorAnswer(topic, question, lessonContent);
    }
  }

  if (hasOpenRouterKey) {
    try {
      return await askOpenRouter(topic, question, lessonContent);
    } catch (error) {
      console.warn("OpenRouter tutor request failed, using local fallback", error);
      return buildFallbackTutorAnswer(topic, question, lessonContent);
    }
  }

  return buildFallbackTutorAnswer(topic, question, lessonContent);
}
