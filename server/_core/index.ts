import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
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
import { createWhatsAppClient } from "../integrations/whatsapp/client/whatsappClient";
import { getWhatsAppConfig } from "../integrations/whatsapp/config/env";
import { AppointmentService } from "../appointments/appointmentService";
import { MachineService } from "../appointments/machineService";
import { AutomationService } from "../automation/automationService";
import { TreatmentCatalog } from "../appointments/treatments";
import { DatabaseAppointmentRepository, DatabaseAutomationRepository, DatabaseContactRepository, DatabaseConversationRepository, DatabaseMachineRepository, DatabaseMessageRepository } from "../db/operationsRepository";

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

function parseRiyadhDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date must be YYYY-MM-DD");
  const value = new Date(`${date}T13:00:00+03:00`);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid Riyadh date");
  return value;
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
  const appointmentService = new AppointmentService(new DatabaseAppointmentRepository(), new MachineService(new DatabaseMachineRepository()));
  const automationService = new AutomationService(new DatabaseAutomationRepository());
  const treatmentCatalog = new TreatmentCatalog();

  const aiAgent = isGeminiConfigured() ? new AiAgent(new GeminiService(), conversationRepository, conversationService, {
    getVerifiedTreatment: async treatmentCode => {
      try {
        const treatment = treatmentCatalog.get(treatmentCode);
        return { code: treatment.code, name: treatment.name, durationMinutes: treatment.maxMinutes };
      } catch {
        return null;
      }
    },
    checkAvailability: async input => {
      const date = parseRiyadhDate(input.date);
      return appointmentService.findAvailableSlots(date, input.treatmentCode);
    },
    requestHumanHandoff: async reason => {
      console.warn(`[AI handoff] ${reason}`);
    },
  }) : undefined;

  const messageService = new WhatsAppMessageService(new DatabaseMessageRepository());
  const webhookProcessor = new WebhookProcessor(messageService, contactResolver, conversationService, aiAgent ? async ({ text, from, conversationId, messageId }) => {
    try {
      const config = getWhatsAppConfig();
      const client = createWhatsAppClient();
      await client.markMessageAsRead(messageId);
      const reply = await aiAgent.respond(conversationId, text);
      const recipient = from.startsWith("+") ? from : `+${from}`;
      const responseText = reply.text || (reply.escalated ? "Thank you. A member of our team will assist you shortly.\nشكرًا لك. سيتواصل معك أحد أعضاء فريقنا قريبًا." : "");
      if (!responseText) return;
      const sent = await client.sendTextMessage({ to: recipient, text: responseText });
      const waMessageId = sent.messages?.[0]?.id;
      if (!waMessageId) throw new Error("WhatsApp API returned no outbound message ID");
      await messageService.persistOutgoing({
        waMessageId,
        to: recipient,
        conversationId,
        payload: { messaging_product: "whatsapp", to: recipient, type: "text", text: { body: responseText } },
        status: sent.messages?.[0]?.message_status || "sent",
      });
      void config;
    } catch (error) {
      console.error("[WhatsApp] AI outbound reply failed:", error);
    }
  } : undefined);

  registerOperationsRoutes(app, {
    processWebhook: (payload, eventIds) => webhookProcessor.process(payload, eventIds),
    conversations: Object.assign(conversationService, {
      list: (limit?: number) => conversationRepository.list(limit),
      getConversation: (id: string) => conversationRepository.getConversation(id),
    }),
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
}

startServer().catch(console.error);
