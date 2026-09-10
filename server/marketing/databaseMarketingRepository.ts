import axios from "axios";
import { eq } from "drizzle-orm";
import { auditLogs, whatsappCampaigns, whatsappContacts, whatsappOptIns, whatsappTemplates } from "../../drizzle/schema";
import { getDb } from "../db";
import { getWhatsAppConfig } from "../integrations/whatsapp/config/env";
import { CANONICAL_WHATSAPP } from "../types/operations";
import type { AudienceFilter, CampaignDraft, MarketingRepository } from "./marketingService";

export interface DueCampaign { id: string; name: string; templateName: string; languageCode: string; audience: AudienceFilter; }

export class DatabaseMarketingRepository implements MarketingRepository {
  async createCampaign(draft: CampaignDraft): Promise<{ id: string }> {
    const db = await this.database();
    const templates = await db.select().from(whatsappTemplates).where(eq(whatsappTemplates.name, draft.templateName)).limit(10);
    const template = templates.find((row: any) => row.languageCode === draft.languageCode && row.status.toUpperCase() === "APPROVED");
    if (!template) throw new Error(`Approved WhatsApp template not found: ${draft.templateName}/${draft.languageCode}`);
    const result = await db.insert(whatsappCampaigns).values({ name: draft.name, templateId: template.id, languageCode: draft.languageCode, scheduledAt: draft.scheduledAt, status: draft.scheduledAt ? "SCHEDULED" : "DRAFT", consentRequired: draft.audience.consentRequired });
    return { id: String(result[0]?.insertId) };
  }

  async findAudience(filter: AudienceFilter): Promise<Array<{ contactId: string; phoneNumber: string; optedOut: boolean }>> {
    const db = await this.database();
    const contacts = await db.select({ id: whatsappContacts.id, phoneNumber: whatsappContacts.phoneNumber, optedOut: whatsappContacts.optedOut }).from(whatsappContacts);
    if (!filter.consentRequired) return contacts.filter((row: any) => !row.optedOut).map((row: any) => ({ contactId: String(row.id), phoneNumber: row.phoneNumber, optedOut: Boolean(row.optedOut) }));
    const optIns = await db.select({ contactId: whatsappOptIns.contactId, optedIn: whatsappOptIns.optedIn, recordedAt: whatsappOptIns.recordedAt }).from(whatsappOptIns);
    const latest = new Map<number, { optedIn: boolean; recordedAt: number }>();
    for (const row of optIns as any[]) {
      const timestamp = new Date(row.recordedAt).getTime();
      const previous = latest.get(row.contactId);
      if (!previous || timestamp > previous.recordedAt) latest.set(row.contactId, { optedIn: Boolean(row.optedIn), recordedAt: timestamp });
    }
    return contacts.filter((row: any) => !row.optedOut && latest.get(row.id)?.optedIn === true).map((row: any) => ({ contactId: String(row.id), phoneNumber: row.phoneNumber, optedOut: Boolean(row.optedOut) }));
  }

  async recordDelivery(campaignId: string, contactId: string, status: string): Promise<void> {
    const db = await this.database();
    await db.insert(auditLogs).values({ action: `MARKETING_${status.toUpperCase()}`, entityType: "whatsappCampaignDelivery", entityId: `${campaignId}:${contactId}`, metadata: { campaignId, contactId, status } });
  }

  async getDueCampaigns(now: Date): Promise<DueCampaign[]> {
    const db = await this.database();
    const rows = await db.select({ id: whatsappCampaigns.id, name: whatsappCampaigns.name, templateName: whatsappTemplates.name, languageCode: whatsappCampaigns.languageCode, consentRequired: whatsappCampaigns.consentRequired, scheduledAt: whatsappCampaigns.scheduledAt }).from(whatsappCampaigns).innerJoin(whatsappTemplates, eq(whatsappTemplates.id, whatsappCampaigns.templateId)).where(eq(whatsappCampaigns.status, "SCHEDULED"));
    return rows.filter((row: any) => row.scheduledAt && new Date(row.scheduledAt).getTime() <= now.getTime()).map((row: any) => ({ id: String(row.id), name: row.name, templateName: row.templateName, languageCode: row.languageCode, audience: { consentRequired: Boolean(row.consentRequired) } }));
  }

  async markCampaignStatus(id: string, status: string): Promise<void> {
    const db = await this.database();
    await db.update(whatsappCampaigns).set({ status }).where(eq(whatsappCampaigns.id, Number(id)));
  }

  async syncApprovedTemplates(): Promise<{ synced: number; names: string[] }> {
    const config = getWhatsAppConfig();
    const response = await axios.get(`${config.graphApiVersion === "" ? "https://graph.facebook.com" : `https://graph.facebook.com/${config.graphApiVersion}`}/${CANONICAL_WHATSAPP.wabaId}/message_templates`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      params: { status: "APPROVED", limit: 100 },
      timeout: 15_000,
    });
    const templates = Array.isArray(response.data?.data) ? response.data.data : [];
    const db = await this.database();
    const names: string[] = [];
    for (const template of templates) {
      if (typeof template?.name !== "string" || typeof template?.language !== "string" || typeof template?.status !== "string") continue;
      const name = template.name;
      const languageCode = template.language;
      const category = typeof template.category === "string" ? template.category : "UTILITY";
      const content = Array.isArray(template.components) ? JSON.stringify(template.components) : undefined;
      const existing = await db.select({ id: whatsappTemplates.id }).from(whatsappTemplates).where(eq(whatsappTemplates.name, name)).limit(1);
      if (existing[0]) await db.update(whatsappTemplates).set({ languageCode, category, status: template.status, content }).where(eq(whatsappTemplates.id, existing[0].id));
      else await db.insert(whatsappTemplates).values({ name, languageCode, category, status: template.status, content });
      names.push(name);
    }
    return { synced: names.length, names };
  }

  private async database(): Promise<any> {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");
    return db;
  }
}
