import { and, eq, gt, lt, or } from "drizzle-orm";
import { getDb } from "../db";
import { appointments, availabilities, leads, machines, notifications, patients, whatsappAutomations, whatsappContacts, whatsappConversations, whatsappMessages, whatsappWebhookEvents } from "../../drizzle/schema";
import type { AppointmentDraft, AutomationJob, AutomationStatus, IncomingMessageEvent, MachineName } from "../types/operations";
import type { AppointmentRecord, AppointmentRepository } from "../appointments/appointmentService";
import type { MachineRepository, MachineReservation } from "../appointments/machineService";
import type { AutomationRepository } from "../automation/automationService";
import type { ContactRepository, ResolvedContact } from "../integrations/whatsapp/contacts/contactResolver";
import type { ConversationRecord, ConversationRepository } from "../integrations/whatsapp/conversations/conversationService";
import type { ContextMessage } from "../ai/conversationContext";
import type { AgentContextRepository } from "../ai/aiAgent";
import type { MessageRepository } from "../integrations/whatsapp/messages/messageService";

async function database(): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  return db;
}

export function normalizeProvider(provider: string): "NR011 JAMES FLORES" {
  const normalized = provider.trim().toUpperCase();
  if (normalized === "NR011" || normalized === "MOHAMED TAHA (JF)" || normalized === "NR011 JAMES FLORES") return "NR011 JAMES FLORES";
  throw new Error("Provider rejected. Only NR011 JAMES FLORES is allowed.");
}

export function normalizeMachine(machine: string): MachineName {
  const normalized = machine.trim().toUpperCase();
  if (normalized === "DEKA AGAIN" || normalized === "DEKA AGAIN 1") return "Deka Again 1";
  if (normalized === "CLARITY 2") return "Clarity 2";
  if (normalized === "GENTLE PROMAX" || normalized === "GENTLE PRO MAX") return "Gentle Pro Max";
  if (normalized === "DUETTO MACHINE" || normalized === "DUETO") return "Dueto";
  throw new Error("Machine rejected. Only Deka Again, Clarity 2, Gentle Promax, and Duetto are allowed.");
}

export class DatabaseContactRepository implements ContactRepository {
  async findByWhatsAppNumber(phoneNumber: string): Promise<ResolvedContact | null> {
    const db = await database();
    const rows = await db.select().from(whatsappContacts).where(eq(whatsappContacts.phoneNumber, phoneNumber)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return { id: String(row.id), phoneNumber: row.phoneNumber, kind: row.patientId ? "patient" : "lead", created: false };
  }

  async createLeadFromWhatsApp(phoneNumber: string): Promise<ResolvedContact> {
    const db = await database();
    return db.transaction(async (tx: any) => {
      const existing = await tx.select().from(whatsappContacts).where(eq(whatsappContacts.phoneNumber, phoneNumber)).limit(1);
      if (existing[0]) return { id: String(existing[0].id), phoneNumber, kind: existing[0].patientId ? "patient" : "lead", created: false };
      const lead = await tx.insert(leads).values({ phoneNumber, source: "whatsapp", status: "new" });
      const leadId = Number(lead[0]?.insertId);
      const contact = await tx.insert(whatsappContacts).values({ phoneNumber, leadId: leadId || undefined, optedOut: false });
      return { id: String(contact[0]?.insertId), phoneNumber, kind: "lead", created: true };
    });
  }
}

function toConversation(row: any): ConversationRecord {
  return { id: String(row.id), contactId: String(row.contactId), status: row.status, aiPaused: Boolean(row.aiPaused), assignedStaffId: row.assignedStaffId ? String(row.assignedStaffId) : undefined, lastActivityAt: new Date(row.lastActivityAt) };
}

export class DatabaseConversationRepository implements ConversationRepository, AgentContextRepository {
  async list(limit = 50): Promise<ConversationRecord[]> {
    const db = await database();
    const rows = await db.select().from(whatsappConversations).limit(limit);
    return rows.map(toConversation);
  }

