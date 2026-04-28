import {
  compressModelContext,
  createOpenRouterChatCompletion,
  getOpenRouterApiKeys,
  getOpenRouterMaxTokens,
} from "./openRouterClient";

export type ExamQuestion = {
  question: string;
  marks: number;
};

export type GeneratedExamQuestions = {
  fiveMarkQuestions: ExamQuestion[];
  tenMarkQuestions: ExamQuestion[];
};

const EXAM_MODEL = import.meta.env.VITE_OPENROUTER_QUIZ_MODEL || "openrouter/auto";

const systemPrompt = `Return strict JSON with keys "fiveMarkQuestions" and "tenMarkQuestions". Generate 3 concise university-style 5-mark questions and 2 deep 10-mark questions only for the given topic.`;

function fallbackQuestions(topic: string): GeneratedExamQuestions {
  return {
    fiveMarkQuestions: [
      { question: `Define ${topic} and explain its significance in computer science.`, marks: 5 },
      { question: `List and briefly explain the key components of ${topic}.`, marks: 5 },
      { question: `What are the advantages and disadvantages of ${topic}?`, marks: 5 },
    ],
    tenMarkQuestions: [
      { question: `Explain ${topic} in detail with a suitable diagram and real-world example.`, marks: 10 },
      { question: `Compare and contrast different approaches in ${topic}. Provide examples to support your answer.`, marks: 10 },
    ],
  };
}

function sanitizeJson(text: string): string {
  // Prefer fenced block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced && fenced[1] ? fenced[1] : text;

  // Trim to object
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first === -1 || last === -1) return body.trim();
  return body.slice(first, last + 1).trim();
}

export async function generateExamQuestions(
  topic: string,
  context?: string
): Promise<GeneratedExamQuestions> {
  if (!getOpenRouterApiKeys().length) {
    console.warn("OpenRouter API key not set; returning fallback questions");
    return fallbackQuestions(topic);
  }

  const compactContext = compressModelContext(context, 700);
  const userPrompt = compactContext
    ? `Topic: ${topic}\nContext: ${compactContext}\nNeed: 3 five-mark + 2 ten-mark exam questions. JSON only.`
    : `Topic: ${topic}\nNeed: 3 five-mark + 2 ten-mark exam questions. JSON only.`;

  try {
    const content = await createOpenRouterChatCompletion({
      model: EXAM_MODEL,
      title: "Lerno.ai Exam Questions",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.55,
      maxTokens: getOpenRouterMaxTokens("exam"),
      minTokens: 220,
    });

    if (!content) {
      console.warn("Empty response from API; returning fallback");
      return fallbackQuestions(topic);
    }

    const cleaned = sanitizeJson(content);
    const parsed = JSON.parse(cleaned) as GeneratedExamQuestions;

    // Validate structure
    if (
      !Array.isArray(parsed.fiveMarkQuestions) ||
      !Array.isArray(parsed.tenMarkQuestions)
    ) {
      console.warn("Invalid response structure; returning fallback");
      return fallbackQuestions(topic);
    }

    return parsed;
  } catch (err) {
    console.error("Failed to generate exam questions:", err);
    return fallbackQuestions(topic);
  }
}
