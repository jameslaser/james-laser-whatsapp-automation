import { describe, expect, it } from "vitest";
import type { IncomingMessageEvent } from "../../../types/operations";
import { WebhookProcessor } from "./webhook/webhookProcessor";
import { WhatsAppMessageService, type MessageRepository } from "./messages/messageService";
import { ContactResolver, type ContactRepository } from "./contacts/contactResolver";
import { ConversationService, type ConversationRepository } from "./conversations/conversationService";

describe("WebhookProcessor", () => {
  it("deduplicates, persists inbound messages, and updates delivery/read statuses", async () => {
    const events = new Set<string>(); const messages: IncomingMessageEvent[] = []; const statuses: string[] = [];
    const messageRepository: MessageRepository = { hasWebhookEvent: async id => events.has(id), recordWebhookEvent: async (id) => { events.add(id); }, saveIncomingMessage: async event => { messages.push(event); }, saveOutgoingMessage: async () => undefined, updateMessageStatus: async (id, status) => { statuses.push(`${id}:${status}`); } };
    const contacts: ContactRepository = { findByWhatsAppNumber: async () => null, createLeadFromWhatsApp: async phoneNumber => ({ id: "contact-1", phoneNumber, kind: "lead", created: true }) };
    const conversations: ConversationRepository = { findOpenByContact: async () => null, create: async contactId => ({ id: "conversation-1", contactId, status: "AI_ACTIVE", aiPaused: false, lastActivityAt: new Date() }), update: async (_id, patch) => ({ id: "conversation-1", contactId: "contact-1", status: "AI_ACTIVE", aiPaused: false, lastActivityAt: patch.lastActivityAt || new Date() }), addMessage: async () => undefined };
    const processor = new WebhookProcessor(new WhatsAppMessageService(messageRepository), new ContactResolver(contacts), new ConversationService(conversations));
    const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "phone-1" }, messages: [{ id: "wamid.in", from: "966500000000", timestamp: "1720000000", text: { body: "مرحبا" } }], statuses: [{ id: "wamid.out", status: "delivered", timestamp: "1720000001" }, { id: "wamid.out-read", status: "read", timestamp: "1720000002" }] } }] }] };
    expect(await processor.process(payload, ["wamid.in", "wamid.out", "wamid.out-read"])).toEqual({ accepted: 3, duplicate: 0 });
    expect(await processor.process(payload, ["wamid.in", "wamid.out", "wamid.out-read"])).toEqual({ accepted: 0, duplicate: 3 });
    expect(messages[0]?.text).toBe("مرحبا");
    expect(statuses).toEqual(["wamid.out:delivered", "wamid.out-read:read"]);
  });
});
