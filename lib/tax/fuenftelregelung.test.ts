import { describe, expect, it } from "vitest";
import { calculateSeveranceNet, compareSeverancePaymentTiming } from "./fuenftelregelung";
import type { TaxProfile } from "@/lib/types";

const profile: TaxProfile = {
  id: "test",
  household_member_id: "member",
  tax_class: 1,
  church_tax: false,
  church_tax_state: null,
  has_children: true,
  statutory_health_insurance: true,
  health_insurance_addon_rate: null,
  private_health_insurance_monthly_premium: null,
};

describe("calculateSeveranceNet — Fünftelregelung", () => {
  it("produces a tax saving vs. taxing the full severance as ordinary income", () => {
    // Regular salary pushes the taxpayer into the higher brackets already;
    // a large severance on top makes the marginal-rate comparison meaningful.
    const result = calculateSeveranceNet(120000, 65000, profile, 2025);
    expect(result.taxSaving).toBeGreaterThan(0);
    expect(result.marginalTax).toBeGreaterThan(result.taxOnSeverance);
  });

  it("net severance is always less than gross (tax is never negative)", () => {
    const result = calculateSeveranceNet(80000, 40000, profile, 2025);
    expect(result.netSeverance).toBeLessThan(80000);
    expect(result.totalTaxOnSeverance).toBeGreaterThanOrEqual(0);
  });

  it("applies church tax on the severance-attributable income tax when enabled", () => {
    const withChurch = calculateSeveranceNet(80000, 40000, { ...profile, church_tax: true }, 2025);
    const withoutChurch = calculateSeveranceNet(80000, 40000, profile, 2025);
    expect(withChurch.churchTaxOnSeverance).toBeGreaterThan(0);
    expect(withChurch.netSeverance).toBeLessThan(withoutChurch.netSeverance);
  });

  it("a severance of €0 results in €0 tax and €0 net", () => {
    const result = calculateSeveranceNet(0, 50000, profile, 2025);
    expect(result.taxOnSeverance).toBe(0);
    expect(result.netSeverance).toBe(0);
  });
});

describe("compareSeverancePaymentTiming", () => {
  const grossSeverance = 100000;
  const monthlyBaseSalary = 8000;
  const annualBonus = 10000;
  const nonSalaryAnnualGross = 5000;

  it("flags paidAfterEmploymentEnds only when the payment year is after the departure year", () => {
    const sameYear = compareSeverancePaymentTiming(
      grossSeverance, monthlyBaseSalary, annualBonus, nonSalaryAnnualGross, profile, 2025, 2025
    );
    expect(sameYear.paidAfterEmploymentEnds).toBe(false);

    const nextYear = compareSeverancePaymentTiming(
      grossSeverance, monthlyBaseSalary, annualBonus, nonSalaryAnnualGross, profile, 2025, 2026
    );
    expect(nextYear.paidAfterEmploymentEnds).toBe(true);
  });

  it("deferring past a full year's salary lowers the tax on the severance, vs. taking it immediately", () => {
    const immediate = compareSeverancePaymentTiming(
      grossSeverance, monthlyBaseSalary, annualBonus, nonSalaryAnnualGross, profile, 2025, 2025
    );
    const deferred = compareSeverancePaymentTiming(
      grossSeverance, monthlyBaseSalary, annualBonus, nonSalaryAnnualGross, profile, 2025, 2026
    );
    // Deferred's actual outcome (no more salary that year) should owe less
    // tax than immediate's actual outcome (a full year's salary stacked
    // underneath it).
    expect(deferred.actual.totalTaxOnSeverance).toBeLessThan(immediate.actual.totalTaxOnSeverance);
    expect(deferred.actual.netSeverance).toBeGreaterThan(immediate.actual.netSeverance);
  });

  it("timingTaxSaving is negative when paying immediately (deferring would have been cheaper) and positive when deferring (confirms the saving)", () => {
    const immediate = compareSeverancePaymentTiming(
      grossSeverance, monthlyBaseSalary, annualBonus, nonSalaryAnnualGross, profile, 2025, 2025
    );
    const deferred = compareSeverancePaymentTiming(
      grossSeverance, monthlyBaseSalary, annualBonus, nonSalaryAnnualGross, profile, 2025, 2026
    );
    expect(immediate.timingTaxSaving).toBeLessThan(0);
    expect(deferred.timingTaxSaving).toBeGreaterThan(0);
    // Same pair of years/scenarios viewed from either side — exact negatives.
    expect(immediate.timingTaxSaving).toBeCloseTo(-deferred.timingTaxSaving, 5);
  });

  it("the alternate for an immediate payment excludes the salary base (deferred-to-next-January assumption)", () => {
    const immediate = compareSeverancePaymentTiming(
      grossSeverance, monthlyBaseSalary, annualBonus, nonSalaryAnnualGross, profile, 2025, 2025
    );
    const deferred = compareSeverancePaymentTiming(
      grossSeverance, monthlyBaseSalary, annualBonus, nonSalaryAnnualGross, profile, 2025, 2026
    );
    // immediate's alternate (deferred outcome) and deferred's actual
    // (also the deferred outcome) are the same computation.
    expect(immediate.alternate.totalTaxOnSeverance).toBeCloseTo(deferred.actual.totalTaxOnSeverance, 5);
  });
});
