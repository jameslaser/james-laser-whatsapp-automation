import { MACHINE_NAMES, type MachineName } from "../types/operations";
export interface AiToolContext {
  getVerifiedTreatment(treatmentCode: string): Promise<{ code: string; name: string; durationMinutes: number | null } | null>;
  checkAvailability(input: { treatmentCode: string; date: string }): Promise<unknown>;
  bookAppointment(input: { customerId: string; treatmentCode: string; startsAt: string; machineName?: string }): Promise<unknown>;
  requestHumanHandoff(reason: string): Promise<void>;
}
export const aiTools = {
  getVerifiedTreatment: { name: "getVerifiedTreatment", description: "Retrieve treatment data from the application database. Never infer prices, durations, or package inclusions." },
  checkAvailability: { name: "checkAvailability", description: "Retrieve available slots from the appointment service. Never invent availability." },
  bookAppointment: { name: "bookAppointment", description: "Create an appointment only after the customer explicitly confirms the treatment and time; provider and machine rules are enforced by the application." },
  requestHumanHandoff: { name: "requestHumanHandoff", description: "Pause AI and route a conversation to human staff." },
} as const;
export function isEscalationRequest(text: string): boolean { const normalized = text.toLowerCase(); return ["human", "agent", "complaint", "refund", "medical", "doctor", "manager", "شكوى", "استرداد", "طبيب", "موظف"].some(term => normalized.includes(term)); }
export function assertKnownMachine(machine: string): MachineName { if (!MACHINE_NAMES.includes(machine as MachineName)) throw new Error(`Unsupported machine: ${machine}`); return machine as MachineName; }
