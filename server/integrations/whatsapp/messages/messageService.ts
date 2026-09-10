import type { IncomingMessageEvent } from "../../../types/operations";

export interface MessageRepository {
  hasWebhookEvent(eventId: string): Promise<boolean>;
  recordWebhookEvent(eventId: string, payload: Record<string, unknown>): Promise<void>;
  saveIncomingMessage(event: IncomingMessageEvent, contactId: string, conversationId: string): Promise<void>;
  saveOutgoingMessage(input: { waMessageId: string; to: string; conversationId?: string; payload: Record<string, unknown>; status: string }): Promise<void>;
  updateMessageStatus(waMessageId: string, status: string, raw: Record<string, unknown>): Promise<void>;
}

export class WhatsAppMessageService {
  constructor(private readonly repository: MessageRepository) {}
  async acceptWebhookEvent(eventId: string, payload: Record<string, unknown>): Promise<boolean> { if (await this.repository.hasWebhookEvent(eventId)) return false; await this.repository.recordWebhookEvent(eventId, payload); return true; }
  async persistIncoming(event: IncomingMessageEvent, contactId: string, conversationId: string): Promise<void> { await this.repository.saveIncomingMessage(event, contactId, conversationId); }
  async persistOutgoing(input: { waMessageId: string; to: string; conversationId?: string; payload: Record<string, unknown>; status?: string }): Promise<void> { await this.repository.saveOutgoingMessage({ ...input, status: input.status ?? "sent" }); }
  async updateStatus(waMessageId: string, status: string, raw: Record<string, unknown>): Promise<void> { await this.repository.updateMessageStatus(waMessageId, status, raw); }
}
