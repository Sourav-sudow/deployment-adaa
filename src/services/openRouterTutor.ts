import {
  compressModelContext,
  createOpenRouterChatCompletion,
  getOpenRouterApiKeys,
  getOpenRouterMaxTokens,
} from "./openRouterClient";
import { API_BASE_URL } from "./apiBaseUrl";

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
    .filter((line) => {
      const lower = line.toLowerCase();
      return (
        line.length > 12 &&
        !lower.includes("auto-selected from search query") &&
        !lower.includes("search query:")
      );
    })
    .slice(0, 3);
}

function isDbmsTopic(topic: string) {
  const normalized = topic.toLowerCase();
  return (
    normalized.includes("dbms") ||
    normalized.includes("database management") ||
    normalized.includes("database")
  );
}

function formatSections(sections: Array<{ title: string; body: string[] }>) {
  return sections
    .map((section) => [
      section.title,
      "",
      ...section.body,
    ].join("\n"))
    .join("\n\n");
}

function buildFallbackTutorAnswer(topic: string, question: string, lessonContent?: string) {
  const normalizedQuestion = question.toLowerCase();
  const hints = getLessonHints(lessonContent);
  const topicName = topic || "this topic";
  const dbms = isDbmsTopic(topicName);

  if (
    normalizedQuestion.includes("advantage") ||
    normalizedQuestion.includes("disadvantage") ||
    normalizedQuestion.includes("pros") ||
    normalizedQuestion.includes("cons")
  ) {
    if (dbms) {
      return formatSections([
        {
          title: "Quick answer",
          body: [
            "DBMS makes data easier to store, secure, share, and recover, but it can be costly and complex to manage.",
          ],
        },
        {
          title: "Advantages",
          body: [
            "- Reduces duplicate data and keeps records more consistent.",
            "- Allows many users to access the same database safely.",
            "- Improves security with user roles, permissions, and access control.",
            "- Supports backup and recovery if data is lost or corrupted.",
            "- Makes searching and updating data easier through SQL and queries.",
            "- Maintains integrity using constraints such as primary keys and foreign keys.",
          ],
        },
        {
          title: "Disadvantages",
          body: [
            "- Setup and maintenance can be expensive.",
            "- Needs skilled database administrators for tuning, backups, and security.",
            "- More complex than simple file storage for small applications.",
            "- If the DBMS server fails, many connected apps can be affected.",
            "- Performance can drop if database design, indexing, or queries are poor.",
          ],
        },
        {
          title: "Exam tip",
          body: [
            "For a 5-mark answer, write 3 advantages and 2 disadvantages with one example like a college student-record system.",
          ],
        },
      ]);
    }

    return formatSections([
      {
        title: "Quick answer",
        body: [
          `${topicName} is useful because it improves organization and practical use, but it may also add cost, complexity, or limitations depending on the system.`,
        ],
      },
      {
        title: "Advantages",
        body: [
          "- Helps organize the work clearly.",
          "- Improves speed, consistency, or reliability.",
          "- Makes the concept easier to apply in real situations.",
        ],
      },
      {
        title: "Disadvantages",
        body: [
          "- Can require extra setup or learning.",
          "- May become complex for large cases.",
          "- Wrong implementation can reduce performance or clarity.",
        ],
      },
    ]);
  }

  if (
    normalizedQuestion.includes("define") ||
    normalizedQuestion.includes("what is") ||
    normalizedQuestion.includes("meaning")
  ) {
    if (dbms) {
      return formatSections([
        {
          title: "Definition",
          body: [
            "DBMS, or Database Management System, is software used to store, manage, retrieve, and secure data in a structured way.",
          ],
        },
        {
          title: "Simple example",
          body: [
            "A college can use a DBMS to manage student records, marks, attendance, courses, and fees in one organized database.",
          ],
        },
        {
          title: "Key points",
          body: [
            "- It sits between users/applications and the database.",
            "- It supports queries, updates, security, backup, and recovery.",
            "- Examples include MySQL, PostgreSQL, Oracle, and MongoDB.",
          ],
        },
      ]);
    }
  }

  if (
    normalizedQuestion.includes("type") ||
    normalizedQuestion.includes("model")
  ) {
    if (dbms) {
      return formatSections([
        {
          title: "Types of DBMS",
          body: [
            "- Hierarchical DBMS: data is arranged like a tree.",
            "- Network DBMS: records can have many relationships.",
            "- Relational DBMS: data is stored in tables with rows and columns.",
            "- Object-oriented DBMS: stores data as objects.",
            "- NoSQL DBMS: handles flexible or large-scale data like documents and key-value pairs.",
          ],
        },
        {
          title: "Most common",
          body: [
            "Relational DBMS is the most common in academics and business systems because SQL makes table data easy to query.",
          ],
        },
      ]);
    }
  }

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
    `Quick answer: ${topicName} is an important concept in this lesson.`,
    "",
    hints.length
      ? `From the lesson: ${hints.join(" ")}`
      : `To understand it, start with the definition, key parts, uses, benefits, limitations, and one real-life example.`,
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
- Always answer the exact follow-up question first.
- If the question asks advantages/disadvantages, include both sides clearly.
- If the question is exam-style, add a short "Exam tip".
- Use plain headings like "Quick answer", "Key points", "Example", and "Exam tip".
- Do not mention unavailable context, API keys, prompts, or internal search/query notes.

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
          `You are Lerno AI Tutor for "${topic}". Answer the exact question first, stay on-topic, explain simply, use short sections, include exam tips when useful, and never mention internal search/query notes or API issues.`,
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

async function askBackendTutor(
  topic: string,
  question: string,
  lessonContent: string | undefined
) {
  const response = await fetch(`${API_BASE_URL}/ai/tutor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      topic,
      question,
      lessonContent: lessonContent || "",
      model: TUTOR_MODEL,
    }),
  });

  const data = (await response.json().catch(() => null)) as {
    content?: string;
    detail?: string;
  } | null;

  if (!response.ok) {
    throw new Error(data?.detail || `Backend tutor error ${response.status}`);
  }

  const content = data?.content?.trim();
  if (!content) {
    throw new Error("Backend tutor returned an empty response.");
  }

  return content;
}

export async function askAITutor({
  topic,
  question,
  lessonContent,
}: TutorRequest) {
  try {
    return await askBackendTutor(topic, question, lessonContent);
  } catch (error) {
    console.warn("Backend tutor proxy unavailable, using fallback path", error);
  }

  if (import.meta.env.VITE_ENABLE_BROWSER_AI_FALLBACK !== "true") {
    return buildFallbackTutorAnswer(topic, question, lessonContent);
  }

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
