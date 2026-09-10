import { eq } from "drizzle-orm";
import { appointments, leads, patients, whatsappContacts } from "../../drizzle/schema";
import { getDb } from "../db";
import { AppointmentService, parseRiyadhDateTime, type AppointmentRecord } from "./appointmentService";
import type { AutomationService } from "../automation/automationService";

export interface BookingResult {
  appointment: AppointmentRecord;
  customerName: string;
  phoneNumber: string;
  confirmationScheduled: boolean;
  reminder24hScheduled: boolean;
  sameDayReminderScheduled: boolean;
}

function requireCustomerName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new Error("Customer full name is required before booking");
  if (name.length > 255) throw new Error("Customer full name is too long");
  return name;
}

export class BookingService {
  constructor(
    private readonly appointmentsService: AppointmentService,
    private readonly automations: AutomationService,
  ) {}

  async createConfirmedWhatsAppBooking(input: {
    conversationId: string;
    contactId: string;
    treatmentCode: string;
    date: string;
    time: string;
    customerName: string;
    confirmedByCustomer: boolean;
  }): Promise<BookingResult> {
    if (!input.confirmedByCustomer) throw new Error("Customer confirmation is required before creating the appointment");

    const customerName = requireCustomerName(input.customerName);
    const startsAt = parseRiyadhDateTime(input.date, input.time);
    const now = new Date();
    if (startsAt.getTime() <= now.getTime()) throw new Error("The requested appointment time has already passed");

    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is not configured");

    const contactRows = await db.select().from(whatsappContacts).where(eq(whatsappContacts.id, Number(input.contactId))).limit(1);
    const contact = contactRows[0];
    if (!contact) throw new Error("WhatsApp contact was not found");

    let patientId = contact.patientId ? Number(contact.patientId) : 0;
    if (!patientId) {
      const existingPatient = await db.select({ id: patients.id }).from(patients).where(eq(patients.phoneNumber, contact.phoneNumber)).limit(1);
      if (existingPatient[0]) {
        patientId = Number(existingPatient[0].id);
      } else {
        const lead = contact.leadId
          ? (await db.select({ fullName: leads.fullName }).from(leads).where(eq(leads.id, Number(contact.leadId))).limit(1))[0]
          : undefined;
        const patientInsert = await db.insert(patients).values({
          fullName: customerName || lead?.fullName || `WhatsApp Customer ${contact.phoneNumber}`,
          phoneNumber: contact.phoneNumber,
        });
        patientId = Number(patientInsert[0]?.insertId);
      }
      if (!patientId) throw new Error("Unable to create or resolve patient record");
      await db.update(whatsappContacts).set({ patientId, displayName: customerName }).where(eq(whatsappContacts.id, Number(input.contactId)));
    } else {
      await db.update(patients).set({ fullName: customerName }).where(eq(patients.id, patientId));
      await db.update(whatsappContacts).set({ displayName: customerName }).where(eq(whatsappContacts.id, Number(input.contactId)));
    }

    const appointment = await this.appointmentsService.createAppointment({
      customerId: String(patientId),
      provider: "NR011 JAMES FLORES",
      treatmentCode: input.treatmentCode,
      startsAt,
      durationMinutes: this.appointmentsService.calculateDuration(input.treatmentCode),
      status: "Confirmed",
    });

    const confirmationScheduled = await this.scheduleOnce(
      "appointmentConfirmation",
      new Date(),
      `appointment:${appointment.id}:confirmation`,
      appointment.id,
      input.contactId,
    );

    const reminder24hAt = new Date(startsAt.getTime() - 24 * 60 * 60_000);
    const reminder24hScheduled = reminder24hAt.getTime() > now.getTime()
      ? await this.scheduleOnce("appointmentReminder24h", reminder24hAt, `appointment:${appointment.id}:reminder24h`, appointment.id, input.contactId)
      : false;

    const sameDayMinutes = Math.max(15, Number(process.env.WHATSAPP_SAME_DAY_REMINDER_MINUTES_BEFORE || "180"));
    const sameDayAt = new Date(startsAt.getTime() - sameDayMinutes * 60_000);
    const sameDayReminderScheduled = sameDayAt.getTime() > now.getTime()
      ? await this.scheduleOnce("sameDayReminder", sameDayAt, `appointment:${appointment.id}:sameDay:${sameDayMinutes}`, appointment.id, input.contactId)
      : false;

    return {
      appointment,
      customerName,
      phoneNumber: contact.phoneNumber,
      confirmationScheduled,
      reminder24hScheduled,
      sameDayReminderScheduled,
    };
  }

  private async scheduleOnce(type: Parameters<AutomationService["schedule"]>[0], scheduledAt: Date, idempotencyKey: string, appointmentId: string, contactId: string): Promise<boolean> {
    try {
      await this.automations.schedule(type, scheduledAt, idempotencyKey, { appointmentId, contactId });
      return true;
    } catch (error) {
      if (error instanceof Error && /idempotency/i.test(error.message)) return false;
      throw error;
    }
  }
}
