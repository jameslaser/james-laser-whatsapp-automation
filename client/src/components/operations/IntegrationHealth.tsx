import { useEffect, useState } from "react";

type HealthCheck = { name: string; status: string; detail?: string };

export default function IntegrationHealth() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/health/integrations").then(async response => { if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`); return response.json(); }).then(data => setChecks(data.checks)).catch(reason => setError(reason instanceof Error ? reason.message : "Health check failed")); }, []);
  if (error) return <p className="text-sm text-red-600">Integration health unavailable: {error}</p>;
  if (!checks) return <p className="text-sm text-slate-500">Checking integrations…</p>;
  return <div className="grid gap-3 sm:grid-cols-2">{checks.map(check => <div key={check.name} className="rounded-lg border bg-white p-4"><div className="flex items-center justify-between"><span className="font-medium capitalize">{check.name.replaceAll("-", " ")}</span><span className={`rounded-full px-2 py-1 text-xs ${check.status === "ok" ? "bg-emerald-100 text-emerald-800" : check.status === "not_configured" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{check.status}</span></div><p className="mt-2 text-xs text-slate-500">{check.detail}</p></div>)}</div>;
}
