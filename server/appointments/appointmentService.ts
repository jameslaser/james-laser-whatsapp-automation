import type { AppointmentDraft, AvailabilitySlot } from "../types/operations";
import { TreatmentCatalog } from "./treatments";
import { MachineService } from "./machineService";

export interface AppointmentRecord extends AppointmentDraft { id: string; endsAt: Date; status: "Confirmed" | "Arrived" | "Completed"; }
export interface AppointmentRepository {
  listConflicts(startsAt: Date, endsAt: Date, excludeId?: string): Promise<AppointmentRecord[]>;
  listNurseConflicts(startsAt: Date, endsAt: Date): Promise<AppointmentRecord[]>;
  create(input: AppointmentDraft & { endsAt: Date; machineName: NonNullable<AppointmentDraft["machineName"]> }): Promise<AppointmentRecord>;
  confirm(id: string): Promise<AppointmentRecord>;
  cancel(id: string): Promise<AppointmentRecord>;
  reschedule(id: string, startsAt: Date, endsAt: Date): Promise<AppointmentRecord>;
}

export interface AppointmentPolicy { timezone: string; openingHour: number; closingHour: number; slotIntervalMinutes: number; }
export const DEFAULT_APPOINTMENT_POLICY: AppointmentPolicy = { timezone: "Asia/Riyadh", openingHour: 13, closingHour: 22, slotIntervalMinutes: 15 };

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { dateKey: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

export class AppointmentService {
  constructor(private readonly repository: AppointmentRepository, private readonly machines: MachineService, private readonly treatments = new TreatmentCatalog(), private readonly policy = DEFAULT_APPOINTMENT_POLICY) {}

  calculateDuration(treatmentCode: string) { return this.treatments.calculateDuration(treatmentCode); }

  checkBusinessHours(startsAt: Date, endsAt: Date): boolean {
    const start = zonedParts(startsAt, this.policy.timezone);
    const end = zonedParts(endsAt, this.policy.timezone);
    return start.minutes >= this.policy.openingHour * 60 && end.minutes <= this.policy.closingHour * 60 && start.dateKey === end.dateKey;
  }

  async checkAvailability(startsAt: Date, durationMinutes: number, excludeId?: string): Promise<{ available: boolean; reasons: string[]; machineNames: string[] }> {
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const reasons: string[] = [];
    if (!this.checkBusinessHours(startsAt, endsAt)) reasons.push("Requested time is outside clinic hours");
    if (startsAt.getMinutes() % this.policy.slotIntervalMinutes !== 0) reasons.push("Requested time is not aligned to the 15-minute slot interval");
    const [appointmentConflicts, nurseConflicts, machineNames] = await Promise.all([
      this.repository.listConflicts(startsAt, endsAt, excludeId),
      this.repository.listNurseConflicts(startsAt, endsAt),
      this.machines.getMachineAvailability(startsAt, endsAt),
    ]);
    if (appointmentConflicts.length) reasons.push("Appointment conflict detected");
    if (nurseConflicts.length) reasons.push("Nurse availability conflict detected");
    if (!machineNames.length) reasons.push("No machine is available");
    return { available: reasons.length === 0, reasons, machineNames };
  }

  async findAvailableSlots(date: Date, treatmentCode: string): Promise<AvailabilitySlot[]> {
    const duration = this.calculateDuration(treatmentCode);
    const slots: AvailabilitySlot[] = [];
    const dateKey = zonedParts(date, this.policy.timezone).dateKey;
    const offset = this.policy.timezone === "Asia/Riyadh" ? "+03:00" : "Z";
    const start = new Date(`${dateKey}T${String(this.policy.openingHour).padStart(2, "0")}:00:00${offset}`);
    const close = new Date(`${dateKey}T${String(this.policy.closingHour).padStart(2, "0")}:00:00${offset}`);
    for (let cursor = start; cursor.getTime() + duration * 60_000 <= close.getTime(); cursor = new Date(cursor.getTime() + this.policy.slotIntervalMinutes * 60_000)) {
      const result = await this.checkAvailability(cursor, duration);
      slots.push({ startsAt: new Date(cursor), endsAt: new Date(cursor.getTime() + duration * 60_000), available: result.available, machineNames: result.machineNames as AvailabilitySlot["machineNames"] });
    }
    return slots.filter(slot => slot.available);
  }

  async createAppointment(input: AppointmentDraft): Promise<AppointmentRecord> {
    const result = await this.checkAvailability(input.startsAt, input.durationMinutes);
    if (!result.available) throw new Error(`Appointment cannot be created: ${result.reasons.join("; ")}`);
    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    const machineName = await this.machines.assignMachine(input.startsAt, endsAt, input.machineName);
    return this.repository.create({ ...input, endsAt, machineName, status: "Confirmed" });
  }

  confirmAppointment(id: string) { return this.repository.confirm(id); }
  cancelAppointment(id: string) { return this.repository.cancel(id); }

  async rescheduleAppointment(id: string, startsAt: Date, durationMinutes: number): Promise<AppointmentRecord> {
    const result = await this.checkAvailability(startsAt, durationMinutes, id);
    if (!result.available) throw new Error(`Appointment cannot be rescheduled: ${result.reasons.join("; ")}`);
    return this.repository.reschedule(id, startsAt, new Date(startsAt.getTime() + durationMinutes * 60_000));
  }
}
