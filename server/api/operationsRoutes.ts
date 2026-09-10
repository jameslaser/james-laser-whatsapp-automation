import type { Express, Request } from "express";
import { createWhatsAppClient } from "../integrations/whatsapp/client/whatsappClient";
import { getWhatsAppConfig } from "../integrations/whatsapp/config/env";
import { parseWhatsAppEvents, extractStatusEvents } from "../integrations/whatsapp/webhook/handler";
import { verifyWebhookChallenge, verifyWebhookSignature } from "../integrations/whatsapp/webhook/signature";
import { runHealthChecks } from "../health/healthService";
import type { AppointmentService } from "../appointments/appointmentService";
import type { AiAgent } from "../ai/aiAgent";
import type { AutomationService, AutomationType } from "../automation/automationService";
import type { ConversationService } from "../integrations/whatsapp/conversations/conversationService";
import { normalizeMachine, normalizeProvider } from "../db/operationsRepository";
import { sdk } from "../_core/sdk";
import type { WhatsAppMessageService } from "../integrations/whatsapp/messages/messageService";

export interface OperationsRouteDependencies {
  processWebhook(payload: Record<string, unknown>, eventIds: string[]): Promise<{ accepted: number; duplicate: number }>;
  messages: WhatsAppMessageService;
  conversations: ConversationService & { list(limit?: number): Promise<unknown[]>; getConversation(id: string): Promise<unknown> };
  appointments: AppointmentService;
  aiAgent?: AiAgent;
  automations: AutomationService;
  processAutomationWorker(): Promise<number>;
}