  async findOpenByContact(contactId: string): Promise<ConversationRecord | null> {
    const db = await database();
    const rows = await db.select().from(whatsappConversations).where(and(eq(whatsappConversations.contactId, Number(contactId)), or(eq(whatsappConversations.status, "AI_ACTIVE"), eq(whatsappConversations.status, "HUMAN_REQUIRED"), eq(whatsappConversations.status, "HUMAN_ACTIVE")))).limit(1);
    return rows[0] ? toConversation(rows[0]) : null;
  }
  async create(contactId: string): Promise<ConversationRecord> {
    const db = await database();
    const result = await db.insert(whatsappConversations).values({ contactId: Number(contactId), status: "AI_ACTIVE", aiPaused: false });
    const id = Number(result[0]?.insertId);
    const rows = await db.select().from(whatsappConversations).where(eq(whatsappConversations.id, id)).limit(1);
    if (!rows[0]) throw new Error("Conversation was not created");
    return toConversation(rows[0]);
  }
  async update(id: string, patch: Partial<ConversationRecord>): Promise<ConversationRecord> {
    const db = await database();
    await db.update(whatsappConversations).set({ status: patch.status, aiPaused: patch.aiPaused, assignedStaffId: patch.assignedStaffId ? Number(patch.assignedStaffId) : undefined, lastActivityAt: patch.lastActivityAt }).where(eq(whatsappConversations.id, Number(id)));
    const rows = await db.select().from(whatsappConversations).where(eq(whatsappConversations.id, Number(id))).limit(1);
    if (!rows[0]) throw new Error("Conversation not found");
    return toConversation(rows[0]);
  }
  async addMessage(conversationId: string, messageId: string): Promise<void> {
    const db = await database();
    await db.update(whatsappMessages).set({ conversationId: Number(conversationId) }).where(eq(whatsappMessages.waMessageId, messageId));
  }
  async getConversation(id: string): Promise<ConversationRecord | null> {
    const db = await database();
    const rows = await db.select().from(whatsappConversations).where(eq(whatsappConversations.id, Number(id))).limit(1);
    return rows[0] ? toConversation(rows[0]) : null;
  }
  async getRecentMessages(conversationId: string, limit: number): Promise<ContextMessage[]> {
    const db = await database();
    const rows = await db.select().from(whatsappMessages).where(eq(whatsappMessages.conversationId, Number(conversationId))).limit(limit);
    return rows.reverse().filter((row: any) => row.body).map((row: any) => ({ role: row.direction === "OUTBOUND" ? "assistant" : "user", content: String(row.body) }));
  }
  async getVerifiedFacts(_conversationId: string): Promise<Record<string, unknown>> { return {}; }
}

export class DatabaseMessageRepository implements MessageRepository {
  async hasWebhookEvent(eventId: string): Promise<boolean> {
    const db = await database();
    const rows = await db.select({ id: whatsappWebhookEvents.id }).from(whatsappWebhookEvents).where(eq(whatsappWebhookEvents.eventId, eventId)).limit(1);
    return Boolean(rows[0]);
  }
  async recordWebhookEvent(eventId: string, payload: Record<string, unknown>): Promise<void> {
    const db = await database();
    await db.insert(whatsappWebhookEvents).values({ eventId, payload });
  }
  async saveIncomingMessage(event: IncomingMessageEvent, contactId: string, conversationId: string): Promise<void> {
    const db = await database();
    await db.insert(whatsappMessages).values({ conversationId: Number(conversationId), contactId: Number(contactId), waMessageId: event.waMessageId, direction: "INBOUND", kind: event.kind, body: event.text, mediaId: event.mediaId, status: "received", rawPayload: event.raw });
  }
  async saveOutgoingMessage(input: { waMessageId: string; to: string; conversationId?: string; payload: Record<string, unknown>; status: string }): Promise<void> {
    const db = await database();
    const contact = await db.select().from(whatsappContacts).where(eq(whatsappContacts.phoneNumber, input.to)).limit(1);
    if (!contact[0]) throw new Error("Cannot persist outgoing message: WhatsApp contact does not exist");
    if (!input.conversationId) throw new Error("Cannot persist outgoing message: conversationId is required");
    await db.insert(whatsappMessages).values({ conversationId: Number(input.conversationId), contactId: contact[0].id, waMessageId: input.waMessageId, direction: "OUTBOUND", kind: "text", body: typeof input.payload.text === "string" ? input.payload.text : undefined, status: input.status, rawPayload: input.payload });
  }
  async updateMessageStatus(waMessageId: string, status: string, raw: Record<string, unknown>): Promise<void> {
    const db = await database();
    await db.update(whatsappMessages).set({ status, rawPayload: raw }).where(eq(whatsappMessages.waMessageId, waMessageId));
  }
}

function toAppointment(row: any): AppointmentRecord {
  return { id: String(row.id), customerId: String(row.patientId || row.leadId || ""), provider: normalizeProvider(row.provider || "NR011"), treatmentCode: row.treatmentCode, startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt), durationMinutes: Math.round((new Date(row.endsAt).getTime() - new Date(row.startsAt).getTime()) / 60000), machineName: normalizeMachine(row.machineName), status: row.status };
}

export class DatabaseMachineRepository implements MachineRepository {
  async listReservations(startsAt: Date, endsAt: Date): Promise<MachineReservation[]> {
    const db = await database();
    const rows = await db.select().from(appointments).where(and(lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt)));
    return rows.map((row: any) => ({ machineName: normalizeMachine(row.machineName), startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt), appointmentId: String(row.id) }));
  }
  async reserve(input: MachineReservation): Promise<void> {
    const db = await database();
    const conflicts = await this.listReservations(input.startsAt, input.endsAt);
    if (conflicts.some(item => item.machineName === input.machineName && item.appointmentId !== input.appointmentId)) throw new Error("Machine conflict detected");
  }
  async release(_appointmentId: string): Promise<void> {}
  async block(machineName: MachineName, startsAt: Date, endsAt: Date, reason: string): Promise<void> {
    const db = await database();
    await db.insert(availabilities).values({ machineName: normalizeMachine(machineName), startsAt, endsAt, kind: "BLOCKED", reason });
  }
}

