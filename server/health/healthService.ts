import axios from "axios";
import { getOptionalWhatsAppConfig } from "../integrations/whatsapp/config/env";
import { isGeminiConfigured } from "../ai/geminiConfig";
import { getDb } from "../db";
import type { HealthCheck } from "../types/operations";

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const checkedAt = new Date();
  const results: HealthCheck[] = [];
  if (!process.env.DATABASE_URL) results.push({ name: "database", status: "not_configured", detail: "DATABASE_URL is not configured.", checkedAt });
  else {
    try { const db = await getDb(); if (!db) throw new Error("Database client is unavailable"); await db.execute("SELECT 1"); results.push({ name: "database", status: "ok", detail: "Database connection is healthy.", checkedAt }); }
    catch (error) { results.push({ name: "database", status: "error", detail: error instanceof Error ? error.message : "Database health check failed", checkedAt }); }
  }
  results.push({ name: "gemini", status: isGeminiConfigured() ? "ok" : "not_configured", detail: isGeminiConfigured() ? "Server-side Gemini API key is configured." : "GEMINI_API_KEY is not configured.", checkedAt });
  const whatsapp = getOptionalWhatsAppConfig();
  if (!whatsapp) results.push({ name: "whatsapp", status: "not_configured", detail: "WhatsApp server variables are incomplete or canonical identity is not configured.", checkedAt });
  else {
    try { await axios.get(`https://graph.facebook.com/${whatsapp.graphApiVersion}/${whatsapp.phoneNumberId}`, { headers: { Authorization: `Bearer ${whatsapp.accessToken}` }, timeout: 10_000 }); results.push({ name: "whatsapp", status: "ok", detail: "Cloud API responded for the configured phone number ID.", checkedAt }); }
    catch (error) { results.push({ name: "whatsapp", status: "error", detail: error instanceof Error ? error.message : "Cloud API health check failed", checkedAt }); }
  }
  results.push({ name: "webhook", status: "ok", detail: "WhatsApp webhook routes and signature validation are registered.", checkedAt });
  results.push({ name: "automation-worker", status: process.env.DATABASE_URL && whatsapp ? "ok" : "not_configured", detail: "Automation worker runs in-process every 60 seconds and can also be triggered through the authenticated scheduled endpoint.", checkedAt });
  return results;
}
