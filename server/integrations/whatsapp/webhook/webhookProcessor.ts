import { parseWhatsAppEvents, extractStatusEvents } from "./handler";
import type { WhatsAppMessageService } from "../messages/messageService";
import type { ContactResolver } from "../contacts/contactResolver";
import type { ConversationService } from "../conversations/conversationService";

export interface IncomingMessageHandler {
  (input: { text: string; from: string; conversationId: string; messageId: string }): Promise<void>;
}

export class WebhookProcessor {
  constructor(
    private readonly messages: WhatsAppMessageService,
    private readonly contacts: ContactResolver,
    private readonly conversations: ConversationService,
    private readonly onIncomingText?: IncomingMessageHandler,
  ) {}

  async process(payload: Record<string, unknown>, _eventIds: string[] = []): Promise<{ accepted: number; duplicate: number }> {
    let accepted = 0;
    let duplicate = 0;

    for (const event of parseWhatsAppEvents(payload)) {
      const fresh = await this.messages.acceptWebhookEvent(`message:${event.waMessageId}`, payload);
      if (!fresh) { duplicate++; continue; }

      const contact = await this.contacts.resolve(event.from);
      const conversation = await this.conversations.findOrCreate(contact.id);
      await this.messages.persistIncoming(event, contact.id, conversation.id);
      await this.conversations.addMessage(conversation.id, event.waMessageId);
      accepted++;

      if (event.text?.trim() && this.onIncomingText) {
        try {
          await this.onIncomingText({ text: event.text.trim(), from: event.from, conversationId: conversation.id, messageId: event.waMessageId });
        } catch (error) {
          console.error("[WhatsApp] Incoming AI handler failed:", error);
        }
      }
    }

    for (const status of extractStatusEvents(payload)) {
      const timestamp = status.timestamp.getTime();
      const fresh = await this.messages.acceptWebhookEvent(`status:${status.id}:${status.status}:${timestamp}`, payload);
      if (!fresh) { duplicate++; continue; }
      await this.messages.updateStatus(status.id, status.status, status.raw);
      accepted++;
    }

    return { accepted, duplicate };
  }
}
