import { describe, expect, it } from "vitest";
import { parseBetAmountForSocket } from "./roomInput";

describe("parseBetAmountForSocket", () => {
  it("accepts zero", () => {
    expect(parseBetAmountForSocket(0)).toEqual({ ok: true, value: 0 });
  });

  it("accepts positive integers", () => {
    expect(parseBetAmountForSocket(50)).toEqual({ ok: true, value: 50 });
  });

  it("rejects negative", () => {
    const r = parseBetAmountForSocket(-1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("Invalid bet amount");
  });

  it("rejects non-integers", () => {
    const r = parseBetAmountForSocket(1.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("Bet amount must be a whole number");
  });

  it("rejects NaN", () => {
    const r = parseBetAmountForSocket(Number.NaN);
    expect(r.ok).toBe(false);
  });
});
