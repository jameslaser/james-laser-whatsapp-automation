import type { ConversationRecord } from "../integrations/whatsapp/conversations/conversationService";

export interface ContextMessage { role: "user" | "assistant" | "system"; content: string; }
export interface ConversationContext { conversation: ConversationRecord; messages: ContextMessage[]; verifiedFacts: Record<string, unknown>; }

export interface ContextRepository {
  getRecentMessages(conversationId: string, limit: number): Promise<ContextMessage[]>;
  getVerifiedFacts(conversationId: string): Promise<Record<string, unknown>>;
}

export async function buildConversationContext(repository: ContextRepository, conversation: ConversationRecord, limit = 20): Promise<ConversationContext> {
  return {
    conversation,
    messages: await repository.getRecentMessages(conversation.id, limit),
    verifiedFacts: await repository.getVerifiedFacts(conversation.id),
  };
}
