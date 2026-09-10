export const CANONICAL_WHATSAPP = {
  wabaId: "1833666484124208",
  businessPortfolio: "JAMES LASER",
  businessApp: "James Laser Hair Removal WhatsApp Business App",
} as const;

export const MACHINE_NAMES = ["Deka Again 1", "Clarity 2", "Gentle Pro Max", "Dueto"] as const;
export type MachineName = (typeof MACHINE_NAMES)[number];

export const CONVERSATION_STATUSES = ["AI_ACTIVE", "HUMAN_REQUIRED", "HUMAN_ACTIVE", "CLOSED"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const AUTOMATION_STATUSES = ["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const APPOINTMENT_STATUSES = ["Confirmed", "Arrived", "Completed"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type SupportedMessageKind = "text" | "interactive" | "image" | "audio" | "document" | "unknown";

export interface WhatsAppMessageInput {
  to: string;
  text: string;
  previewUrl?: boolean;
}

export interface WhatsAppTemplateInput {
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}

export interface WhatsAppInteractiveInput {
  to: string;
  interactive: Record<string, unknown>;
}

export interface WhatsAppMediaInput {
  to: string;
  mediaType: "image" | "audio" | "video" | "document";
  mediaId?: string;
  link?: string;
  caption?: string;
  filename?: string;
}

export interface IncomingMessageEvent {
  eventId: string;
  phoneNumberId: string;
  waMessageId: string;
  from: string;
  timestamp: Date;
  kind: SupportedMessageKind;
  text?: string;
  mediaId?: string;
  raw: Record<string, unknown>;
}

export interface AppointmentDraft {
  customerId: string;
  provider?: string;
  treatmentCode: string;
  startsAt: Date;
  durationMinutes: number;
  machineName?: MachineName;
  status?: AppointmentStatus;
}

export interface AvailabilitySlot {
  startsAt: Date;
  endsAt: Date;
  available: boolean;
  machineNames: MachineName[];
}

export interface AutomationJob {
  id?: string;
  type: string;
  scheduledAt: Date;
  status: AutomationStatus;
  attempts: number;
  lastAttemptAt?: Date;
  error?: string;
  completedAt?: Date;
  idempotencyKey: string;
}

export interface HealthCheck {
  name: string;
  status: "ok" | "degraded" | "not_configured" | "error";
  detail?: string;
  checkedAt: Date;
}