export class DatabaseAppointmentRepository implements AppointmentRepository {
  async listConflicts(startsAt: Date, endsAt: Date, excludeId?: string): Promise<AppointmentRecord[]> {
    const db = await database();
    const rows = await db.select().from(appointments).where(and(lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt)));
    return rows.filter((row: any) => String(row.id) !== excludeId).map(toAppointment);
  }
  async listNurseConflicts(startsAt: Date, endsAt: Date): Promise<AppointmentRecord[]> {
    return this.listConflicts(startsAt, endsAt);
  }
  async create(input: AppointmentDraft & { endsAt: Date; machineName: NonNullable<AppointmentDraft["machineName"]> }): Promise<AppointmentRecord> {
    const db = await database();
    const provider = normalizeProvider(input.provider || process.env.HMS_PROVIDER || "NR011");
    const result = await db.insert(appointments).values({ patientId: Number(input.customerId) || undefined, provider, treatmentCode: input.treatmentCode, startsAt: input.startsAt, endsAt: input.endsAt, machineName: normalizeMachine(input.machineName), status: "Confirmed" });
    const rows = await db.select().from(appointments).where(eq(appointments.id, Number(result[0]?.insertId))).limit(1);
    if (!rows[0]) throw new Error("Appointment was not created");
    return toAppointment(rows[0]);
  }
  async confirm(id: string): Promise<AppointmentRecord> { return this.setStatus(id, "Confirmed"); }
  async cancel(id: string): Promise<AppointmentRecord> { throw new Error("Cancelled is not an allowed appointment status under the active HMS policy"); }
  async reschedule(id: string, startsAt: Date, endsAt: Date): Promise<AppointmentRecord> {
    const db = await database();
    await db.update(appointments).set({ startsAt, endsAt }).where(eq(appointments.id, Number(id)));
    const rows = await db.select().from(appointments).where(eq(appointments.id, Number(id))).limit(1);
    if (!rows[0]) throw new Error("Appointment not found");
    return toAppointment(rows[0]);
  }
  private async setStatus(id: string, status: "Confirmed" | "Arrived" | "Completed"): Promise<AppointmentRecord> {
    const db = await database();
    await db.update(appointments).set({ status }).where(eq(appointments.id, Number(id)));
    const rows = await db.select().from(appointments).where(eq(appointments.id, Number(id))).limit(1);
    if (!rows[0]) throw new Error("Appointment not found");
    return toAppointment(rows[0]);
  }
}

export class DatabaseAutomationRepository implements AutomationRepository {
  async findByIdempotencyKey(key: string): Promise<AutomationJob | null> { const db = await database(); const rows = await db.select().from(whatsappAutomations).where(eq(whatsappAutomations.idempotencyKey, key)).limit(1); return rows[0] ? this.toJob(rows[0]) : null; }
  async create(job: AutomationJob): Promise<AutomationJob> { const db = await database(); const result = await db.insert(whatsappAutomations).values({ type: job.type, scheduledAt: job.scheduledAt, status: job.status, attempts: job.attempts, idempotencyKey: job.idempotencyKey }); const rows = await db.select().from(whatsappAutomations).where(eq(whatsappAutomations.id, Number(result[0]?.insertId))).limit(1); if (!rows[0]) throw new Error("Automation job was not created"); return this.toJob(rows[0]); }
  async claim(id: string): Promise<boolean> { const db = await database(); const result = await db.update(whatsappAutomations).set({ status: "PROCESSING", attempts: 1, lastAttemptAt: new Date() }).where(and(eq(whatsappAutomations.id, Number(id)), eq(whatsappAutomations.status, "PENDING"))); return Number(result[0]?.affectedRows || 0) === 1; }
  async markSent(id: string, completedAt: Date): Promise<void> { const db = await database(); await db.update(whatsappAutomations).set({ status: "SENT", completedAt }).where(eq(whatsappAutomations.id, Number(id))); }
  async markFailed(id: string, error: string): Promise<void> { const db = await database(); await db.update(whatsappAutomations).set({ status: "FAILED", error }).where(eq(whatsappAutomations.id, Number(id))); }
  async cancel(id: string): Promise<void> { const db = await database(); await db.update(whatsappAutomations).set({ status: "CANCELLED" }).where(eq(whatsappAutomations.id, Number(id))); }
  async due(now: Date, limit: number): Promise<AutomationJob[]> { const db = await database(); const rows = await db.select().from(whatsappAutomations).where(and(eq(whatsappAutomations.status, "PENDING"), lt(whatsappAutomations.scheduledAt, now))).limit(limit); return rows.map((row: any) => this.toJob(row)); }
  private toJob(row: any): AutomationJob { return { id: String(row.id), type: row.type, scheduledAt: new Date(row.scheduledAt), status: row.status as AutomationStatus, attempts: row.attempts, lastAttemptAt: row.lastAttemptAt ? new Date(row.lastAttemptAt) : undefined, error: row.error || undefined, completedAt: row.completedAt ? new Date(row.completedAt) : undefined, idempotencyKey: row.idempotencyKey }; }
}
