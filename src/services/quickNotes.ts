import { createOpenRouterChatCompletion } from "./openRouterClient";

export type QuickNoteSection = {
  title: "Definition" | "Key Points" | "Example" | "Exam Tip";
  points: string[];
};

type QuickNotesInput = {
  topic: string;
  narration?: string;
  unitTitle?: string;
};

function compactContext(value?: string, maxChars = 700) {
  const normalized = (value || "")
    .replace(/\s+/g, " ")
    .replace(/Auto-selected from search query:[^.]+/gi, "")
    .trim();
  return normalized.length > maxChars ? normalized.slice(0, maxChars).trim() : normalized;
}

function isDbms(topic: string) {
  const value = topic.toLowerCase();
  return value.includes("dbms") || value.includes("database management");
}

function isComputerNetwork(topic: string) {
  const value = topic.toLowerCase();
  return value.includes("computer network") || value.includes("networking");
}

function isSql(topic: string) {
  const value = topic.toLowerCase();
  return value.includes("sql") || value.includes("join");
}

function isOperatingSystem(topic: string) {
  const value = topic.toLowerCase();
  return value.includes("operating system") || value.includes("os ");
}

function isDsa(topic: string) {
  const value = topic.toLowerCase();
  return value.includes("dsa") || value.includes("data structure") || value.includes("algorithm");
}

export function fallbackQuickNotes({ topic, narration, unitTitle }: QuickNotesInput): QuickNoteSection[] {
  const title = topic || "this topic";
  const context = compactContext(narration, 180);

  if (!topic) {
    return [
      {
        title: "Definition",
        points: ["Pick a topic to generate a structured revision card."],
      },
      {
        title: "Key Points",
        points: ["You will get the definition, core ideas, example, and exam tip."],
      },
      {
        title: "Example",
        points: ["Try DBMS, SQL joins, Computer Networks, Operating System, or DSA."],
      },
      {
        title: "Exam Tip",
        points: ["Use the search bar to start a complete study session."],
      },
    ];
  }

  if (isComputerNetwork(title)) {
    return [
      {
        title: "Definition",
        points: ["Computer networks connect devices so they can share data, resources, and services."],
      },
      {
        title: "Key Points",
        points: [
          "Data is divided into packets before transmission.",
          "Protocols like TCP/IP define communication rules.",
          "LAN connects nearby devices; WAN connects larger regions.",
          "Switches and routers help move data across networks.",
        ],
      },
      {
        title: "Example",
        points: ["A college Wi-Fi network connects students, servers, printers, and the internet."],
      },
      {
        title: "Exam Tip",
        points: ["Draw a simple network diagram and mention packets, protocols, LAN/WAN, switches, and routers."],
      },
    ];
  }

  if (isDbms(title)) {
    return [
      {
        title: "Definition",
        points: ["DBMS is software used to store, organize, retrieve, secure, and manage structured data."],
      },
      {
        title: "Key Points",
        points: [
          "It reduces data duplication and improves consistency.",
          "It supports queries, transactions, backup, and recovery.",
          "It controls access using users, roles, and permissions.",
          "Tables, keys, relationships, and constraints maintain data integrity.",
        ],
      },
      {
        title: "Example",
        points: ["A university DBMS can manage students, marks, attendance, courses, and fees."],
      },
      {
        title: "Exam Tip",
        points: ["Write definition, features, advantages, disadvantages, and one real-world database example."],
      },
    ];
  }

  if (isSql(title)) {
    return [
      {
        title: "Definition",
        points: ["SQL is a language used to store, query, update, and manage relational database data."],
      },
      {
        title: "Key Points",
        points: [
          "SELECT retrieves data from tables.",
          "WHERE filters rows using conditions.",
          "JOIN combines related data from multiple tables.",
          "GROUP BY and ORDER BY summarize and sort results.",
        ],
      },
      {
        title: "Example",
        points: ["A JOIN can combine student details with their marks using a common student ID."],
      },
      {
        title: "Exam Tip",
        points: ["Practice syntax and explain output using small tables."],
      },
    ];
  }

  if (isOperatingSystem(title)) {
    return [
      {
        title: "Definition",
        points: ["An operating system manages computer hardware, software resources, and user applications."],
      },
      {
        title: "Key Points",
        points: [
          "It manages processes, memory, files, and devices.",
          "CPU scheduling decides which process runs next.",
          "Memory management allocates RAM efficiently.",
          "File systems organize data on storage devices.",
        ],
      },
      {
        title: "Example",
        points: ["Windows, macOS, Linux, and Android are operating systems."],
      },
      {
        title: "Exam Tip",
        points: ["Mention process management, memory management, file management, and device management."],
      },
    ];
  }

  if (isDsa(title)) {
    return [
      {
        title: "Definition",
        points: ["DSA studies how data is organized and how algorithms solve problems efficiently."],
      },
      {
        title: "Key Points",
        points: [
          "Arrays, stacks, queues, linked lists, trees, and graphs are common structures.",
          "Algorithms are judged by time and space complexity.",
          "Searching and sorting are core problem-solving patterns.",
        ],
      },
      {
        title: "Example",
        points: ["A queue is used in printer jobs where the first task added is processed first."],
      },
      {
        title: "Exam Tip",
        points: ["Always write the logic, complexity, and one use case."],
      },
    ];
  }

  return [
    {
      title: "Definition",
      points: [
        context || `${title} is an important concept in ${unitTitle || "this subject"}.`,
      ],
    },
    {
      title: "Key Points",
      points: [
        `Understand the meaning and purpose of ${title}.`,
        "Learn the important terms and how they connect.",
        "Compare benefits, limitations, and common use cases.",
      ],
    },
    {
      title: "Example",
      points: [`Use one simple real-world example to explain ${title} clearly.`],
    },
    {
      title: "Exam Tip",
      points: ["Start with a definition, add 3 key points, and end with an example."],
    },
  ];
}

