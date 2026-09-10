import { describe, expect, it } from "vitest";
import { normalizeMachine, normalizeProvider } from "./operationsRepository";

describe("HMS validation", () => {
  it("normalizes only accepted provider aliases to NR011 JAMES FLORES", () => {
    expect(normalizeProvider("NR011")).toBe("NR011 JAMES FLORES");
    expect(normalizeProvider("MOHAMED TAHA (JF)")).toBe("NR011 JAMES FLORES");
    expect(() => normalizeProvider("MOHAMED TAHA (JT)")).toThrow();
    expect(() => normalizeProvider("unknown provider")).toThrow();
  });

  it("normalizes only the four accepted machines", () => {
    expect(normalizeMachine("DEKA AGAIN")).toBe("Deka Again 1");
    expect(normalizeMachine("CLARITY 2")).toBe("Clarity 2");
    expect(normalizeMachine("GENTLE PROMAX")).toBe("Gentle Pro Max");
    expect(normalizeMachine("DUETTO MACHINE")).toBe("Dueto");
    expect(() => normalizeMachine("Unknown Laser")).toThrow();
  });
});