function jsonBody(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object") throw new Error("JSON request body is required");
  return req.body as Record<string, unknown>;
}
function requiredString(body: Record<string, unknown>, key: string): string { if (typeof body[key] !== "string" || !body[key]) throw new Error(`${key} is required`); return body[key] as string; }
function requiredDate(body: Record<string, unknown>, key: string): Date { const value = new Date(requiredString(body, key)); if (Number.isNaN(value.getTime())) throw new Error(`${key} must be a valid ISO date`); return value; }
function badInput(res: { status(code: number): { json(body: unknown): unknown } }, error: unknown) { return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" }); }
async function requireStaff(req: Request, res: { status(code: number): { json(body: unknown): unknown } }) {
  try { const user = await sdk.authenticateRequest(req); if (user.isCron || user.role !== "admin") { res.status(403).json({ error: "Staff admin authorization required" }); return null; } return user; }
  catch { res.status(401).json({ error: "Authenticated staff session required" }); return null; }
}
async function requireCron(req: Request, res: { status(code: number): { json(body: unknown): unknown } }) {
  try { const user = await sdk.authenticateRequest(req); if (!user.isCron || !user.taskUid) { res.status(403).json({ error: "Cron authorization required" }); return null; } return user; }
  catch { res.status(401).json({ error: "Scheduled task authentication required" }); return null; }
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
      const events = parseWhatsAppEvents(payload); const statuses = extractStatusEvents(payload);
      const result = await dependencies.processWebhook(payload, [...events.map(event => event.eventId), ...statuses.map(status => status.id)]);
      return res.status(200).json({ received: true, ...result });
    } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Webhook processing failed" }); }
  });

  app.post("/api/whatsapp/send", async (req, res) => { if (!await requireStaff(req, res)) return; try { const body = jsonBody(req); const to = requiredString(body, "to"); const text = requiredString(body, "text"); const conversationId = requiredString(body, "conversationId"); const response = await createWhatsAppClient().sendTextMessage({ to, text, previewUrl: body.previewUrl === true }); const waMessageId = response.messages?.[0]?.id; if (!waMessageId) throw new Error("Meta accepted no outbound message id"); await dependencies.messages.persistOutgoing({ waMessageId, to, conversationId, payload: response as unknown as Record<string, unknown>, status: response.messages?.[0]?.message_status || "accepted" }); return res.status(200).json(response); } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "WhatsApp send failed" }); } });
  app.post("/api/whatsapp/template", async (req, res) => { if (!await requireStaff(req, res)) return; try { const body = jsonBody(req); const to = requiredString(body, "to"); const templateName = requiredString(body, "templateName"); const languageCode = requiredString(body, "languageCode"); if (languageCode !== "ar" && languageCode !== "en") throw new Error("languageCode must be ar or en"); const conversationId = requiredString(body, "conversationId"); const response = await createWhatsAppClient().sendTemplateMessage({ to, templateName, languageCode, components: Array.isArray(body.components) ? body.components : undefined }); const waMessageId = response.messages?.[0]?.id; if (!waMessageId) throw new Error("Meta accepted no outbound message id"); await dependencies.messages.persistOutgoing({ waMessageId, to, conversationId, payload: response as unknown as Record<string, unknown>, status: response.messages?.[0]?.message_status || "accepted" }); return res.status(200).json(response); } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "WhatsApp template send failed" }); } });
  app.post("/api/whatsapp/mark-read", async (req, res) => { if (!await requireStaff(req, res)) return; try { const body = jsonBody(req); if (typeof body.messageId !== "string") return res.status(400).json({ error: "messageId is required" }); return res.status(200).json(await createWhatsAppClient().markMessageAsRead(body.messageId)); } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "WhatsApp mark-read failed" }); } });

  app.get("/api/whatsapp/conversations", async (req, res) => { if (!await requireStaff(req, res)) return; try { return res.status(200).json({ conversations: await dependencies.conversations.list(Number(req.query.limit) || 50) }); } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Conversation listing failed" }); } });
  app.get("/api/whatsapp/conversations/:id", async (req, res) => { if (!await requireStaff(req, res)) return; try { const conversation = await dependencies.conversations.getConversation(req.params.id); return conversation ? res.status(200).json(conversation) : res.status(404).json({ error: "Conversation not found" }); } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Conversation lookup failed" }); } });
  app.post("/api/whatsapp/conversations/:id/takeover", async (req, res) => { const staff = await requireStaff(req, res); if (!staff) return; try { return res.status(200).json(await dependencies.conversations.humanTakeover(req.params.id, String(staff.id))); } catch (error) { return badInput(res, error); } });
  app.post("/api/whatsapp/conversations/:id/resume-ai", async (req, res) => { if (!await requireStaff(req, res)) return; try { return res.status(200).json(await dependencies.conversations.resumeAi(req.params.id)); } catch (error) { return badInput(res, error); } });
  app.post("/api/whatsapp/conversations/:id/close", async (req, res) => { if (!await requireStaff(req, res)) return; try { return res.status(200).json(await dependencies.conversations.close(req.params.id)); } catch (error) { return badInput(res, error); } });

  app.post("/api/appointments/check-availability", async (req, res) => { if (!await requireStaff(req, res)) return; try { const body = jsonBody(req); normalizeProvider(requiredString(body, "provider")); const treatmentCode = requiredString(body, "treatmentCode"); const startsAt = requiredDate(body, "startsAt"); const durationMinutes = typeof body.durationMinutes === "number" ? body.durationMinutes : dependencies.appointments.calculateDuration(treatmentCode); return res.status(200).json(await dependencies.appointments.checkAvailability(startsAt, durationMinutes)); } catch (error) { return badInput(res, error); } });
  app.post("/api/appointments", async (req, res) => { if (!await requireStaff(req, res)) return; try { const body = jsonBody(req); const provider = normalizeProvider(requiredString(body, "provider")); const treatmentCode = requiredString(body, "treatmentCode"); const startsAt = requiredDate(body, "startsAt"); const customerId = requiredString(body, "customerId"); const durationMinutes = typeof body.durationMinutes === "number" ? body.durationMinutes : dependencies.appointments.calculateDuration(treatmentCode); const machineName = typeof body.machineName === "string" ? normalizeMachine(body.machineName) : undefined; return res.status(201).json(await dependencies.appointments.createAppointment({ customerId, provider, treatmentCode, startsAt, durationMinutes, machineName })); } catch (error) { return badInput(res, error); } });
  app.post("/api/appointments/:id/confirm", async (req, res) => { if (!await requireStaff(req, res)) return; try { return res.status(200).json(await dependencies.appointments.confirmAppointment(req.params.id)); } catch (error) { return badInput(res, error); } });
  app.post("/api/appointments/:id/cancel", async (req, res) => { if (!await requireStaff(req, res)) return; return res.status(400).json({ error: "Cancelled is rejected by the active HMS status policy. Use an allowed status transition." }); });
  app.post("/api/appointments/:id/reschedule", async (req, res) => { if (!await requireStaff(req, res)) return; try { const body = jsonBody(req); const startsAt = requiredDate(body, "startsAt"); const treatmentCode = requiredString(body, "treatmentCode"); const durationMinutes = typeof body.durationMinutes === "number" ? body.durationMinutes : dependencies.appointments.calculateDuration(treatmentCode); return res.status(200).json(await dependencies.appointments.rescheduleAppointment(req.params.id, startsAt, durationMinutes)); } catch (error) { return badInput(res, error); } });

  app.post("/api/ai/message", async (req, res) => { if (!await requireStaff(req, res)) return; try { if (!dependencies.aiAgent) return res.status(503).json({ error: "AI agent is not configured" }); const body = jsonBody(req); return res.status(200).json(await dependencies.aiAgent.respond(requiredString(body, "conversationId"), requiredString(body, "message"))); } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "AI request failed" }); } });
  app.get("/api/automations", async (req, res) => { if (!await requireStaff(req, res)) return; return res.status(200).json({ message: "Automation queue is database-backed and executes from /api/scheduled/process-automations." }); });
  app.post("/api/automations", async (req, res) => { if (!await requireStaff(req, res)) return; try { const body = jsonBody(req); const type = requiredString(body, "type") as AutomationType; const scheduledAt = requiredDate(body, "scheduledAt"); const idempotencyKey = requiredString(body, "idempotencyKey"); const recipient = requiredString(body, "recipient"); const templateName = requiredString(body, "templateName"); const languageCode = requiredString(body, "languageCode"); if (languageCode !== "ar" && languageCode !== "en") throw new Error("languageCode must be ar or en"); const conversationId = requiredString(body, "conversationId"); return res.status(201).json(await dependencies.automations.schedule(type, scheduledAt, idempotencyKey, { recipient, templateName, languageCode, conversationId, components: Array.isArray(body.components) ? body.components : undefined })); } catch (error) { return badInput(res, error); } });

  app.post("/api/scheduled/process-automations", async (req, res) => { const cron = await requireCron(req, res); if (!cron) return; try { return res.status(200).json({ ok: true, processed: await dependencies.processAutomationWorker() }); } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Automation worker failed", taskUid: cron.taskUid }); } });

  app.get("/api/health/integrations", async (_req, res) => res.status(200).json({ checks: await runHealthChecks() }));
  app.get("/api/whatsapp/configuration", (_req, res) => { const configured = (() => { try { getWhatsAppConfig(); return true; } catch { return false; } })(); return res.status(200).json({ configured, secretsExposed: false }); });
}
