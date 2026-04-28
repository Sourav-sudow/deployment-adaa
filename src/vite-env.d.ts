/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_YOUTUBE_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_MODEL?: string;
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_OPENROUTER_API_KEY_1?: string;
  readonly VITE_OPENROUTER_API_KEY_2?: string;
  readonly VITE_OPENROUTER_API_KEY_3?: string;
  readonly VITE_OPENROUTER_API_KEYS?: string;
  readonly VITE_OPENROUTER_TUTOR_MODEL?: string;
  readonly VITE_OPENROUTER_QUIZ_MODEL?: string;
  readonly VITE_OPENROUTER_TUTOR_MAX_TOKENS?: string;
  readonly VITE_OPENROUTER_EXAM_MAX_TOKENS?: string;
  readonly VITE_OPENROUTER_QUIZ_MAX_TOKENS?: string;
  readonly VITE_ENABLE_BROWSER_AI_FALLBACK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
