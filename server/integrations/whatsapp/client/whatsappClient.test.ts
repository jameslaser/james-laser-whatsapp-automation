import { describe, expect, it } from "vitest";
import { WhatsAppClient } from "./whatsappClient";

describe("WhatsAppClient", () => {
  it("rejects templates that are not explicitly approved before any network request", async () => {
    const client = new WhatsAppClient({ accessToken: "not-used", phoneNumberId: "test-number", businessAccountId: "test-account", verifyToken: "test-token", metaAppSecret: "test-secret", graphApiVersion: "v23.0", approvedTemplateNames: ["appointment_confirmation_en"] });
    await expect(client.sendTemplateMessage({ to: "966500000000", templateName: "unapproved_template", languageCode: "en" })).rejects.toThrow("not in WHATSAPP_APPROVED_TEMPLATE_NAMES");
  });
});
