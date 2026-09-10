import { describe, expect, it } from "vitest";
import { TreatmentCatalog } from "./treatments";

describe("TreatmentCatalog", () => {
  const catalog = new TreatmentCatalog();
  it("resolves codes and human-readable names", () => {
    expect(catalog.get("full-face").code).toBe("full-face");
    expect(catalog.get("Full Face").code).toBe("full-face");
    expect(catalog.get("mini body").code).toBe("mini-full-body");
  });
  it("uses the maximum verified duration by default", () => {
    expect(catalog.calculateDuration("Thighs")).toBe(30);
    expect(catalog.calculateDuration("Thighs", "minimum")).toBe(15);
  });
});
