import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { eq } from "drizzle-orm";
import { leads, patients, whatsappContacts, whatsappOptIns } from "../../drizzle/schema";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerOperationsRoutes } from "../api/operationsRoutes";
import { WhatsAppMessageService } from "../integrations/whatsapp/messages/messageService";
import { WebhookProcessor } from "../integrations/whatsapp/webhook/webhookProcessor";
import { AiAgent } from "../ai/aiAgent";
import { GeminiService } from "../ai/geminiService";
import { isGeminiConfigured } from "../ai/geminiConfig";
import { ConversationService } from "../integrations/whatsapp/conversations/conversationService";
import { ContactResolver } from "../integrations/whatsapp/contacts/contactResolver";
import { AppointmentService } from "../appointments/appointmentService";
import { MachineService } from "../appointments/machineService";
import { BlockAwareMachineRepository } from "../appointments/blockAwareMachineRepository";
import { AutomationService } from "../automation/automationService";
import { WhatsAppAutomationSender } from "../automation/whatsappAutomationSender";
import { TreatmentCatalog } from "../appointments/treatments";
import { DatabaseAppointmentRepository, DatabaseAutomationRepository, DatabaseContactRepository, DatabaseConversationRepository, DatabaseMessageRepository, normalizeMachine } from "../db/operationsRepository";
import { createWhatsAppClient } from "../integrations/whatsapp/client/whatsappClient";
import { getOptionalWhatsAppConfig } from "../integrations/whatsapp/config/env";
import { getDb } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) if (await isPortAvailable(port)) return port;
  throw new Error(`No available port found starting from ${startPort}`);
}

function templateFor(type: string): string | undefined {
  const key = `WHATSAPP_TEMPLATE_${type.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
  return process.env[key]?.trim() || undefined;
}

function componentsFor(type: string): unknown[] | undefined {
  const key = `WHATSAPP_TEMPLATE_COMPONENTS_${type.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
  const raw = process.env[key]?.trim();
  if (!raw) return undefined;
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : undefined; }
  catch { console.warn(`[WhatsApp] Ignoring invalid JSON in ${key}`); return undefined; }
}

function normalizeConsentCommand(text: string): "STOP" | "START" | null {
  const normalized = text.trim().toLowerCase().replace(/[.!؟?]+$/g, "");
  if (["stop", "unsubscribe", "opt out", "optout", "إيقاف", "الغاء", "إلغاء"].includes(normalized)) return "STOP";
  if (["start", "subscribe", "opt in", "optin", "بدء", "ابدأ"].includes(normalized)) return "START";
  return null;
}

async function setWhatsAppConsent(contactId: string, optedIn: boolean, source: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  const id = Number(contactId);
  await db.update(whatsappContacts).set({ optedOut: !optedIn }).where(eq(whatsappContacts.id, id));
  await db.insert(whatsappOptIns).values({ contactId: id, optedIn, source });
}

