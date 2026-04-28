import { sqlTutor } from "../data/sqlTutor";

export async function askTutor(topic: string, question: string) {
  const q = question.toLowerCase().trim();

  // 1) Instant local answers
  for (const key in sqlTutor) {
    if (q.includes(key)) {
      return sqlTutor[key];
    }
  }

  // 2) Fallback response
  return `This is an advanced ${topic} question.
Please revise this topic or refer to the video explanation above.`;
}
