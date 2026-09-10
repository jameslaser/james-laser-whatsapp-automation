import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { eq } from "drizzle-orm";
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
import { createWhatsAppClient } from "../integrations/whatsapp/client/whatsappClient";
import { getWhatsAppConfig } from "../integrations/whatsapp/config/env";
import { AppointmentService, parseRiyadhDate } from "../appointments/appointmentService";
import { MachineService } from "../appointments/machineService";
import { BlockedAwareMachineRepository } from "../appointments/databaseMachineRepository";
import { BookingService } from "../appointments/bookingService";
import { AutomationService } from "../automation/automationService";
import { TreatmentCatalog } from "../appointments/treatments";
import { getDb } from "../db";
import { appointments, patients, whatsappContacts } from "../../drizzle/schema";
import { DatabaseAppointmentRepository, DatabaseAutomationRepository, DatabaseContactRepository, DatabaseConversationRepository, DatabaseMessageRepository } from "../db/operationsRepository";
import type { AutomationJob } from "../types/operations";

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

function templateEnvKey(type: string): string {
  return `WHATSAPP_TEMPLATE_${type.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
}

function parseTemplateComponents(type: string, variables: Record<string, string> = {}): unknown[] | undefined {
  const raw = process.env[`WHATSAPP_TEMPLATE_COMPONENTS_${type.replace(/([A-Z])/g, "_$1").toUpperCase()}`]?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    const replaceTokens = (value: unknown): unknown => {
      if (typeof value === "string") return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
      if (Array.isArray(value)) return value.map(replaceTokens);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, replaceTokens(child)]));
      return value;
    };
    const replaced = replaceTokens(parsed);
    return Array.isArray(replaced) ? replaced : undefined;
  } catch {
    throw new Error(`Invalid JSON in WHATSAPP_TEMPLATE_COMPONENTS_${type.replace(/([A-Z])/g, "_$1").toUpperCase()}`);
  }
}

function formatRiyadhDateTime(value: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
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
  const contactRepository = new DatabaseContactRepository();
  const contactResolver = new ContactResolver(contactRepository);
  const machineRepository = new BlockedAwareMachineRepository();
  const appointmentService = new AppointmentService(new DatabaseAppointmentRepository(), new MachineService(machineRepository));
  const treatmentCatalog = new TreatmentCatalog();
  const messageService = new WhatsAppMessageService(new DatabaseMessageRepository());

  const automationRepository = new DatabaseAutomationRepository();
  const automationService = new AutomationService(automationRepository, async (job: AutomationJob) => {
    if (!job.contactId) throw new Error("Automation job is missing contactId");
    const templateName = process.env[templateEnvKey(job.type)]?.trim();
    if (!templateName) throw new Error(`Approved WhatsApp template is not configured: ${templateEnvKey(job.type)}`);
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");

    const contactRows = await db.select({ phoneNumber: whatsappContacts.phoneNumber, displayName: whatsappContacts.displayName, patientId: whatsappContacts.patientId }).from(whatsappContacts).where(eq(whatsappContacts.id, Number(job.contactId))).limit(1);
    const contact = contactRows[0];
    if (!contact) throw new Error(`WhatsApp contact not found: ${job.contactId}`);

    let variables: Record<string, string> = { name: contact.displayName || "" };
    if (job.appointmentId) {
      const appointmentRows = await db.select().from(appointments).where(eq(appointments.id, Number(job.appointmentId))).limit(1);
      const appointment = appointmentRows[0];
      if (appointment) {
        const formatted = formatRiyadhDateTime(new Date(appointment.startsAt));
        variables = { ...variables, date: formatted.date, time: formatted.time, treatment: appointment.treatmentCode, provider: appointment.provider, machine: appointment.machineName };
        if (contact.patientId) {
          const patientRows = await db.select({ fullName: patients.fullName }).from(patients).where(eq(patients.id, Number(contact.patientId))).limit(1);
          if (patientRows[0]?.fullName) variables.name = patientRows[0].fullName;
        }
      }
    }

    const languageCode = process.env.WHATSAPP_AUTOMATION_LANGUAGE_CODE?.trim() || "en_US";
    const components = parseTemplateComponents(job.type, variables);
    const client = createWhatsAppClient();
    const sent = await client.sendTemplateMessage({ to: contact.phoneNumber, templateName, languageCode, components });
    const waMessageId = sent.messages?.[0]?.id;
    if (!waMessageId) throw new Error("WhatsApp API returned no outbound automation message ID");
    const conversation = await conversationRepository.findOpenByContact(job.contactId);
    if (conversation) {
      await messageService.persistOutgoing({
        waMessageId,
        to: contact.phoneNumber,
        conversationId: conversation.id,
        payload: { messaging_product: "whatsapp", to: contact.phoneNumber, type: "template", template: { name: templateName, language: { code: languageCode }, components } },
        status: sent.messages?.[0]?.message_status || "sent",
      });
    }
  });

  const bookingService = new BookingService(appointmentService, automationService);

  const aiAgent = isGeminiConfigured() ? new AiAgent(new GeminiService(), conversationRepository, conversationService, {
    getVerifiedTreatment: async treatmentCode => {
      try {
        const treatment = treatmentCatalog.get(treatmentCode);
        return { code: treatment.code, name: treatment.name, durationMinutes: treatment.maxMinutes };
      } catch {
        return null;
      }
    },
    checkAvailability: async input => appointmentService.findAvailableSlots(parseRiyadhDate(input.date), input.treatmentCode),
    createAppointment: async input => {
      if (!input.confirmedByCustomer) throw new Error("The customer must explicitly confirm the exact slot before booking");
      const conversation = await conversationRepository.getConversation(input.conversationId);
      if (!conversation) throw new Error("WhatsApp conversation not found");
      const result = await bookingService.createConfirmedWhatsAppBooking({
        ...input,
        contactId: conversation.contactId,
      });
      const formatted = formatRiyadhDateTime(result.appointment.startsAt);
      return {
        success: true,
        appointmentId: result.appointment.id,
        status: result.appointment.status,
        customerName: result.customerName,
        phoneNumber: result.phoneNumber,
        treatmentCode: result.appointment.treatmentCode,
        date: formatted.date,
        time: formatted.time,
        durationMinutes: result.appointment.durationMinutes,
        machineName: result.appointment.machineName,
        provider: result.appointment.provider,
        confirmationScheduled: result.confirmationScheduled,
        reminder24hScheduled: result.reminder24hScheduled,
        sameDayReminderScheduled: result.sameDayReminderScheduled,
      };
    },
    requestHumanHandoff: async reason => { console.warn(`[AI handoff] ${reason}`); },
  }) : undefined;

  const webhookProcessor = new WebhookProcessor(messageService, contactResolver, conversationService, aiAgent ? async ({ text, from, conversationId, messageId }) => {
    try {
      getWhatsAppConfig();
      const client = createWhatsAppClient();
      await client.markMessageAsRead(messageId);
      const reply = await aiAgent.respond(conversationId, text);
      const recipient = from.startsWith("+") ? from : `+${from}`;
      const responseText = reply.text || (reply.escalated ? "Thank you. A member of our team will assist you shortly.\nشكرًا لك. سيتواصل معك أحد أعضاء فريقنا قريبًا." : "");
      if (!responseText) return;
      const sent = await client.sendTextMessage({ to: recipient, text: responseText });
      const waMessageId = sent.messages?.[0]?.id;
      if (!waMessageId) throw new Error("WhatsApp API returned no outbound message ID");
      await messageService.persistOutgoing({ waMessageId, to: recipient, conversationId, payload: { messaging_product: "whatsapp", to: recipient, type: "text", text: { body: responseText } }, status: sent.messages?.[0]?.message_status || "sent" });
    } catch (error) {
      console.error("[WhatsApp] AI outbound reply failed:", error);
    }
  } : undefined);

  registerOperationsRoutes(app, {
    processWebhook: (payload, eventIds) => webhookProcessor.process(payload, eventIds),
    conversations: Object.assign(conversationService, { list: (limit?: number) => conversationRepository.list(limit), getConversation: (id: string) => conversationRepository.getConversation(id) }),
    appointments: appointmentService,
    aiAgent,
    automations: automationService,
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server); else serveStatic(app);
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));

  const runAutomationWorker = async () => {
    try {
      const processed = await automationService.processDue(new Date(), 50);
      if (processed > 0) console.log(`[Automation] processed ${processed} due job(s)`);
    } catch (error) {
      console.error("[Automation] worker error:", error);
    }
  };
  void runAutomationWorker();
  setInterval(() => { void runAutomationWorker(); }, 60_000);
}

startServer().catch(console.error);
