import { parseWhatsAppEvents, extractStatusEvents } from "./handler";
import type { WhatsAppMessageService } from "../messages/messageService";

export class WebhookProcessor {
  constructor(private readonly messages: WhatsAppMessageService) {}

  async process(payload: Record<string, unknown>, eventIds: string[]): Promise<{ accepted: number; duplicate: number }> {
    let accepted = 0; let duplicate = 0;
    for (const eventId of eventIds) {
      const fresh = await this.messages.acceptWebhookEvent(eventId, payload);
      if (fresh) accepted++; else duplicate++;
    }
    for (const event of parseWhatsAppEvents(payload)) {
      if (!event.text && !event.mediaId) continue;
      // Contact/conversation IDs are intentionally injected by the application layer after resolver lookup.
      // This adapter does not create fake IDs.
    }
    for (const status of extractStatusEvents(payload)) await this.messages.updateStatus(status.id, status.status, status.raw);
    return { accepted, duplicate };
  }
}
