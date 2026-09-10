import type { IncomingMessageEvent } from "../../../types/operations";
import { getDb } from "../../../db";

export interface MessageRepository {
  hasWebhookEvent(eventId: string): Promise<boolean>;
  recordWebhookEvent(eventId: string, payload: Record<string, unknown>): Promise<void>;
  saveIncomingMessage(event: IncomingMessageEvent, contactId: string, conversationId: string): Promise<void>;
  saveOutgoingMessage(input: { waMessageId: string; to: string; conversationId?: string; payload: Record<string, unknown>; status: string }): Promise<void>;
  updateMessageStatus(waMessageId: string, status: string, raw: Record<string, unknown>): Promise<void>;
}

export class DatabaseMessageRepository implements MessageRepository {
  async hasWebhookEvent(_eventId: string): Promise<boolean> {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    throw new Error("WhatsApp tables are not migrated yet; implement repository queries against drizzle/schema.ts");
  }

  async recordWebhookEvent(_eventId: string, _payload: Record<string, unknown>): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    throw new Error("WhatsApp tables are not migrated yet; implement repository queries against drizzle/schema.ts");
  }

  async saveIncomingMessage(_event: IncomingMessageEvent, _contactId: string, _conversationId: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    throw new Error("WhatsApp tables are not migrated yet; implement repository queries against drizzle/schema.ts");
  }

  async saveOutgoingMessage(_input: { waMessageId: string; to: string; conversationId?: string; payload: Record<string, unknown>; status: string }): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    throw new Error("WhatsApp tables are not migrated yet; implement repository queries against drizzle/schema.ts");
  }

  async updateMessageStatus(_waMessageId: string, _status: string, _raw: Record<string, unknown>): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    throw new Error("WhatsApp tables are not migrated yet; implement repository queries against drizzle/schema.ts");
  }
}

export class WhatsAppMessageService {
  constructor(private readonly repository: MessageRepository) {}

  async acceptWebhookEvent(eventId: string, payload: Record<string, unknown>): Promise<boolean> {
    if (await this.repository.hasWebhookEvent(eventId)) return false;
    await this.repository.recordWebhookEvent(eventId, payload);
    return true;
  }

  async persistIncoming(event: IncomingMessageEvent, contactId: string, conversationId: string): Promise<void> {
    await this.repository.saveIncomingMessage(event, contactId, conversationId);
  }

  async persistOutgoing(input: { waMessageId: string; to: string; conversationId?: string; payload: Record<string, unknown>; status?: string }): Promise<void> {
    await this.repository.saveOutgoingMessage({ ...input, status: input.status ?? "sent" });
  }

  async updateStatus(waMessageId: string, status: string, raw: Record<string, unknown>): Promise<void> {
    await this.repository.updateMessageStatus(waMessageId, status, raw);
  }
}
