import { MACHINE_NAMES, type MachineName } from "../types/operations";

export interface AiToolContext {
  getVerifiedTreatment(treatmentCode: string): Promise<{ code: string; name: string; durationMinutes: number | null } | null>;
  checkAvailability(input: { treatmentCode: string; date: string }): Promise<unknown>;
  requestHumanHandoff(reason: string): Promise<void>;
}

export type AiToolName = "getVerifiedTreatment" | "checkAvailability" | "requestHumanHandoff";

export const aiTools = {
  getVerifiedTreatment: {
    name: "getVerifiedTreatment",
    description: "Retrieve treatment data from the application database. Never infer prices, durations, or package inclusions.",
    parameters: {
      type: "OBJECT",
      properties: { treatmentCode: { type: "STRING", description: "Exact treatment code from the approved catalog." } },
      required: ["treatmentCode"],
    },
  },
  checkAvailability: {
    name: "checkAvailability",
    description: "Retrieve available appointment slots for a treatment on a specific Riyadh date. Never invent availability.",
    parameters: {
      type: "OBJECT",
      properties: {
        treatmentCode: { type: "STRING", description: "Exact treatment code from the approved catalog." },
        date: { type: "STRING", description: "Clinic date in YYYY-MM-DD format, Riyadh local date." },
      },
      required: ["treatmentCode", "date"],
    },
  },
  requestHumanHandoff: {
    name: "requestHumanHandoff",
    description: "Pause AI and route a conversation to human staff when the customer requests a human or the topic is sensitive.",
    parameters: {
      type: "OBJECT",
      properties: { reason: { type: "STRING", description: "Short reason for the handoff." } },
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
