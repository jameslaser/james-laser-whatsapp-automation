import { describe, expect, it } from "vitest";
import { AutomationService, type AutomationRepository, type AutomationSender } from "./automationService";
import type { AutomationJob } from "../types/operations";

function harness() {
  const jobs: AutomationJob[] = [];
  const sent: string[] = [];
  const repository: AutomationRepository = {
    findByIdempotencyKey: async key => jobs.find(job => job.idempotencyKey === key) || null,
    create: async job => { const created = { ...job, id: String(jobs.length + 1) }; jobs.push(created); return created; },
    claim: async id => { const job = jobs.find(item => item.id === id); if (!job || job.status !== "PENDING") return false; job.status = "PROCESSING"; return true; },
    markSent: async (id, completedAt) => { const job = jobs.find(item => item.id === id)!; job.status = "SENT"; job.completedAt = completedAt; },
    markFailed: async (id, error) => { const job = jobs.find(item => item.id === id)!; job.status = "FAILED"; job.error = error; },
    cancel: async id => { const job = jobs.find(item => item.id === id)!; job.status = "CANCELLED"; },
    due: async (now, limit) => jobs.filter(job => job.status === "PENDING" && job.scheduledAt <= now).slice(0, limit),
  };
  const sender: AutomationSender = { send: async job => { sent.push(job.type); } };
  return { service: new AutomationService(repository, sender), jobs, sent };
}

describe("AutomationService", () => {
  it("schedules every required lifecycle type idempotently and sends due templates once", async () => {
    const { service, jobs, sent } = harness();
    const types = ["appointmentConfirmation", "appointmentReminder24h", "sameDayReminder", "cancellation", "rescheduling", "retouchReminder", "nextSessionReminder", "postTreatmentFollowup", "feedbackRequest", "noShowFollowup", "leadFollowup"] as const;
    for (const type of types) await service.schedule(type, new Date("2026-09-10T10:00:00Z"), type, { recipient: "966500000000", conversationId: "1", templateName: "approved_template", languageCode: "en" });
    expect(await service.schedule("appointmentConfirmation", new Date("2026-09-10T10:00:00Z"), "appointmentConfirmation", { recipient: "other", conversationId: "2", templateName: "other", languageCode: "ar" })).toBe(jobs[0]);
    expect(await service.processDue(new Date("2026-09-10T11:00:00Z"))).toBe(types.length);
    expect(sent).toEqual(types);
  });

  it("cancels a pending reminder before the worker claims it", async () => {
    const { service, jobs, sent } = harness();
    const job = await service.schedule("appointmentReminder24h", new Date("2026-09-10T10:00:00Z"), "cancel-me", { recipient: "966500000000", conversationId: "1", templateName: "approved_template", languageCode: "en" });
    await service.cancel(job.id!);
    expect(jobs[0]?.status).toBe("CANCELLED");
    expect(await service.processDue(new Date("2026-09-10T11:00:00Z"))).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
