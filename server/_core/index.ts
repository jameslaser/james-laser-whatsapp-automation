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
import { AppointmentService } from "../appointments/appointmentService";
import { MachineService } from "../appointments/machineService";
import { AutomationService } from "../automation/automationService";
import { WhatsAppAutomationSender } from "../automation/whatsappAutomationSender";
import { TreatmentCatalog } from "../appointments/treatments";
import { DatabaseAppointmentRepository, DatabaseAutomationRepository, DatabaseContactRepository, DatabaseConversationRepository, DatabaseMachineRepository, DatabaseMessageRepository, normalizeMachine } from "../db/operationsRepository";
import { createWhatsAppClient } from "../integrations/whatsapp/client/whatsappClient";
import { getOptionalWhatsAppConfig } from "../integrations/whatsapp/config/env";

function isPortAvailable(port: number): Promise<boolean> { return new Promise(resolve => { const server = net.createServer(); server.listen(port, () => server.close(() => resolve(true))); server.on("error", () => resolve(false)); }); }
async function findAvailablePort(startPort = 3000): Promise<number> { for (let port = startPort; port < startPort + 20; port++) if (await isPortAvailable(port)) return port; throw new Error(`No available port found starting from ${startPort}`); }

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
  const automationService = new AutomationService(new DatabaseAutomationRepository(), new WhatsAppAutomationSender());
  const messageService = new WhatsAppMessageService(new DatabaseMessageRepository());
  const treatmentCatalog = new TreatmentCatalog();
  const aiAgent = isGeminiConfigured() ? new AiAgent(new GeminiService(), conversationRepository, conversationService, {
    getVerifiedTreatment: async treatmentCode => { try { const treatment = treatmentCatalog.get(treatmentCode); return { code: treatment.code, name: treatment.name, durationMinutes: treatment.maxMinutes }; } catch { return null; } },
    checkAvailability: async input => appointmentService.checkAvailability(new Date(input.date), appointmentService.calculateDuration(input.treatmentCode)),
    bookAppointment: async input => appointmentService.createAppointment({ customerId: input.customerId, provider: "NR011 JAMES FLORES", treatmentCode: input.treatmentCode, startsAt: new Date(input.startsAt), durationMinutes: appointmentService.calculateDuration(input.treatmentCode), machineName: input.machineName ? normalizeMachine(input.machineName) : undefined }),
    requestHumanHandoff: async reason => { console.warn(`[AI handoff] ${reason}`); },
  }) : undefined;
  const webhookProcessor = new WebhookProcessor(messageService, contactResolver, conversationService, aiAgent && getOptionalWhatsAppConfig() ? async (event, conversation) => {
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
}
startServer().catch(console.error);
