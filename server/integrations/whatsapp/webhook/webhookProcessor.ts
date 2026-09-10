import { parseWhatsAppEvents, extractStatusEvents } from "./handler";
import type { WhatsAppMessageService } from "../messages/messageService";
import type { ContactResolver } from "../contacts/contactResolver";
import type { ConversationService } from "../conversations/conversationService";

export class WebhookProcessor {
  constructor(private readonly messages: WhatsAppMessageService, private readonly contacts: ContactResolver, private readonly conversations: ConversationService) {}

  async process(payload: Record<string, unknown>, eventIds: string[]): Promise<{ accepted: number; duplicate: number }> {
    let accepted = 0;
    let duplicate = 0;
    const acceptedIds = new Set<string>();
    for (const eventId of eventIds) {
      const fresh = await this.messages.acceptWebhookEvent(eventId, payload);
      if (fresh) { accepted++; acceptedIds.add(eventId); } else duplicate++;
    }
    for (const event of parseWhatsAppEvents(payload)) {
      if (!acceptedIds.has(event.eventId)) continue;
      const contact = await this.contacts.resolve(event.from);
      const conversation = await this.conversations.findOrCreate(contact.id);
      await this.messages.persistIncoming(event, contact.id, conversation.id);
      await this.conversations.addMessage(conversation.id, event.waMessageId);
    }
    for (const status of extractStatusEvents(payload)) {
      if (acceptedIds.has(status.id)) await this.messages.updateStatus(status.id, status.status, status.raw);
    }
    return { accepted, duplicate };
  }
}
