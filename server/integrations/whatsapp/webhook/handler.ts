import type { IncomingMessageEvent, SupportedMessageKind } from "../../../types/operations";

type RecordValue = Record<string, unknown>;
function records(value: unknown): RecordValue[] { return Array.isArray(value) ? value.filter((item): item is RecordValue => Boolean(item && typeof item === "object")) : []; }
function messageKind(message: RecordValue): SupportedMessageKind { for (const kind of ["text", "interactive", "image", "audio", "document"] as const) if (kind in message) return kind; return "unknown"; }
function interactiveText(message: RecordValue): string | undefined {
  const interactive = message.interactive;
  if (!interactive || typeof interactive !== "object") return undefined;
  const value = interactive as RecordValue;
  const buttonReply = value.button_reply;
  if (buttonReply && typeof buttonReply === "object") { const reply = buttonReply as RecordValue; if (typeof reply.title === "string") return reply.title; if (typeof reply.id === "string") return reply.id; }
  const listReply = value.list_reply;
  if (listReply && typeof listReply === "object") { const reply = listReply as RecordValue; if (typeof reply.title === "string") return reply.title; if (typeof reply.id === "string") return reply.id; }
  return undefined;
}

export function parseWhatsAppEvents(payload: RecordValue): IncomingMessageEvent[] {
  const events: IncomingMessageEvent[] = [];
  for (const entry of records(payload.entry)) for (const change of records(entry.changes)) {
    const value = change.value;
    if (!value || typeof value !== "object") continue;
    const valueRecord = value as RecordValue;
    const metadata = valueRecord.metadata && typeof valueRecord.metadata === "object" ? valueRecord.metadata as RecordValue : {};
    for (const message of records(valueRecord.messages)) {
      const from = typeof message.from === "string" ? message.from : "";
      const waMessageId = typeof message.id === "string" ? message.id : "";
      if (!from || !waMessageId) continue;
      const kind = messageKind(message);
      const textRecord = message.text && typeof message.text === "object" ? message.text as RecordValue : undefined;
      const mediaRecord = kind !== "text" && message[kind] && typeof message[kind] === "object" ? message[kind] as RecordValue : undefined;
      const text = typeof textRecord?.body === "string" ? textRecord.body : kind === "interactive" ? interactiveText(message) : undefined;
      events.push({ eventId: waMessageId, phoneNumberId: typeof metadata.phone_number_id === "string" ? metadata.phone_number_id : "", waMessageId, from, timestamp: new Date(Number(message.timestamp || Math.floor(Date.now() / 1000)) * 1000), kind, text, mediaId: typeof mediaRecord?.id === "string" ? mediaRecord.id : undefined, raw: message });
    }
  }
  return events;
}

export function extractStatusEvents(payload: RecordValue): Array<{ id: string; status: string; timestamp: Date; recipientId?: string; raw: RecordValue }> {
  const results: Array<{ id: string; status: string; timestamp: Date; recipientId?: string; raw: RecordValue }> = [];
  for (const entry of records(payload.entry)) for (const change of records(entry.changes)) {
    const value = change.value;
    if (!value || typeof value !== "object") continue;
    for (const record of records((value as RecordValue).statuses)) {
      if (typeof record.id !== "string" || typeof record.status !== "string") continue;
      results.push({ id: record.id, status: record.status, timestamp: new Date(Number(record.timestamp || Math.floor(Date.now() / 1000)) * 1000), recipientId: typeof record.recipient_id === "string" ? record.recipient_id : undefined, raw: record });
    }
  }
  return results;
}
