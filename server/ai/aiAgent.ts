import type { ConversationService, ConversationRecord } from "../integrations/whatsapp/conversations/conversationService";
import { buildConversationContext, type ContextRepository } from "./conversationContext";
import { aiTools, isEscalationRequest, isExplicitBookingConfirmation, type AiToolContext } from "./aiTools";
import { GeminiService } from "./geminiService";

export interface AgentContextRepository extends ContextRepository { getConversation(id: string): Promise<ConversationRecord | null>; }

export class AiAgent {
  constructor(private readonly gemini: GeminiService, private readonly contextRepository: AgentContextRepository, private readonly conversations: ConversationService, private readonly tools: AiToolContext) {}

  async respond(conversationId: string, userText: string) {
    const conversation = await this.contextRepository.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);
    if (conversation.aiPaused || conversation.status !== "AI_ACTIVE") return { escalated: true, reason: "AI is paused for human handling" } as const;

    if (isEscalationRequest(userText)) {
      await this.conversations.humanTakeover(conversationId);
      await this.tools.requestHumanHandoff("Customer request or sensitive topic");
      return { escalated: true, reason: "Human handoff requested" } as const;
    }

    const context = await buildConversationContext(this.contextRepository, conversation);
    const reply = await this.gemini.generateReply(context, userText, Object.values(aiTools), async (name, args) => {
      if (name === "getVerifiedTreatment") return this.tools.getVerifiedTreatment(String(args.treatmentCode || ""));
      if (name === "checkAvailability") return this.tools.checkAvailability({ treatmentCode: String(args.treatmentCode || ""), date: String(args.date || ""), preferredTime: typeof args.preferredTime === "string" ? args.preferredTime : undefined });
      if (name === "bookAppointment") {
        if (!isExplicitBookingConfirmation(userText)) return { booked: false, requiresConfirmation: true, message: "Customer has not explicitly confirmed the exact offered appointment time yet." };
        return this.tools.bookAppointment({ conversationId, contactId: conversation.contactId, treatmentCode: String(args.treatmentCode || ""), date: String(args.date || ""), time: String(args.time || ""), customerName: String(args.customerName || ""), machineName: typeof args.machineName === "string" ? args.machineName : undefined, confirmedByCustomer: true });
      }
      if (name === "requestHumanHandoff") {
        const reason = String(args.reason || "AI requested human handoff");
        await this.conversations.humanTakeover(conversationId);
        await this.tools.requestHumanHandoff(reason);
        return { escalated: true, reason };
      }
      throw new Error(`Unknown AI tool: ${name}`);
    });

    if (reply.shouldEscalate) await this.conversations.humanTakeover(conversationId);
    return { escalated: reply.shouldEscalate, text: reply.text, toolCalls: reply.toolCalls } as const;
  }
}
