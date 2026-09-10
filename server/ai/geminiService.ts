import axios from "axios";
import type { ConversationContext } from "./conversationContext";
import { getGeminiConfig } from "./geminiConfig";

export interface GeminiReply { text: string; shouldEscalate: boolean; toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>; }

export class GeminiService {
  async generateReply(context: ConversationContext, userText: string, tools: unknown[]): Promise<GeminiReply> {
    const config = getGeminiConfig();
    const response = await axios.post(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [...context.messages.map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })), { role: "user", parts: [{ text: userText }] }],
      tools,
    }, { timeout: 20_000 });
    const text = response.data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned no text response");
    return { text, shouldEscalate: false };
  }
}

export const systemPrompt = `You are the bilingual customer-care assistant for James Laser Hair Removal in Riyadh. Respond naturally in English or Arabic, using respectful Saudi conversational style. Never invent prices, promotions, appointment availability, machine availability, treatment durations, package inclusions, or clinic policies. Retrieve those facts from approved application tools. If a fact is unavailable or uncertain, say so and escalate to human staff. Do not diagnose or provide medical advice. Escalate complaints, refunds, medical concerns, sensitive issues, or explicit requests for a human.`;
