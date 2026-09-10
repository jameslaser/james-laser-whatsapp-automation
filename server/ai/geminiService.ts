import axios from "axios";
import type { ConversationContext } from "./conversationContext";
import { getGeminiConfig } from "./geminiConfig";

export interface GeminiReply { text: string; shouldEscalate: boolean; toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }> }
export type GeminiToolExecutor = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export class GeminiService {
  async generateReply(context: ConversationContext, userText: string, tools: Array<{ name: string; description: string }>, executeTool?: GeminiToolExecutor): Promise<GeminiReply> {
    const config = getGeminiConfig();
    const contents = [...context.messages.map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })), { role: "user", parts: [{ text: userText }] }];
    const response = await axios.post(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, { systemInstruction: { parts: [{ text: systemPrompt }] }, contents, tools: [{ function_declarations: tools.map(tool => ({ name: tool.name, description: tool.description, parameters: toolParameters(tool.name) })) }] }, { timeout: 20_000 });
    const parts = response.data?.candidates?.[0]?.content?.parts || [];
    const functionCall = parts.find((part: any) => part.functionCall)?.functionCall as { name: string; args?: Record<string, unknown> } | undefined;
    if (functionCall && executeTool) {
      const args = functionCall.args || {};
      const result = await executeTool(functionCall.name, args);
      const followUp = await axios.post(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, { systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [...contents, { role: "model", parts: [{ functionCall: { name: functionCall.name, args } }] }, { role: "user", parts: [{ functionResponse: { name: functionCall.name, response: { result } } }] }] }, { timeout: 20_000 });
      const followUpText = followUp.data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
      if (!followUpText) throw new Error("Gemini returned no text after tool execution");
      return { text: followUpText, shouldEscalate: false, toolCalls: [{ name: functionCall.name, arguments: args }] };
    }
    const text = parts.map((part: { text?: string }) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned no text response");
    return { text, shouldEscalate: false };
  }
}
export const systemPrompt = `You are the bilingual customer-care assistant for James Laser Hair Removal in Riyadh. Answer in the same language as the customer: Arabic for Arabic messages and English for English messages. Use respectful Saudi conversational style. You may only state treatment, duration, machine, appointment, and availability facts returned by approved application tools. Never invent prices, promotions, availability, package inclusions, or clinic policies. Use the booking tool only after the customer has clearly provided a treatment and requested date/time; if required information is missing, ask one concise question. Do not diagnose or provide medical advice. Escalate complaints, refunds, medical concerns, sensitive issues, or explicit requests for a human.`;

function toolParameters(name: string): Record<string, unknown> {
  if (name === "getVerifiedTreatment") return { type: "OBJECT", properties: { treatmentCode: { type: "STRING" } }, required: ["treatmentCode"] };
  if (name === "checkAvailability") return { type: "OBJECT", properties: { treatmentCode: { type: "STRING" }, date: { type: "STRING", description: "ISO date/time in Asia/Riyadh" } }, required: ["treatmentCode", "date"] };
  if (name === "bookAppointment") return { type: "OBJECT", properties: { treatmentCode: { type: "STRING" }, startsAt: { type: "STRING", description: "Confirmed ISO date/time in Asia/Riyadh" }, machineName: { type: "STRING" } }, required: ["treatmentCode", "startsAt"] };
  return { type: "OBJECT", properties: { reason: { type: "STRING" } }, required: ["reason"] };
}
