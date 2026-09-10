import type { AutomationJob } from "../types/operations";
import { createWhatsAppClient } from "../integrations/whatsapp/client/whatsappClient";
import { WhatsAppMessageService } from "../integrations/whatsapp/messages/messageService";
import { DatabaseMessageRepository } from "../db/operationsRepository";

export class WhatsAppAutomationSender {
  private readonly messages = new WhatsAppMessageService(new DatabaseMessageRepository());
  async send(job: AutomationJob): Promise<void> {
    if (!job.recipient || !job.templateName || !job.languageCode || !job.conversationId) throw new Error("Automation delivery requires recipient, approved template, language, and conversationId");
    const response = await createWhatsAppClient().sendTemplateMessage({ to: job.recipient, templateName: job.templateName, languageCode: job.languageCode, components: job.components });
    const messageId = response.messages?.[0]?.id;
    if (!messageId) throw new Error("Meta accepted no outbound message id");
    await this.messages.persistOutgoing({ waMessageId: messageId, to: job.recipient, conversationId: job.conversationId, payload: response as unknown as Record<string, unknown>, status: response.messages?.[0]?.message_status || "accepted" });
  }
}
