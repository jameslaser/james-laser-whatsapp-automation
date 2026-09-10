import crypto from "node:crypto";
import { getWhatsAppConfig } from "../config/env";

export function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader?: string, appSecret = getWhatsAppConfig().metaAppSecret): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const signature = signatureHeader.slice("sha256=".length);
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyWebhookChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
  const config = getWhatsAppConfig();
  if (mode !== "subscribe" || token !== config.verifyToken || !challenge) throw new Error("Invalid WhatsApp webhook verification request");
  return challenge;
}