async function resolvePatientForWhatsAppContact(contactId: string, customerName: string): Promise<{ patientId: string; phoneNumber: string }> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  const contact = (await db.select().from(whatsappContacts).where(eq(whatsappContacts.id, Number(contactId))).limit(1))[0];
  if (!contact) throw new Error("WhatsApp contact was not found");

  let patientId = contact.patientId ? Number(contact.patientId) : 0;
  if (!patientId) {
    const existing = (await db.select({ id: patients.id }).from(patients).where(eq(patients.phoneNumber, contact.phoneNumber)).limit(1))[0];
    if (existing) patientId = Number(existing.id);
    else {
      const lead = contact.leadId ? (await db.select({ fullName: leads.fullName }).from(leads).where(eq(leads.id, Number(contact.leadId))).limit(1))[0] : undefined;
      const name = customerName.trim() || lead?.fullName?.trim();
      if (!name) throw new Error("Customer full name is required before booking");
      const inserted = await db.insert(patients).values({ fullName: name, phoneNumber: contact.phoneNumber });
      patientId = Number(inserted[0]?.insertId);
    }
    if (!patientId) throw new Error("Unable to create patient record");
    await db.update(whatsappContacts).set({ patientId, displayName: customerName.trim() }).where(eq(whatsappContacts.id, Number(contactId)));
  } else if (customerName.trim()) {
    await db.update(patients).set({ fullName: customerName.trim() }).where(eq(patients.id, patientId));
    await db.update(whatsappContacts).set({ displayName: customerName.trim() }).where(eq(whatsappContacts.id, Number(contactId)));
  }
  return { patientId: String(patientId), phoneNumber: contact.phoneNumber };
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb", verify: (req, _res, buffer) => { (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  const conversationRepository = new DatabaseConversationRepository();
  const conversationService = new ConversationService(conversationRepository);
  const contactResolver = new ContactResolver(new DatabaseContactRepository());
  const appointmentService = new AppointmentService(new DatabaseAppointmentRepository(), new MachineService(new BlockAwareMachineRepository()));
  const automationService = new AutomationService(new DatabaseAutomationRepository(), new WhatsAppAutomationSender());
  const messageService = new WhatsAppMessageService(new DatabaseMessageRepository());
  const treatmentCatalog = new TreatmentCatalog();

  const aiAgent = isGeminiConfigured() ? new AiAgent(new GeminiService(), conversationRepository, conversationService, {
    getVerifiedTreatment: async treatmentCode => {
      try { const treatment = treatmentCatalog.get(treatmentCode); return { code: treatment.code, name: treatment.name, durationMinutes: treatment.maxMinutes }; }
      catch { return null; }
    },
    checkAvailability: async input => {
      const date = new Date(`${input.date}T12:00:00+03:00`);
      if (Number.isNaN(date.getTime())) throw new Error("date must be YYYY-MM-DD");
      return appointmentService.findAvailableSlots(date, input.treatmentCode).then(slots => slots.map(slot => ({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString(), machineNames: slot.machineNames })));
    },
    bookAppointment: async input => {
      if (!input.confirmedByCustomer) return { booked: false, requiresConfirmation: true };
      const customerName = input.customerName.trim();
      if (customerName.length < 2) throw new Error("Customer full name is required before booking");
      const start = new Date(`${input.date}T${input.time}:00+03:00`);
      if (Number.isNaN(start.getTime())) throw new Error("date/time must be a valid Riyadh appointment date and time");
      const treatment = treatmentCatalog.get(input.treatmentCode);
      const customer = await resolvePatientForWhatsAppContact(input.contactId, customerName);
      const appointment = await appointmentService.createAppointment({ customerId: customer.patientId, provider: "NR011 JAMES FLORES", treatmentCode: treatment.code, startsAt: start, durationMinutes: treatment.maxMinutes, machineName: input.machineName ? normalizeMachine(input.machineName) : undefined, status: "Confirmed" });

      const languageCode = (process.env.WHATSAPP_AUTOMATION_LANGUAGE_CODE?.trim() === "ar" ? "ar" : "en") as "ar" | "en";
      const automationTypes = ["appointmentConfirmation", "appointmentReminder24h", "sameDayReminder"] as const;
      for (const type of automationTypes) {
        const templateName = templateFor(type);
        if (!templateName) { console.warn(`[WhatsApp] No approved template configured for ${type}; appointment remains confirmed.`); continue; }
        let scheduledAt = new Date();
        if (type === "appointmentReminder24h") scheduledAt = new Date(start.getTime() - 24 * 60 * 60_000);
        if (type === "sameDayReminder") { const minutesBefore = Math.max(15, Number(process.env.WHATSAPP_SAME_DAY_REMINDER_MINUTES_BEFORE || "180")); scheduledAt = new Date(start.getTime() - minutesBefore * 60_000); }
        if (scheduledAt.getTime() <= Date.now() && type !== "appointmentConfirmation") continue;
        await automationService.schedule(type, scheduledAt, `appointment:${appointment.id}:${type}`, { recipient: customer.phoneNumber, conversationId: input.conversationId, templateName, languageCode, components: componentsFor(type) });
      }

      return { booked: true, appointment: { id: appointment.id, treatmentCode: appointment.treatmentCode, startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString(), machineName: appointment.machineName, provider: appointment.provider, status: appointment.status } };
    },
    requestHumanHandoff: async reason => { console.warn(`[AI handoff] ${reason}`); },
  }) : undefined;

  const webhookProcessor = new WebhookProcessor(messageService, contactResolver, conversationService, aiAgent && getOptionalWhatsAppConfig() ? async (event, conversation) => {
    const command = event.text ? normalizeConsentCommand(event.text) : null;
    if (command) {
      await setWhatsAppConsent(conversation.contactId, command === "START", "whatsapp_keyword");
      if (command === "STOP") await conversationService.pauseAi(conversation.id);
      else await conversationService.resumeAi(conversation.id);
      const text = command === "STOP"
        ? "You’re unsubscribed from marketing messages. Reply START anytime to opt in again."
        : "You’re subscribed again. We’ll keep WhatsApp messages relevant and respectful.";
      const response = await createWhatsAppClient().sendTextMessage({ to: event.from, text });
      const waMessageId = response.messages?.[0]?.id;
      if (!waMessageId) throw new Error("Meta accepted no consent confirmation message id");
      await messageService.persistOutgoing({ waMessageId, to: event.from, conversationId: conversation.id, payload: response as unknown as Record<string, unknown>, status: response.messages?.[0]?.message_status || "accepted" });
      return;
    }

    try { await createWhatsAppClient().markMessageAsRead(event.waMessageId); }
    catch (error) { console.warn("[WhatsApp] Failed to mark inbound message as read:", error); }
    const reply = await aiAgent.respond(conversation.id, event.text || "");
    if (!reply.text) return;
    const response = await createWhatsAppClient().sendTextMessage({ to: event.from, text: reply.text });
    const waMessageId = response.messages?.[0]?.id;
    if (!waMessageId) throw new Error("Meta accepted no AI outbound message id");
    await messageService.persistOutgoing({ waMessageId, to: event.from, conversationId: conversation.id, payload: response as unknown as Record<string, unknown>, status: response.messages?.[0]?.message_status || "accepted" });
  } : undefined);

  registerOperationsRoutes(app, {
    processWebhook: (payload, eventIds) => webhookProcessor.process(payload, eventIds),
    messages: messageService,
    conversations: Object.assign(conversationService, { list: (limit?: number) => conversationRepository.list(limit), getConversation: (id: string) => conversationRepository.getConversation(id) }),
    appointments: appointmentService,
    aiAgent,
    automations: automationService,
    processAutomationWorker: () => automationService.processDue(),
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server); else serveStatic(app);
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));

  const runAutomationWorker = async () => {
    try { const processed = await automationService.processDue(new Date(), 50); if (processed) console.log(`[WhatsApp] Automation worker processed ${processed} job(s)`); }
    catch (error) { console.error("[WhatsApp] Automation worker failed:", error); }
  };
  void runAutomationWorker();
  setInterval(() => { void runAutomationWorker(); }, 60_000);
}

startServer().catch(console.error);
