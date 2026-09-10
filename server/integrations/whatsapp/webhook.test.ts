import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractStatusEvents, parseWhatsAppEvents } from "./webhook/handler";
import { verifyWebhookSignature } from "./webhook/signature";

describe("WhatsApp webhook foundation", () => {
  it("parses text messages and delivery statuses", () => {
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: "phone-1" }, messages: [{ id: "wamid.1", from: "966500000000", timestamp: "1720000000", text: { body: "مرحبا" } }], statuses: [{ id: "wamid.out", status: "read", timestamp: "1720000001", recipient_id: "966500000000" }] } }] }] };
    expect(parseWhatsAppEvents(payload)[0]).toMatchObject({ eventId: "wamid.1", from: "966500000000", kind: "text", text: "مرحبا" });
    expect(extractStatusEvents(payload)[0]).toMatchObject({ id: "wamid.out", status: "read" });
  });

  it("validates the Meta HMAC signature without exposing the secret", () => {
    const secret = "unit-test-secret";
    const body = JSON.stringify({ hello: "world" });
    const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, `sha256=${digest}`, secret)).toBe(true);
    expect(verifyWebhookSignature(body, "sha256=invalid", secret)).toBe(false);
  });
});
