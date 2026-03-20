import { describe, expect, it } from "vitest";
import { computeWinRate } from "./bet.service";

describe("computeWinRate", () => {
  it("returns 0 when no games played", () => {
    expect(computeWinRate(0, 0)).toBe(0);
  });

  it("returns rounded percentage", () => {
    expect(computeWinRate(1, 1)).toBe(50);
    expect(computeWinRate(3, 1)).toBe(75);
  });
});
