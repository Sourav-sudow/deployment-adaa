export type GeneratedMCQ = {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
};

const QUIZ_MODEL = import.meta.env.VITE_OPENROUTER_QUIZ_MODEL || "openrouter/auto";

const systemPrompt = `You are an educational quiz generator.
Create concise multiple-choice questions (MCQs) for college students.
- Respond with JSON array only. No markdown, no bullets, no code fences.
- For each question, provide exactly 4 concise options and one correct index.
- Keep wording short and clear; no markdown.
- Stay strictly on the provided topic/content.
- Do not repeat questions; avoid trivial duplicates.
- Keep difficulty beginner-friendly.
JSON schema:
[
  {
    "question": "...",
    "choices": ["A", "B", "C", "D"],
    "correctIndex": 0,
    "explanation": "... (optional)"
  }
]`;

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
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing VITE_OPENROUTER_API_KEY");

  const body = {
    model: QUIZ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Topic: ${topic}\nContext (transcript/notes): ${context}\nNumber of questions: ${count}\nReturn JSON array only.`,
      },
    ],
    max_tokens: 600,
    temperature: 0.6,
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter quiz error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
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
