import { describe, expect, it } from "vitest";
import { alg1DurationMonths } from "./eligibility";

describe("alg1DurationMonths — 2026", () => {
  it("returns 0 below the minimum insured period", () => {
    expect(alg1DurationMonths(11, null, 2026)).toBe(0);
  });

  it("matches each tier of the statutory duration table", () => {
    expect(alg1DurationMonths(12, null, 2026)).toBe(6);
    expect(alg1DurationMonths(15, null, 2026)).toBe(6); // between tiers, uses the lower one
    expect(alg1DurationMonths(16, null, 2026)).toBe(8);
    expect(alg1DurationMonths(20, null, 2026)).toBe(10);
    expect(alg1DurationMonths(24, null, 2026)).toBe(12);
    expect(alg1DurationMonths(48, null, 2026)).toBe(12); // caps at the top base tier without an age bonus
  });

  it("ignores age bonuses when age is not supplied", () => {
    expect(alg1DurationMonths(24, null, 2026)).toBe(12);
  });

  it("applies an age bonus only once both age and insured-time thresholds are met", () => {
    expect(alg1DurationMonths(30, 50, 2026)).toBe(15);
    expect(alg1DurationMonths(20, 50, 2026)).toBe(10); // insured months short of the bonus's own threshold — base tier (20→10) applies
    expect(alg1DurationMonths(30, 49, 2026)).toBe(12); // age short of the bonus threshold — bonus withheld, base tier (24→12) applies
  });

  it("picks the highest qualifying age bonus", () => {
    expect(alg1DurationMonths(48, 58, 2026)).toBe(24);
    expect(alg1DurationMonths(36, 55, 2026)).toBe(18);
  });
});
