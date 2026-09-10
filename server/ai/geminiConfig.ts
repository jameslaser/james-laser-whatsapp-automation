export interface GeminiConfig { apiKey: string; model: string; baseUrl: string; }

export function getGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing required server environment variable: GEMINI_API_KEY");
  return { apiKey, model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash", baseUrl: process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta" };
}

export function isGeminiConfigured(): boolean { return Boolean(process.env.GEMINI_API_KEY?.trim()); }
