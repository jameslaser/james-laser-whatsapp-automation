import { MACHINE_NAMES, type MachineName } from "../types/operations";

export interface AiToolContext {
  getVerifiedTreatment(treatmentCode: string): Promise<{ code: string; name: string; durationMinutes: number | null } | null>;
  checkAvailability(input: { treatmentCode: string; date: string }): Promise<unknown>;
  bookAppointment(input: {
    conversationId: string;
    contactId: string;
    treatmentCode: string;
    date: string;
    time: string;
    customerName: string;
    machineName?: string;
    confirmedByCustomer: boolean;
  }): Promise<unknown>;
  requestHumanHandoff(reason: string): Promise<void>;
}

export const aiTools = {
  getVerifiedTreatment: { name: "getVerifiedTreatment", description: "Retrieve treatment data from the application database. Never infer prices, durations, or package inclusions." },
  checkAvailability: { name: "checkAvailability", description: "Retrieve available slots from the appointment service. Never invent availability." },
  bookAppointment: { name: "bookAppointment", description: "Create a confirmed appointment only after the customer has explicitly confirmed the exact treatment and exact appointment time. The application performs a final availability check and enforces the approved provider and machine rules." },
  requestHumanHandoff: { name: "requestHumanHandoff", description: "Pause AI and route a conversation to human staff." },
} as const;

export function isEscalationRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  return ["human", "agent", "complaint", "refund", "medical", "doctor", "manager", "شكوى", "استرداد", "طبيب", "موظف"].some(term => normalized.includes(term));
}

export function isExplicitBookingConfirmation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^(yes|yeah|yep|ok|okay|confirm|confirmed|book it|go ahead|do it|please book|نعم|تمام|موافق|أكد|تأكيد|احجز|احجزها|توكل)/i.test(normalized)
    || /\b(confirm|confirmed|book it|go ahead)\b/i.test(normalized);
}

export function assertKnownMachine(machine: string): MachineName {
  if (!MACHINE_NAMES.includes(machine as MachineName)) throw new Error(`Unsupported machine: ${machine}`);
  return machine as MachineName;
}
