import { describe, expect, it } from "vitest";
import { assertKnownMachine, isExplicitBookingConfirmation } from "./aiTools";

describe("AI booking safety", () => {
  it("accepts explicit English booking confirmations", () => {
    expect(isExplicitBookingConfirmation("yes")).toBe(true);
    expect(isExplicitBookingConfirmation("Please book it.")).toBe(true);
    expect(isExplicitBookingConfirmation("go ahead")).toBe(true);
  });

  it("accepts explicit Arabic booking confirmations", () => {
    expect(isExplicitBookingConfirmation("نعم")).toBe(true);
    expect(isExplicitBookingConfirmation("احجزها")).toBe(true);
    expect(isExplicitBookingConfirmation("موافق")).toBe(true);
  });

  it("does not treat a generic acknowledgement as booking consent", () => {
    expect(isExplicitBookingConfirmation("ok")).toBe(false);
    expect(isExplicitBookingConfirmation("okay")).toBe(false);
    expect(isExplicitBookingConfirmation("sounds good")).toBe(false);
    expect(isExplicitBookingConfirmation("thanks")).toBe(false);
  });

  it("allows only the approved laser machines", () => {
    expect(assertKnownMachine("Deka Again 1")).toBe("Deka Again 1");
    expect(assertKnownMachine("Clarity 2")).toBe("Clarity 2");
    expect(assertKnownMachine("Gentle Pro Max")).toBe("Gentle Pro Max");
    expect(assertKnownMachine("Dueto")).toBe("Dueto");
    expect(() => assertKnownMachine("Unknown Machine")).toThrow("Unsupported machine");
  });
});
