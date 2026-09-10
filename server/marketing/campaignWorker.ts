import { createWhatsAppClient } from "../integrations/whatsapp/client/whatsappClient";
import { AudienceService, type MarketingRepository } from "./marketingService";
import type { DatabaseMarketingRepository } from "./databaseMarketingRepository";

export class MarketingCampaignWorker {
  private readonly audiences: AudienceService;

  constructor(private readonly repository: DatabaseMarketingRepository & MarketingRepository) {
    this.audiences = new AudienceService(repository);
  }

  async processDue(now = new Date(), limit = 10): Promise<number> {
    const campaigns = (await this.repository.getDueCampaigns(now)).slice(0, limit);
    let processed = 0;
    for (const campaign of campaigns) {
      try {
        await this.repository.markCampaignStatus(campaign.id, "SENDING");
        const audience = await this.audiences.filter(campaign.audience);
        const client = createWhatsAppClient();
        for (const contact of audience) {
          try {
            const sent = await client.sendTemplateMessage({ to: contact.phoneNumber, templateName: campaign.templateName, languageCode: campaign.languageCode });
            await this.repository.recordDelivery(campaign.id, contact.contactId, sent.messages?.[0]?.message_status || "sent");
          } catch (error) {
            await this.repository.recordDelivery(campaign.id, contact.contactId, `failed:${error instanceof Error ? error.message : "unknown"}`);
          }
        }
        await this.repository.markCampaignStatus(campaign.id, "SENT");
        processed++;
      } catch (error) {
        await this.repository.markCampaignStatus(campaign.id, "FAILED");
        console.error(`[Marketing] campaign ${campaign.id} failed`, error);
      }
    }
    return processed;
  }
}
