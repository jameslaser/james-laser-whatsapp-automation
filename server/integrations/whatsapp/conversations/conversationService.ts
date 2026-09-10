import type { ConversationStatus } from "../../../types/operations";

export interface ConversationRecord {
  id: string;
  contactId: string;
  status: ConversationStatus;
  aiPaused: boolean;
  assignedStaffId?: string;
  lastActivityAt: Date;
}

export interface ConversationRepository {
  findOpenByContact(contactId: string): Promise<ConversationRecord | null>;
  create(contactId: string): Promise<ConversationRecord>;
  update(id: string, patch: Partial<ConversationRecord>): Promise<ConversationRecord>;
  addMessage(conversationId: string, messageId: string): Promise<void>;
}

export class ConversationService {
  constructor(private readonly repository: ConversationRepository) {}

  async findOrCreate(contactId: string): Promise<ConversationRecord> {
    return (await this.repository.findOpenByContact(contactId)) ?? this.repository.create(contactId);
  }

  async addMessage(conversationId: string, messageId: string): Promise<void> {
    await this.repository.addMessage(conversationId, messageId);
    await this.repository.update(conversationId, { lastActivityAt: new Date() });
  }

  assignStaff(id: string, staffId: string) { return this.repository.update(id, { assignedStaffId: staffId }); }
  pauseAi(id: string) { return this.repository.update(id, { aiPaused: true, status: "HUMAN_REQUIRED" }); }
  resumeAi(id: string) { return this.repository.update(id, { aiPaused: false, status: "AI_ACTIVE" }); }
  humanTakeover(id: string, staffId?: string) { return this.repository.update(id, { aiPaused: true, status: "HUMAN_ACTIVE", assignedStaffId: staffId }); }
  close(id: string) { return this.repository.update(id, { status: "CLOSED", aiPaused: true }); }
}
