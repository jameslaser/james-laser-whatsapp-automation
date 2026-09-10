import axios from "axios";
import type { ConversationContext } from "./conversationContext";
import { getGeminiConfig } from "./geminiConfig";

export interface GeminiReply {
  text: string;
  shouldEscalate: boolean;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}
export type GeminiToolExecutor = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export class GeminiService {
  async generateReply(context: ConversationContext, userText: string, tools: Array<{ name: string; description: string }>, executeTool?: GeminiToolExecutor): Promise<GeminiReply> {
    const config = getGeminiConfig();
    const history = context.messages.map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
    const last = context.messages.at(-1);
    const contents = last?.role === "user" && last.content.trim() === userText.trim()
      ? history
      : [...history, { role: "user", parts: [{ text: userText }] }];
    const headers = { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" };
    const requestBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ function_declarations: tools.map(tool => ({ name: tool.name, description: tool.description, parameters: toolParameters(tool.name) })) }],
    };
    const response = await axios.post(`${config.baseUrl}/models/${config.model}:generateContent`, requestBody, { headers, timeout: 20_000 });
    const parts = response.data?.candidates?.[0]?.content?.parts || [];
    const functionCall = parts.find((part: any) => part.functionCall)?.functionCall as { id?: string; name: string; args?: Record<string, unknown> } | undefined;

    if (functionCall && executeTool) {
      const args = functionCall.args || {};
      let result: unknown;
      try { result = await executeTool(functionCall.name, args); }
      catch (error) { result = { error: error instanceof Error ? error.message : "Tool execution failed" }; }
      const followUpContents = [
        ...contents,
        { role: "model", parts: [{ functionCall: { ...(functionCall.id ? { id: functionCall.id } : {}), name: functionCall.name, args } }] },
        { role: "user", parts: [{ functionResponse: { ...(functionCall.id ? { id: functionCall.id } : {}), name: functionCall.name, response: { result } } }] },
      ];
      const followUp = await axios.post(`${config.baseUrl}/models/${config.model}:generateContent`, { ...requestBody, contents: followUpContents }, { headers, timeout: 20_000 });
      const followUpParts = followUp.data?.candidates?.[0]?.content?.parts || [];
      const followUpText = followUpParts.map((part: { text?: string }) => part.text || "").join("").trim();
      if (!followUpText) throw new Error("Gemini returned no text after tool execution");
      return { text: followUpText, shouldEscalate: false, toolCalls: [{ name: functionCall.name, arguments: args }] };
    }

    const text = parts.map((part: { text?: string }) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned no text response");
    return { text, shouldEscalate: false };
  }
}

export const systemPrompt = `You are the bilingual customer-care assistant for James Laser Hair Removal in Riyadh.
Answer in the same language as the customer: Arabic for Arabic messages and English for English messages.
Use respectful Saudi conversational style and keep WhatsApp replies concise.
Only state treatment, duration, machine, appointment, and availability facts returned by approved application tools.
Never invent prices, promotions, availability, package inclusions, or clinic policies.
Use getVerifiedTreatment before stating treatment duration.
Use checkAvailability before offering appointment times.
When a customer wants to book, collect treatment, exact Riyadh date, exact time, and full name.
Offer only slots returned by the availability tool.
Never call bookAppointment until the customer has explicitly confirmed the exact offered treatment and exact time.
After booking, report the appointment as confirmed only when the booking tool returns a successful appointment record.
If booking fails or requires confirmation, explain what is still needed and do not claim a booking was made.
Do not diagnose or provide medical advice.
Escalate complaints, refunds, medical concerns, sensitive issues, or explicit requests for a human.`;

function toolParameters(name: string): Record<string, unknown> {
  if (name === "getVerifiedTreatment") return { type: "object", properties: { treatmentCode: { type: "string" } }, required: ["treatmentCode"] };
  if (name === "checkAvailability") return { type: "object", properties: { treatmentCode: { type: "string" }, date: { type: "string", description: "Riyadh clinic date in YYYY-MM-DD format" } }, required: ["treatmentCode", "date"] };
  if (name === "bookAppointment") return { type: "object", properties: { treatmentCode: { type: "string" }, date: { type: "string", description: "Confirmed Riyadh clinic date in YYYY-MM-DD format" }, time: { type: "string", description: "Confirmed Riyadh clinic time in HH:mm 24-hour format" }, customerName: { type: "string", description: "Customer's full name exactly as provided by the customer" }, machineName: { type: "string", description: "Optional machine selected from the availability result" } }, required: ["treatmentCode", "date", "time", "customerName"] };
  return { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] };
}
