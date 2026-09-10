import type { Express, Request } from "express";
import { createWhatsAppClient } from "../integrations/whatsapp/client/whatsappClient";
import { getWhatsAppConfig } from "../integrations/whatsapp/config/env";
import { parseWhatsAppEvents, extractStatusEvents } from "../integrations/whatsapp/webhook/handler";
import { verifyWebhookChallenge, verifyWebhookSignature } from "../integrations/whatsapp/webhook/signature";
import { runHealthChecks } from "../health/healthService";

export interface OperationsRouteDependencies {
  processWebhook(payload: Record<string, unknown>, eventIds: string[]): Promise<{ accepted: number; duplicate: number }>;
}

function jsonBody(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object") throw new Error("JSON request body is required");
  return req.body as Record<string, unknown>;
}

function notConfigured(_req: Request, res: { status(code: number): { json(body: unknown): unknown } }) {
  return res.status(501).json({ error: "This route is not enabled until the database repository, staff authorization, and real data services are configured." });
}

export function registerOperationsRoutes(app: Express, dependencies: OperationsRouteDependencies) {
  app.get("/webhooks/whatsapp", (req, res) => {
    try { res.status(200).send(verifyWebhookChallenge(String(req.query["hub.mode"] || ""), String(req.query["hub.verify_token"] || ""), String(req.query["hub.challenge"] || ""))); }
    catch (error) { res.status(403).json({ error: error instanceof Error ? error.message : "Webhook verification failed" }); }
  });

  app.post("/webhooks/whatsapp", async (req, res) => {
    try {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || JSON.stringify(req.body);
      if (!verifyWebhookSignature(rawBody, req.header("x-hub-signature-256"))) return res.status(401).json({ error: "Invalid webhook signature" });
      const payload = jsonBody(req);
      const events = parseWhatsAppEvents(payload);
      const statuses = extractStatusEvents(payload);
      const result = await dependencies.processWebhook(payload, [...events.map(event => event.eventId), ...statuses.map(status => status.id)]);
      return res.status(200).json({ received: true, ...result });
    } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Webhook processing failed" }); }
  });

  app.post("/api/whatsapp/send", async (req, res) => {
    try { return res.status(200).json(await createWhatsAppClient().sendTextMessage(jsonBody(req) as { to: string; text: string })); }
    catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "WhatsApp send failed" }); }
  });
  app.post("/api/whatsapp/template", async (req, res) => {
    try { return res.status(200).json(await createWhatsAppClient().sendTemplateMessage(jsonBody(req) as { to: string; templateName: string; languageCode: string; components?: unknown[] })); }
    catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "WhatsApp template send failed" }); }
  });
  app.post("/api/whatsapp/mark-read", async (req, res) => {
    try { const body = jsonBody(req); if (typeof body.messageId !== "string") return res.status(400).json({ error: "messageId is required" }); return res.status(200).json(await createWhatsAppClient().markMessageAsRead(body.messageId)); }
    catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "WhatsApp mark-read failed" }); }
  });

  app.get("/api/whatsapp/conversations", notConfigured);
  app.get("/api/whatsapp/conversations/:id", notConfigured);
  app.post("/api/appointments/check-availability", notConfigured);
  app.post("/api/appointments", notConfigured);
  app.post("/api/appointments/:id/confirm", notConfigured);
  app.post("/api/appointments/:id/cancel", notConfigured);
  app.post("/api/appointments/:id/reschedule", notConfigured);
  app.post("/api/ai/message", notConfigured);
  app.get("/api/automations", notConfigured);
  app.post("/api/automations", notConfigured);

  app.get("/api/health/integrations", async (_req, res) => res.status(200).json({ checks: await runHealthChecks() }));
  app.get("/api/whatsapp/configuration", (_req, res) => { const configured = (() => { try { getWhatsAppConfig(); return true; } catch { return false; } })(); return res.status(200).json({ configured, secretsExposed: false }); });
}
