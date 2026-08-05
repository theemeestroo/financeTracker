import { describe, expect, it } from "vitest";
import { isAccrualMonth, periodicAccrual, resolveSavingsPrincipal } from "./savings";
import type { ResolvedSavingsRule } from "./types";

function rule(overrides: Partial<ResolvedSavingsRule> = {}): ResolvedSavingsRule {
  return {
    id: "r1",
    householdMemberId: "alice",
    label: "Alice — Index fund",
    principal: 10000,
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
  it("applies the periodic rate to the given pot balance", () => {
    // 20000 * (12%/12 = 1%) = 200
    expect(
      periodicAccrual(rule({ annualReturnPct: 12, accrualFrequency: "monthly" }), 20000)
    ).toBeCloseTo(200, 5);
    // 20000 * (12%/4 = 3%) = 600
    expect(
      periodicAccrual(rule({ annualReturnPct: 12, accrualFrequency: "quarterly" }), 20000)
    ).toBeCloseTo(600, 5);
  });

  it("is a pure function of whatever pot balance is passed in — compounding, if any, is the caller's job", () => {
    const r = rule({ annualReturnPct: 12, accrualFrequency: "monthly" });
    expect(periodicAccrual(r, 10000)).toBeCloseTo(100, 5);
    expect(periodicAccrual(r, 10000)).toBeCloseTo(100, 5); // same pot in, same return out, every time
    expect(periodicAccrual(r, 20000)).toBeCloseTo(200, 5); // pot doubled -> return doubles
  });

  it("applies a negative rate as a loss", () => {
    const r = rule({ annualReturnPct: -12, accrualFrequency: "monthly" });
    expect(periodicAccrual(r, 10000)).toBeCloseTo(-100, 5);
  });

  it("returns 0 for a 0% rule", () => {
    expect(periodicAccrual(rule({ annualReturnPct: 0 }), 10000)).toBe(0);
  });

  it("returns 0 for a 0 pot balance regardless of rate", () => {
    expect(periodicAccrual(rule({ annualReturnPct: 12 }), 0)).toBe(0);
  });
});

describe("resolveSavingsPrincipal", () => {
  it("uses the entered amount as-is for an 'amount' rule, unscaled by the severance base", () => {
    expect(
      resolveSavingsPrincipal({ allocation_type: "amount", amount: 15000, percentage: null }, 40000)
    ).toBe(15000);
    expect(
      resolveSavingsPrincipal({ allocation_type: "amount", amount: 15000, percentage: null }, 0)
    ).toBe(15000);
  });

  it("resolves a 'percentage' rule as that share of the severance base", () => {
    expect(
      resolveSavingsPrincipal({ allocation_type: "percentage", amount: null, percentage: 50 }, 40000)
    ).toBe(20000);
  });

  it("treats a null amount/percentage as 0", () => {
    expect(
      resolveSavingsPrincipal({ allocation_type: "amount", amount: null, percentage: null }, 40000)
    ).toBe(0);
    expect(
      resolveSavingsPrincipal({ allocation_type: "percentage", amount: null, percentage: null }, 40000)
    ).toBe(0);
  });
});
