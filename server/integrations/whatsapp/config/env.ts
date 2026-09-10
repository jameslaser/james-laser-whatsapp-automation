import { CANONICAL_WHATSAPP } from "../../../types/operations";

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
  metaAppSecret: string;
  graphApiVersion: string;
  approvedTemplateNames: string[];
}
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing required server environment variable: ${name}`); return value; }
function approvedTemplateNames(): string[] { return (process.env.WHATSAPP_APPROVED_TEMPLATE_NAMES || "").split(",").map(value => value.trim()).filter(Boolean); }
export function getWhatsAppConfig(): WhatsAppConfig {
  const config = { accessToken: required("WHATSAPP_ACCESS_TOKEN"), phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"), businessAccountId: required("WHATSAPP_BUSINESS_ACCOUNT_ID"), verifyToken: required("WHATSAPP_VERIFY_TOKEN"), metaAppSecret: required("META_APP_SECRET"), graphApiVersion: process.env.META_GRAPH_API_VERSION?.trim() || "v23.0", approvedTemplateNames: approvedTemplateNames() };
  if (config.businessAccountId !== CANONICAL_WHATSAPP.wabaId) throw new Error(`WhatsApp business account rejected. Expected canonical WABA ${CANONICAL_WHATSAPP.wabaId}.`);
  if (!config.approvedTemplateNames.length) throw new Error("No approved WhatsApp templates are configured.");
  return config;
}
export function getOptionalWhatsAppConfig(): WhatsAppConfig | null { const names = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"]; return names.every(name => Boolean(process.env[name]?.trim())) ? getWhatsAppConfig() : null; }
export function canonicalWhatsAppIdentity() { return CANONICAL_WHATSAPP; }
