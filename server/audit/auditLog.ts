export type AuditAction = "incoming_message" | "outgoing_message" | "appointment_created" | "appointment_cancelled" | "appointment_rescheduled" | "ai_response" | "human_takeover" | "automation_execution" | "campaign_execution" | "error";
export interface AuditEntry { action: AuditAction; actorId?: string; entityType: string; entityId?: string; metadata?: Record<string, unknown>; createdAt: Date; }
export interface AuditRepository { append(entry: AuditEntry): Promise<void>; }

export class AuditLogService {
  constructor(private readonly repository: AuditRepository) {}
  record(action: AuditAction, entityType: string, entityId?: string, metadata?: Record<string, unknown>, actorId?: string) {
    return this.repository.append({ action, entityType, entityId, metadata, actorId, createdAt: new Date() });
  }
}
