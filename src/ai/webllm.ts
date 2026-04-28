import { CreateMLCEngine } from "@mlc-ai/web-llm";

let engine: any = null;

export async function initWebLLM() {
  if (engine) return engine;

  console.log("🚀 Initializing WebLLM…");

  engine = await CreateMLCEngine("Phi-3-mini-4k-instruct-q4f16_1", {
    initProgressCallback: (p) => {
      console.log("🧠 WebLLM:", p.text);
    },
  });

  console.log("✅ WebLLM READY");
  return engine;
}
