import { useState } from "react";
export default function AvailabilityCheck() {
  const [provider, setProvider] = useState("NR011");
  const [treatmentCode, setTreatmentCode] = useState("full-face");
  const [startsAt, setStartsAt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) { event.preventDefault(); setResult(null); setError(null); const response = await fetch("/api/appointments/check-availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, treatmentCode, startsAt: new Date(startsAt).toISOString() }) }); const data = await response.json(); if (!response.ok) setError(data.error || "Availability check failed"); else setResult(data.available ? `Available. Machines: ${data.machineNames.join(", ")}` : `Unavailable: ${data.reasons.join("; ")}`); }
  return <form onSubmit={submit} className="grid gap-3 md:grid-cols-4"><input className="rounded-lg border px-3 py-2 text-sm" value={provider} onChange={event => setProvider(event.target.value)} placeholder="Provider" /><input className="rounded-lg border px-3 py-2 text-sm" value={treatmentCode} onChange={event => setTreatmentCode(event.target.value)} placeholder="Treatment code" /><input className="rounded-lg border px-3 py-2 text-sm" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required /><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Check availability</button>{result && <p className="md:col-span-4 text-sm text-emerald-700">{result}</p>}{error && <p className="md:col-span-4 text-sm text-red-600">{error}</p>}</form>;
}
