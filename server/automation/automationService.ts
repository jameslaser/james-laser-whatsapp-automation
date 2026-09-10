import type { AutomationJob, AutomationStatus } from "../types/operations";
export type AutomationType = "appointmentConfirmation" | "appointmentReminder24h" | "sameDayReminder" | "cancellation" | "rescheduling" | "retouchReminder" | "nextSessionReminder" | "postTreatmentFollowup" | "feedbackRequest" | "noShowFollowup" | "leadFollowup";
export interface AutomationRepository { findByIdempotencyKey(key: string): Promise<AutomationJob | null>; create(job: AutomationJob): Promise<AutomationJob>; claim(id: string): Promise<boolean>; markSent(id: string, completedAt: Date): Promise<void>; markFailed(id: string, error: string): Promise<void>; cancel(id: string): Promise<void>; due(now: Date, limit: number): Promise<AutomationJob[]>; }
export interface AutomationSender { send(job: AutomationJob): Promise<void>; }
export class AutomationService {
  constructor(private readonly repository: AutomationRepository, private readonly sender?: AutomationSender) {}
  async schedule(type: AutomationType, scheduledAt: Date, idempotencyKey: string, delivery?: Pick<AutomationJob, "recipient" | "conversationId" | "templateName" | "languageCode" | "components">): Promise<AutomationJob> { const existing = await this.repository.findByIdempotencyKey(idempotencyKey); if (existing) return existing; return this.repository.create({ type, scheduledAt, status: "PENDING", attempts: 0, idempotencyKey, ...delivery }); }
  async processDue(now = new Date(), limit = 50): Promise<number> { let processed = 0; for (const job of await this.repository.due(now, limit)) { if (!(await this.repository.claim(job.id!))) continue; try { await this.execute(job); await this.repository.markSent(job.id!, new Date()); } catch (error) { await this.repository.markFailed(job.id!, error instanceof Error ? error.message : "Unknown automation failure"); } processed++; } return processed; }
  cancel(id: string) { return this.repository.cancel(id); }
  private async execute(job: AutomationJob): Promise<void> { if (!this.sender) throw new Error("Automation sender is not configured"); await this.sender.send(job); }
}
export function isAutomationStatus(value: string): value is AutomationStatus { return ["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"].includes(value); }