function parseQuickNotesJson(text: string): QuickNoteSection[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] || text;
  const first = body.indexOf("[");
  const last = body.lastIndexOf("]");
  const sliced = first >= 0 && last >= 0 ? body.slice(first, last + 1) : body;

  try {
    const parsed = JSON.parse(sliced);
    if (!Array.isArray(parsed)) return null;
    const cleaned = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        title: String(item.title || ""),
        points: Array.isArray(item.points)
          ? item.points.map((point: unknown) => String(point)).filter(Boolean).slice(0, 4)
          : [],
      }))
      .filter((item) =>
        ["Definition", "Key Points", "Example", "Exam Tip"].includes(item.title) &&
        item.points.length
      ) as QuickNoteSection[];

    return cleaned.length === 4 ? cleaned : null;
  } catch {
    return null;
  }
}

export async function generateQuickNotes(input: QuickNotesInput): Promise<QuickNoteSection[]> {
  const fallback = fallbackQuickNotes(input);
  if (!input.topic) return fallback;

  try {
    const content = await createOpenRouterChatCompletion({
      model: import.meta.env.VITE_OPENROUTER_QUIZ_MODEL || "openrouter/auto",
      title: "Lerno Quick Notes",
      maxTokens: 420,
      minTokens: 180,
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "Return JSON only. Create exactly 4 revision sections: Definition, Key Points, Example, Exam Tip. Each section has title and points. Keep it college-exam useful and concise.",
        },
        {
          role: "user",
          content: `Topic: ${input.topic}\nUnit: ${input.unitTitle || ""}\nContext: ${compactContext(input.narration, 700)}`,
        },
      ],
    });

    return parseQuickNotesJson(content) || fallback;
  } catch (error) {
    console.warn("Quick notes generation failed, using structured fallback", error);
    return fallback;
  }
}
