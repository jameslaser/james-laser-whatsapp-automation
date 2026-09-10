import type { ConversationService } from "../integrations/whatsapp/conversations/conversationService";
import { buildConversationContext } from "./conversationContext";
import { aiTools, isEscalationRequest, type AiToolContext } from "./aiTools";
import { GeminiService } from "./geminiService";
import type { ConversationRecord } from "../integrations/whatsapp/conversations/conversationService";
import type { ContextRepository } from "./conversationContext";

export interface AgentContextRepository extends ContextRepository {
  getConversation(id: string): Promise<ConversationRecord | null>;
}

export class AiAgent {
  constructor(
    private readonly gemini: GeminiService,
    private readonly contextRepository: AgentContextRepository,
    private readonly conversations: ConversationService,
    private readonly tools: AiToolContext,
  ) {}

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
    const reply = await this.gemini.generateReply(context, userText, Object.values(aiTools), this.tools);
    if (reply.shouldEscalate) await this.conversations.pauseAi(conversationId);
    return { escalated: reply.shouldEscalate, text: reply.text, toolCalls: reply.toolCalls } as const;
  }
}
