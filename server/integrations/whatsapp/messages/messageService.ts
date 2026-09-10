import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { whatsappContacts, whatsappMessages, whatsappWebhookEvents } from "../../../../drizzle/schema";
import type { IncomingMessageEvent } from "../../../types/operations";

export interface MessageRepository {
  hasWebhookEvent(eventId: string): Promise<boolean>;
  recordWebhookEvent(eventId: string, payload: Record<string, unknown>): Promise<void>;
  saveIncomingMessage(event: IncomingMessageEvent, contactId: string, conversationId: string): Promise<void>;
  saveOutgoingMessage(input: {
    waMessageId: string;
    to: string;
    conversationId?: string;
    payload: Record<string, unknown>;
    status: string;
  }): Promise<void>;
  updateMessageStatus(waMessageId: string, status: string, raw: Record<string, unknown>): Promise<void>;
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  return db;
}

function outgoingKind(payload: Record<string, unknown>): string {
  if (typeof payload.type === "string") return payload.type;
  if (payload.template) return "template";
  if (payload.interactive) return "interactive";
  return "text";
}

function outgoingBody(payload: Record<string, unknown>): string | undefined {
  const text = payload.text;
  if (text && typeof text === "object" && typeof (text as Record<string, unknown>).body === "string") {
    return (text as Record<string, unknown>).body as string;
  }
  return undefined;
}

export class DatabaseMessageRepository implements MessageRepository {
  async hasWebhookEvent(eventId: string): Promise<boolean> {
    const db = await database();
    const rows = await db
      .select({ id: whatsappWebhookEvents.id })
      .from(whatsappWebhookEvents)
      .where(eq(whatsappWebhookEvents.eventId, eventId))
      .limit(1);
    return Boolean(rows[0]);
  }

  async recordWebhookEvent(eventId: string, payload: Record<string, unknown>): Promise<void> {
    const db = await database();
    await db.insert(whatsappWebhookEvents).values({ eventId, payload });
  }

  async saveIncomingMessage(event: IncomingMessageEvent, contactId: string, conversationId: string): Promise<void> {
    const db = await database();
    const existing = await db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.waMessageId, event.waMessageId))
      .limit(1);
    if (existing[0]) return;

    await db.insert(whatsappMessages).values({
      conversationId: Number(conversationId),
      contactId: Number(contactId),
      waMessageId: event.waMessageId,
      direction: "INBOUND",
      kind: event.kind,
      body: event.text,
      mediaId: event.mediaId,
      status: "received",
      rawPayload: event.raw,
    });
  }

  async saveOutgoingMessage(input: {
    waMessageId: string;
    to: string;
    conversationId?: string;
    payload: Record<string, unknown>;
    status: string;
  }): Promise<void> {
    const db = await database();
    const contact = await db
      .select({ id: whatsappContacts.id })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.phoneNumber, input.to))
      .limit(1);
    if (!contact[0]) throw new Error("Cannot persist outgoing message: WhatsApp contact does not exist");
    if (!input.conversationId) throw new Error("Cannot persist outgoing message: conversationId is required");

    const existing = await db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.waMessageId, input.waMessageId))
      .limit(1);
    if (existing[0]) return;

    await db.insert(whatsappMessages).values({
      conversationId: Number(input.conversationId),
      contactId: contact[0].id,
      waMessageId: input.waMessageId,
      direction: "OUTBOUND",
      kind: outgoingKind(input.payload),
      body: outgoingBody(input.payload),
      status: input.status,
      rawPayload: input.payload,
    });
  }

  async updateMessageStatus(waMessageId: string, status: string, raw: Record<string, unknown>): Promise<void> {
    const db = await database();
    await db
      .update(whatsappMessages)
      .set({ status, rawPayload: raw })
      .where(eq(whatsappMessages.waMessageId, waMessageId));
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

  async persistOutgoing(input: {
    waMessageId: string;
    to: string;
    conversationId?: string;
    payload: Record<string, unknown>;
    status?: string;
  }): Promise<void> {
    await this.repository.saveOutgoingMessage({ ...input, status: input.status ?? "sent" });
  }

  async updateStatus(waMessageId: string, status: string, raw: Record<string, unknown>): Promise<void> {
    await this.repository.updateMessageStatus(waMessageId, status, raw);
  }
}
