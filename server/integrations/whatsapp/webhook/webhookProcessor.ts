import { parseWhatsAppEvents, extractStatusEvents } from "./handler";
import type { WhatsAppMessageService } from "../messages/messageService";
import type { ContactResolver } from "../contacts/contactResolver";
import type { ConversationService } from "../conversations/conversationService";

export class WebhookProcessor {
  constructor(
    private readonly messages: WhatsAppMessageService,
    private readonly contacts: ContactResolver,
    private readonly conversations: ConversationService,
  ) {}

  async process(
    payload: Record<string, unknown>,
    _eventIds: string[] = [],
  ): Promise<{ accepted: number; duplicate: number }> {
    let accepted = 0;
    let duplicate = 0;

    // Message and status events use different idempotency keys. A status update
    // for an outbound message must never collide with the original inbound/outbound
    // message event stored in whatsappWebhookEvents.
    for (const event of parseWhatsAppEvents(payload)) {
      const fresh = await this.messages.acceptWebhookEvent(`message:${event.waMessageId}`, payload);
      if (!fresh) {
        duplicate++;
        continue;
      }

      const contact = await this.contacts.resolve(event.from);
      const conversation = await this.conversations.findOrCreate(contact.id);
      await this.messages.persistIncoming(event, contact.id, conversation.id);
      await this.conversations.addMessage(conversation.id, event.waMessageId);
      accepted++;
    }

    for (const status of extractStatusEvents(payload)) {
      const timestamp = status.timestamp.getTime();
      const fresh = await this.messages.acceptWebhookEvent(
        `status:${status.id}:${status.status}:${timestamp}`,
        payload,
      );
      if (!fresh) {
        duplicate++;
        continue;
      }

      await this.messages.updateStatus(status.id, status.status, status.raw);
      accepted++;
    }

    return { accepted, duplicate };
  }
}
