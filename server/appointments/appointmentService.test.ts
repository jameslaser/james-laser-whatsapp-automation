import { describe, expect, it } from "vitest";
import { AppointmentService, type AppointmentRecord, type AppointmentRepository } from "./appointmentService";
import { MachineService, type MachineRepository, type MachineReservation } from "./machineService";

function buildService(conflicts: AppointmentRecord[] = []) {
  const appointments: AppointmentRecord[] = [];
  const reservations: MachineReservation[] = [];
  const appointmentRepository: AppointmentRepository = {
    listConflicts: async () => conflicts,
    listNurseConflicts: async () => [],
    create: async input => ({ ...input, id: "appointment-1", endsAt: input.endsAt, status: "Confirmed" }),
    confirm: async id => appointments.find(item => item.id === id)!,
    cancel: async id => appointments.find(item => item.id === id)!,
    reschedule: async (id, startsAt, endsAt) => ({ ...appointments.find(item => item.id === id)!, startsAt, endsAt }),
  };
  const machineRepository: MachineRepository = {
    listReservations: async () => reservations,
    reserve: async input => { reservations.push(input); },
    release: async () => undefined,
    block: async () => undefined,
  };
  return new AppointmentService(appointmentRepository, new MachineService(machineRepository));
}

describe("AppointmentService", () => {
  it("rejects a booking outside 13:00–22:00", async () => {
    const service = buildService();
    const result = await service.checkAvailability(new Date("2026-09-10T12:00:00+03:00"), 15);
    expect(result.available).toBe(false);
    expect(result.reasons).toContain("Requested time is outside clinic hours");
  });

  it("rejects conflicting appointments", async () => {
    const conflict = { id: "existing", customerId: "customer", treatmentCode: "full-face", startsAt: new Date("2026-09-10T14:00:00+03:00"), endsAt: new Date("2026-09-10T14:15:00+03:00"), durationMinutes: 15, machineName: "Deka Again 1" as const, status: "Confirmed" as const };
    const result = await buildService([conflict]).checkAvailability(new Date("2026-09-10T14:00:00+03:00"), 15);
    expect(result.available).toBe(false);
    expect(result.reasons).toContain("Appointment conflict detected");
  });

  it("books an available appointment and selects an approved machine", async () => {
    const result = await buildService().createAppointment({ customerId: "contact-1", provider: "NR011 JAMES FLORES", treatmentCode: "full-face", startsAt: new Date("2026-09-10T18:00:00+03:00"), durationMinutes: 15 });
    expect(result.status).toBe("Confirmed");
    expect(["Deka Again 1", "Clarity 2", "Gentle Pro Max", "Dueto"]).toContain(result.machineName);
  });
});
