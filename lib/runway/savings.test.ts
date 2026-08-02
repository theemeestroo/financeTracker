import { describe, expect, it } from "vitest";
import { isAccrualMonth, periodicAccrual } from "./savings";
import type { ResolvedSavingsRule } from "./types";

function rule(overrides: Partial<ResolvedSavingsRule> = {}): ResolvedSavingsRule {
  return {
    id: "r1",
    householdMemberId: "alice",
    label: "Alice — Index fund",
    allocationFraction: 0.5,
    annualReturnPct: 6,
    accrualFrequency: "monthly",
    startMonth: "2027-01-01",
    ...overrides,
  };
}

describe("isAccrualMonth", () => {
  it("is false before the rule's own start month", () => {
    expect(isAccrualMonth(rule(), "2026-12-01")).toBe(false);
  });

  it("monthly accrues every month from start", () => {
    const r = rule({ accrualFrequency: "monthly" });
    expect(isAccrualMonth(r, "2027-01-01")).toBe(true);
    expect(isAccrualMonth(r, "2027-02-01")).toBe(true);
    expect(isAccrualMonth(r, "2027-06-01")).toBe(true);
  });

  it("quarterly accrues every 3rd month from its own start, not a calendar quarter", () => {
    const r = rule({ accrualFrequency: "quarterly", startMonth: "2027-02-01" });
    expect(isAccrualMonth(r, "2027-02-01")).toBe(true); // start
    expect(isAccrualMonth(r, "2027-03-01")).toBe(false);
    expect(isAccrualMonth(r, "2027-04-01")).toBe(false);
    expect(isAccrualMonth(r, "2027-05-01")).toBe(true); // +3mo from Feb
    expect(isAccrualMonth(r, "2027-08-01")).toBe(true); // +6mo from Feb
  });

  it("annually accrues every 12th month from start", () => {
    const r = rule({ accrualFrequency: "annually" });
    expect(isAccrualMonth(r, "2027-01-01")).toBe(true);
    expect(isAccrualMonth(r, "2027-06-01")).toBe(false);
    expect(isAccrualMonth(r, "2028-01-01")).toBe(true);
  });
});

describe("periodicAccrual", () => {
  it("applies the fraction and periodic rate to the given opening balance", () => {
    // 0.5 * 20000 * (12%/12 = 1%) = 100
    expect(
      periodicAccrual(rule({ allocationFraction: 0.5, annualReturnPct: 12, accrualFrequency: "monthly" }), 20000)
    ).toBeCloseTo(100, 5);
    // 0.5 * 20000 * (12%/4 = 3%) = 300
    expect(
      periodicAccrual(rule({ allocationFraction: 0.5, annualReturnPct: 12, accrualFrequency: "quarterly" }), 20000)
    ).toBeCloseTo(300, 5);
  });

  it("scales directly with the opening balance passed in — no independent compounding of its own", () => {
    const r = rule({ allocationFraction: 1, annualReturnPct: 12, accrualFrequency: "monthly" });
    expect(periodicAccrual(r, 10000)).toBeCloseTo(100, 5);
    expect(periodicAccrual(r, 10000)).toBeCloseTo(100, 5); // same balance in, same return out, every time
    expect(periodicAccrual(r, 20000)).toBeCloseTo(200, 5); // balance doubled -> return doubles
  });

  it("goes negative against a negative opening balance — a real consequence of tracking the whole balance, not a floor at 0", () => {
    const r = rule({ allocationFraction: 1, annualReturnPct: 12, accrualFrequency: "monthly" });
    expect(periodicAccrual(r, -10000)).toBeCloseTo(-100, 5);
  });

  it("returns 0 for a 0% rule", () => {
    expect(periodicAccrual(rule({ annualReturnPct: 0 }), 10000)).toBe(0);
  });

  it("returns 0 for a 0 opening balance regardless of rate", () => {
    expect(periodicAccrual(rule({ annualReturnPct: 12 }), 0)).toBe(0);
  });
});
