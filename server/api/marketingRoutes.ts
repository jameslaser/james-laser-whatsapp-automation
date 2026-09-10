import type { Express, Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { AudienceService, CampaignService, TemplateService, type AudienceFilter, type MarketingRepository } from "../marketing/marketingService";
import type { DatabaseMarketingRepository } from "../marketing/databaseMarketingRepository";

interface MarketingDependencies {
  repository: DatabaseMarketingRepository & MarketingRepository;
  campaigns: CampaignService;
  audiences: AudienceService;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron || user.role !== "admin") { res.status(403).json({ error: "Admin authorization required" }); return false; }
    return true;
  } catch { res.status(401).json({ error: "Authentication required" }); return false; }
}

function body(req: Request): Record<string, unknown> { if (!req.body || typeof req.body !== "object") throw new Error("JSON request body is required"); return req.body as Record<string, unknown>; }
function stringValue(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`); return value.trim(); }

export function registerMarketingRoutes(app: Express, dependencies: MarketingDependencies): void {
  app.post("/api/marketing/campaigns", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const input = body(req);
      const name = stringValue(input.name, "name");
      const templateName = new TemplateService().validateName(stringValue(input.templateName, "templateName"));
      const languageCode = stringValue(input.languageCode, "languageCode");
      const scheduledAt = typeof input.scheduledAt === "string" ? new Date(input.scheduledAt) : undefined;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ error: "scheduledAt must be a valid ISO date" });
      if (scheduledAt && scheduledAt.getTime() <= Date.now()) return res.status(400).json({ error: "scheduledAt must be in the future" });
      const audience: AudienceFilter = { consentRequired: input.consentRequired !== false };
      const result = await dependencies.campaigns.create({ name, templateName, languageCode, scheduledAt, audience });
      return res.status(201).json(result);
    } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Campaign creation failed" }); }
  });

  app.get("/api/marketing/audience", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const audience = await dependencies.audiences.filter({ consentRequired: req.query.consentRequired !== "false" });
      return res.status(200).json({ count: audience.length, contacts: audience });
    } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Audience lookup failed" }); }
  });
}
