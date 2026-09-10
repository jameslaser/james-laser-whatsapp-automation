import { describe, expect, it } from "vitest";
import { extractStatusEvents, parseWhatsAppEvents } from "./handler";

describe("WhatsApp webhook parser", () => {
  const base = (message: Record<string, unknown>) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "1833666484124208", changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone-1" }, messages: [message] } }] }],
  });

  it("parses text messages", () => {
    const [event] = parseWhatsAppEvents(base({ from: "966500000000", id: "wamid.1", timestamp: "100", text: { body: "Hello" } }));
    expect(event.kind).toBe("text");
    expect(event.text).toBe("Hello");
    expect(event.from).toBe("966500000000");
  });

  it("parses interactive button replies as text", () => {
    const [event] = parseWhatsAppEvents(base({ from: "966500000000", id: "wamid.2", timestamp: "100", interactive: { type: "button_reply", button_reply: { id: "confirm", title: "Confirm booking" } } }));
    expect(event.kind).toBe("interactive");
    expect(event.text).toBe("Confirm booking");
  });

  it("parses delivery status events", () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.3", status: "delivered", timestamp: "100", recipient_id: "966500000000" }] } }] }] };
    const [status] = extractStatusEvents(payload);
    expect(status.id).toBe("wamid.3");
    expect(status.status).toBe("delivered");
    expect(status.recipientId).toBe("966500000000");
  });
});
