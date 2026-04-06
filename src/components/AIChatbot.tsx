import { useState, useRef, useEffect, FormEvent } from "react";
import { motion } from "framer-motion";
import { askAITutor } from "../services/openRouterTutor";

type Message = { type: "user" | "bot"; text: string };

type AIChatbotProps = {
  lessonTitle?: string;
  lessonContent?: string;
  currentQuestion?: string;
  theme?: "dark" | "light";
};

function buildIntroMessage(topic: string) {
  return `Hi there! I'm your AI tutor for ${topic}.

Ask me to explain the topic simply, give short notes, create viva questions, or summarize the lesson.`;
}

const AIChatbot = ({
  lessonTitle,
  lessonContent,
  currentQuestion: _currentQuestion,
  theme = "dark",
}: AIChatbotProps) => {
  const isDarkTheme = theme === "dark";
  const currentTopic =
    lessonTitle || localStorage.getItem("selectedTopicTitle") || "this lesson";
  const [messages, setMessages] = useState<Message[]>([
    { type: "bot", text: buildIntroMessage(currentTopic) },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const quickActions = [
    {
      label: "Explain Simply",
      prompt: `Explain ${currentTopic} in very simple words with a real-life example.`,
    },
    {
      label: "Key Points",
      prompt: `Give me the key points for ${currentTopic} in short bullet points.`,
    },
    {
      label: "Short Notes",
      prompt: `Make quick revision notes for ${currentTopic}.`,
    },
    {
      label: "Viva Prep",
      prompt: `Ask me 3 viva questions about ${currentTopic} with short answers.`,
    },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages([{ type: "bot", text: buildIntroMessage(currentTopic) }]);
    setInputText("");
    setIsTyping(false);
  }, [currentTopic]);

  const sendMessage = async (question: string) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isTyping) return;

    const userMessage: Message = { type: "user", text: trimmedQuestion };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsTyping(true);

    try {
      const responseText = await askAITutor({
        topic: currentTopic,
        question: trimmedQuestion,
        lessonContent,
      });
      setMessages((prev) => [...prev, { type: "bot", text: responseText }]);
    } catch (error) {
      console.error("AI tutor error:", error);
      const errText =
        (error as Error)?.message ||
        "Sorry, I couldn't process your request right now. Please try again later.";
      setMessages((prev) => [
        ...prev,
        {
          type: "bot",
          text: errText,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await sendMessage(inputText);
  };

  return (
    <div
      className={`relative group overflow-hidden rounded-xl border backdrop-blur-sm transition-all duration-300 h-[520px] min-h-[520px] max-h-[520px] flex flex-col ${
        isDarkTheme
          ? "border-white/10 bg-zinc-900/50 hover:border-white/30 hover:bg-zinc-900/70"
          : "border-slate-300/70 bg-white/88 shadow-[0_24px_80px_-40px_rgba(148,163,184,0.45)] hover:border-slate-400/80 hover:bg-white"
      }`}
    >
      {/* Gradient background effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]"></div>

      {/* Chat interface */}
      <div className="relative z-10 flex flex-col h-full p-4">
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isDarkTheme ? "bg-white/10" : "bg-slate-100 text-slate-700"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
              />
            </svg>
          </div>
          <h3 className={`text-lg font-medium ${isDarkTheme ? "text-white" : "text-slate-900"}`}>AI Tutor</h3>
        </div>
        <div className="mb-3">
          <p className={`text-xs uppercase tracking-[0.24em] mb-2 ${isDarkTheme ? "text-white/35" : "text-slate-500"}`}>
            Quick Ask
          </p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => void sendMessage(action.prompt)}
                disabled={isTyping}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDarkTheme
                    ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                    : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages container - flex-grow to take up available space */}
        <div className="flex-grow overflow-y-auto pr-2 mb-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {messages.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`mb-2 ${
                msg.type === "user" ? "flex justify-end" : "flex justify-start"
              }`}
            >
              <div
                className={`px-3 py-2 rounded-lg max-w-[85%] ${
                  msg.type === "user"
                    ? isDarkTheme
                      ? "bg-indigo-500/30 text-white"
                      : "bg-indigo-100 text-slate-900"
                    : isDarkTheme
                      ? "bg-white/10 text-white/80"
                      : "bg-slate-100 text-slate-700"
                }`}
              >
                <div className="whitespace-pre-wrap break-words text-sm leading-7">
                  {msg.text}
                </div>
              </div>
            </motion.div>
          ))}
          {isTyping && (
            <div className="flex justify-start mb-2">
              <div className={`px-3 py-2 rounded-lg ${isDarkTheme ? "bg-white/10 text-white/80" : "bg-slate-100 text-slate-700"}`}>
                <div className="flex space-x-1">
                  <div
                    className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? "bg-white/50" : "bg-slate-400"}`}
                    style={{ animationDelay: "0ms" }}
                  ></div>
                  <div
                    className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? "bg-white/50" : "bg-slate-400"}`}
                    style={{ animationDelay: "150ms" }}
                  ></div>
                  <div
                    className={`w-2 h-2 rounded-full animate-bounce ${isDarkTheme ? "bg-white/50" : "bg-slate-400"}`}
                    style={{ animationDelay: "300ms" }}
                  ></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input form */}
        <form onSubmit={handleSendMessage} className="relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask about ${currentTopic}...`}
            className={`w-full rounded-full px-4 py-2 pr-10 focus:outline-none focus:ring-1 focus:ring-purple-500/50 border transition-colors ${
              isDarkTheme
                ? "bg-white/5 text-white/80 placeholder-white/40 border-white/10"
                : "bg-slate-50 text-slate-900 placeholder-slate-500 border-slate-300"
            }`}
            disabled={isTyping}
          />
          <button
            type="submit"
            className={`absolute right-1 top-1 bottom-1 px-2 rounded-full transition-colors duration-200 ${
              isDarkTheme
                ? "bg-purple-500/20 hover:bg-purple-500/40"
                : "bg-violet-100 hover:bg-violet-200"
            }`}
            disabled={isTyping}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`w-5 h-5 ${isDarkTheme ? "text-white" : "text-violet-700"}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          </button>
        </form>
      </div>

      {/* Glowing border effect */}
      <div className={`absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500 ${
        isDarkTheme
          ? "bg-gradient-to-r from-violet-500/30 via-transparent to-blue-500/30"
          : "bg-gradient-to-r from-sky-300/30 via-transparent to-indigo-300/30"
      }`}></div>
    </div>
  );
};

export default AIChatbot;
