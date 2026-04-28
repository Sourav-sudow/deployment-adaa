import {
  compressModelContext,
  createOpenRouterChatCompletion,
  getOpenRouterApiKeys,
  getOpenRouterMaxTokens,
} from "./openRouterClient";

export type GeneratedMCQ = {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
};

const QUIZ_MODEL = import.meta.env.VITE_OPENROUTER_QUIZ_MODEL || "openrouter/auto";

const systemPrompt = `Return a JSON array only. Generate concise beginner-friendly college MCQs with exactly 4 options and one correctIndex per question. Stay on-topic and avoid repeats.`;

function fallbackMCQs(topic: string, count = 10): GeneratedMCQ[] {
  const base: GeneratedMCQ[] = [
    {
      question: `What does the SELECT statement do in ${topic}?`,
      choices: [
        "Retrieve data from tables",
        "Delete data",
        "Add a new column",
        "Change a database user",
      ],
      correctIndex: 0,
    },
    {
      question: `Which keyword adds new rows in ${topic}?`,
      choices: ["UPDATE", "INSERT", "DROP", "GRANT"],
      correctIndex: 1,
    },
    {
      question: `Which clause filters rows in ${topic}?`,
      choices: ["ORDER BY", "GROUP BY", "WHERE", "LIMIT"],
      correctIndex: 2,
    },
    {
      question: `What does DELETE do in ${topic}?`,
      choices: [
        "Removes rows",
        "Creates a table",
        "Changes column type",
        "Backs up data",
      ],
      correctIndex: 0,
    },
    {
      question: `Which statement changes existing rows in ${topic}?`,
      choices: ["ALTER", "INSERT", "UPDATE", "DROP"],
      correctIndex: 2,
    },
    {
      question: `What does the WHERE clause do in ${topic}?`,
      choices: ["Sorts rows", "Filters rows", "Groups rows", "Counts rows"],
      correctIndex: 1,
    },
    {
      question: `Which keyword sorts the result set in ${topic}?`,
      choices: ["ORDER BY", "GROUP BY", "HAVING", "LIMIT"],
      correctIndex: 0,
    },
    {
      question: `Which clause groups rows for aggregation in ${topic}?`,
      choices: ["ORDER BY", "GROUP BY", "WHERE", "DISTINCT"],
      correctIndex: 1,
    },
    {
      question: `What does DISTINCT do in ${topic}?`,
      choices: ["Removes duplicate rows", "Sorts rows", "Deletes rows", "Adds rows"],
      correctIndex: 0,
    },
    {
      question: `Which statement removes a table in ${topic}?`,
      choices: ["DELETE", "DROP", "TRUNCATE", "RENAME"],
      correctIndex: 1,
    },
  ];
  return base.slice(0, count);
}

function sanitizeJson(text: string): string {
  // Prefer fenced block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced && fenced[1] ? fenced[1] : text;

  // Trim to array
  const first = body.indexOf("[");
  const last = body.lastIndexOf("]");
  const sliced = first !== -1 && last !== -1 ? body.slice(first, last + 1) : body;

  // Normalize quotes and trailing commas
  return sliced
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*(?=[}\]])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tryParseJson(text: string): any {
  const variants = [
    text,
    text.replace(/,\s*(?=[}\]])/g, ""),
    text.trim(),
    text.replace(/'/g, '"'),
  ];

  for (const variant of variants) {
    try {
      return JSON.parse(variant);
    } catch (err) {
      // continue
    }
  }
  throw new Error("Failed to parse quiz JSON from model response");
}

export async function generateMCQsFromTopic(
  topic: string,
  context: string,
  count = 10
): Promise<GeneratedMCQ[]> {
  if (!getOpenRouterApiKeys().length) return fallbackMCQs(topic, count);

  const compactContext = compressModelContext(context, 900);

  let raw = "";
  try {
    raw = await createOpenRouterChatCompletion({
      model: QUIZ_MODEL,
      title: "Lerno.ai Quiz Generator",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Topic: ${topic}\nContext: ${compactContext}\nQuestions: ${count}\nReturn JSON array only.`,
        },
      ],
      maxTokens: Math.min(getOpenRouterMaxTokens("quiz"), Math.max(180, count * 32)),
      minTokens: 160,
      temperature: 0.45,
    });
  } catch (error) {
    console.warn("OpenRouter quiz request failed, using fallback MCQs", error);
    return fallbackMCQs(topic, count);
  }

  const jsonText = sanitizeJson(raw);

  try {
    let parsed: unknown;
    parsed = tryParseJson(jsonText);

    if (!Array.isArray(parsed)) throw new Error("Quiz JSON is not an array");

    const cleaned: GeneratedMCQ[] = parsed
      .filter((item) => item && typeof item === "object")
      .map((item: any) => ({
        question: String(item.question || ""),
        choices: Array.isArray(item.choices)
          ? item.choices.slice(0, 4).map((c: unknown) => String(c))
          : [],
        correctIndex: Number.isInteger(item.correctIndex)
          ? item.correctIndex
          : 0,
        explanation: item.explanation ? String(item.explanation) : undefined,
      }))
      .filter((q) => q.question && q.choices.length === 4);

    if (!cleaned.length) {
      console.warn("Quiz JSON parsed but empty, falling back", { raw, jsonText });
      return fallbackMCQs(topic, count);
    }

    return cleaned.slice(0, count);
  } catch (err) {
    console.warn("Quiz parse failed, using fallback questions", { raw, jsonText, err });
    return fallbackMCQs(topic, count);
  }
}
