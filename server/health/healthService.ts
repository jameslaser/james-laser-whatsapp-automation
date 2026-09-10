import axios from "axios";
import { getOptionalWhatsAppConfig } from "../integrations/whatsapp/config/env";
import { isGeminiConfigured } from "../ai/geminiConfig";
import type { HealthCheck } from "../types/operations";

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const checkedAt = new Date();
  const results: HealthCheck[] = [];
  results.push({ name: "database", status: process.env.DATABASE_URL ? "ok" : "not_configured", detail: process.env.DATABASE_URL ? "Connection string present; connectivity is checked by database operations." : "DATABASE_URL is not configured.", checkedAt });
  results.push({ name: "gemini", status: isGeminiConfigured() ? "ok" : "not_configured", detail: isGeminiConfigured() ? "Server-side API key is configured." : "GEMINI_API_KEY is not configured.", checkedAt });
  const whatsapp = getOptionalWhatsAppConfig();
  if (!whatsapp) results.push({ name: "whatsapp", status: "not_configured", detail: "WhatsApp server variables are incomplete.", checkedAt });
  else {
    try {
      await axios.get(`https://graph.facebook.com/${whatsapp.graphApiVersion}/${whatsapp.phoneNumberId}`, { headers: { Authorization: `Bearer ${whatsapp.accessToken}` }, timeout: 10_000 });
      results.push({ name: "whatsapp", status: "ok", detail: "Cloud API responded for the configured phone number ID.", checkedAt });
    } catch (error) { results.push({ name: "whatsapp", status: "error", detail: error instanceof Error ? error.message : "Cloud API health check failed", checkedAt }); }
  }
  results.push({ name: "webhook", status: "ok", detail: "Webhook routes are registered when the server is running.", checkedAt });
  results.push({ name: "automation-worker", status: "degraded", detail: "Worker execution remains disabled until a concrete repository and sender are configured.", checkedAt });
  return results;
}
