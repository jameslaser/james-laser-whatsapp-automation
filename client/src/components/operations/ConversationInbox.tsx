import { useEffect, useState } from "react";

type Conversation = { id: string; contactId: string; status: string; aiPaused: boolean; lastActivityAt: string };
export default function ConversationInbox() {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/whatsapp/conversations").then(async response => { if (!response.ok) throw new Error(`Inbox returned ${response.status}`); return response.json(); }).then(data => setItems(data.conversations)).catch(reason => setError(reason instanceof Error ? reason.message : "Inbox unavailable")); }, []);
  if (error) return <p className="text-sm text-red-600">Inbox unavailable: {error}</p>;
  if (!items) return <p className="text-sm text-slate-500">Loading conversations…</p>;
  if (!items.length) return <p className="rounded-lg border border-dashed p-5 text-sm text-slate-500">No WhatsApp conversations are stored yet.</p>;
  return <div className="space-y-2">{items.map(item => <div key={item.id} className="flex items-center justify-between rounded-lg border p-4"><div><p className="font-medium">Conversation #{item.id}</p><p className="text-xs text-slate-500">Contact {item.contactId} · {new Date(item.lastActivityAt).toLocaleString()}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{item.aiPaused ? "Human" : item.status}</span></div>)}</div>;
}
