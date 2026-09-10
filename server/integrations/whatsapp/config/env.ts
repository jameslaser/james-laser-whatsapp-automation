import { CANONICAL_WHATSAPP } from "../../../types/operations";

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
  metaAppSecret: string;
  graphApiVersion: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export function getWhatsAppConfig(): WhatsAppConfig {
  const businessAccountId = required("WHATSAPP_BUSINESS_ACCOUNT_ID");
  if (businessAccountId !== CANONICAL_WHATSAPP.wabaId) {
    throw new Error(`WHATSAPP_BUSINESS_ACCOUNT_ID must match canonical WABA ${CANONICAL_WHATSAPP.wabaId}`);
  }
  return {
    accessToken: required("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId,
    verifyToken: required("WHATSAPP_VERIFY_TOKEN"),
    metaAppSecret: required("META_APP_SECRET"),
    graphApiVersion: process.env.META_GRAPH_API_VERSION?.trim() || "v23.0",
  };
}

export function getOptionalWhatsAppConfig(): WhatsAppConfig | null {
  const names = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"];
  return names.every(name => Boolean(process.env[name]?.trim())) ? getWhatsAppConfig() : null;
}

export function canonicalWhatsAppIdentity() {
  return CANONICAL_WHATSAPP;
}
