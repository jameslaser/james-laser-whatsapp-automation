export interface AudienceFilter { tags?: string[]; language?: "ar" | "en"; consentRequired: boolean; }
export interface CampaignDraft { name: string; templateName: string; languageCode: string; audience: AudienceFilter; scheduledAt?: Date; }
export interface MarketingRepository { createCampaign(draft: CampaignDraft): Promise<{ id: string }>; findAudience(filter: AudienceFilter): Promise<Array<{ contactId: string; phoneNumber: string; optedOut: boolean }>>; recordDelivery(campaignId: string, contactId: string, status: string): Promise<void>; }

export class AudienceService {
  constructor(private readonly repository: MarketingRepository) {}
  async filter(filter: AudienceFilter) { return (await this.repository.findAudience(filter)).filter(contact => !filter.consentRequired || !contact.optedOut); }
}
export class CampaignService {
  constructor(private readonly repository: MarketingRepository, private readonly audiences: AudienceService) {}
  async create(draft: CampaignDraft) {
    const campaign = await this.repository.createCampaign(draft);
    const audience = await this.audiences.filter(draft.audience);
    return { ...campaign, audienceSize: audience.length };
  }
}
export class TemplateService {
  validateName(name: string) { if (!/^[a-z0-9_]+$/.test(name)) throw new Error("WhatsApp template names must use lowercase letters, numbers, and underscores"); return name; }
}
export class MarketingService {
  constructor(private readonly repository: MarketingRepository, private readonly campaigns: CampaignService) {}
  createCampaign(draft: CampaignDraft) { return this.campaigns.create(draft); }
  async recordDelivery(campaignId: string, contactId: string, optedOut: boolean, status: string) { if (optedOut) return; await this.repository.recordDelivery(campaignId, contactId, status); }
}
