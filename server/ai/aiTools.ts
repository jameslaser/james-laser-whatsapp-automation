import { MACHINE_NAMES, type MachineName } from "../types/operations";

export interface AiToolContext {
  getVerifiedTreatment(treatmentCode: string): Promise<{ code: string; name: string; durationMinutes: number | null } | null>;
  checkAvailability(input: { treatmentCode: string; date: string; preferredTime?: string; windowMinutes?: number }): Promise<unknown>;
  createAppointment(input: {
    conversationId: string;
    treatmentCode: string;
    date: string;
    time: string;
    customerName: string;
    confirmedByCustomer: boolean;
  }): Promise<unknown>;
  requestHumanHandoff(reason: string): Promise<void>;
}

export type AiToolName = "getVerifiedTreatment" | "checkAvailability" | "createAppointment" | "requestHumanHandoff";

export const aiTools = {
  getVerifiedTreatment: {
    name: "getVerifiedTreatment",
    description: "Retrieve treatment data from the application database. Never infer prices, durations, or package inclusions.",
    parameters: {
      type: "object",
      properties: { treatmentCode: { type: "string", description: "Exact treatment code from the approved catalog." } },
      required: ["treatmentCode"],
    },
  },
  checkAvailability: {
    name: "checkAvailability",
    description: "Retrieve real available appointment slots for a treatment on a specific Riyadh date. If the customer gave an approximate time, provide it as preferredTime and use a 60-minute window. Never invent availability.",
    parameters: {
      type: "object",
      properties: {
        treatmentCode: { type: "string", description: "Exact treatment code from the approved catalog." },
        date: { type: "string", description: "Clinic date in YYYY-MM-DD format, Riyadh local date." },
        preferredTime: { type: "string", description: "Optional preferred Riyadh time in HH:mm format, such as 15:00." },
        windowMinutes: { type: "integer", description: "Optional preferred-time window in minutes. Default 60." },
      },
      required: ["treatmentCode", "date"],
    },
  },
  createAppointment: {
    name: "createAppointment",
    description: "Create a real confirmed appointment only after the customer has explicitly confirmed the exact offered Riyadh date and time. The application rechecks availability, assigns an approved laser machine, uses provider NR011 JAMES FLORES, and persists the appointment. Never use this tool for a tentative or unconfirmed slot.",
    parameters: {
      type: "object",
      properties: {
        treatmentCode: { type: "string", description: "Exact treatment code from the approved catalog." },
        date: { type: "string", description: "Confirmed Riyadh clinic date in YYYY-MM-DD format." },
        time: { type: "string", description: "Confirmed Riyadh clinic time in HH:mm format." },
        customerName: { type: "string", description: "Customer's full name as provided in the conversation." },
        confirmedByCustomer: { type: "boolean", description: "Must be true only when the customer explicitly confirmed the exact offered slot." },
      },
      required: ["treatmentCode", "date", "time", "customerName", "confirmedByCustomer"],
    },
  },
  requestHumanHandoff: {
    name: "requestHumanHandoff",
    description: "Pause AI and route a conversation to human staff when the customer requests a human or the topic is sensitive.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Short reason for the handoff." } },
      required: ["reason"],
    },
  },
} as const;

export function isEscalationRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  return ["human", "agent", "complaint", "refund", "medical", "doctor", "manager", "شكوى", "استرداد", "طبيب", "موظف"].some(term => normalized.includes(term));
}

export function assertKnownMachine(machine: string): MachineName {
  if (!MACHINE_NAMES.includes(machine as MachineName)) throw new Error(`Unsupported machine: ${machine}`);
  return machine as MachineName;
}
