import { describe, expect, it } from "vitest";
import { aggregateAnnualIncomeByMember } from "./annual-income";
import type { RunwayLineItem, RunwayPoint } from "./types";

function point(date: string, inflows: RunwayLineItem[]): RunwayPoint {
  return { date, balance: 0, breakdown: { inflows, outflows: [] } };
}

describe("aggregateAnnualIncomeByMember", () => {
  it("sums a member's monthly gross across the year into one annual source total", () => {
    const series: RunwayPoint[] = [
      point("2026-01-01", [{ label: "Salary", amount: 3000, householdMemberId: "m1", grossAmount: 4000 }]),
      point("2026-02-01", [{ label: "Salary", amount: 3000, householdMemberId: "m1", grossAmount: 4000 }]),
    ];
    const result = aggregateAnnualIncomeByMember(series);
    expect(result).toEqual([
      {
        householdMemberId: "m1",
        year: 2026,
        sources: [{ label: "Salary", grossAnnual: 8000 }],
        taxFreeGross: 0,
        investmentGross: 0,
      },
    ]);
  });

  it("splits into separate entries per calendar year and per member", () => {
    const series: RunwayPoint[] = [
      point("2026-12-01", [{ label: "Salary", amount: 3000, householdMemberId: "m1", grossAmount: 4000 }]),
      point("2027-01-01", [{ label: "Salary", amount: 3000, householdMemberId: "m1", grossAmount: 4000 }]),
      point("2027-01-01", [{ label: "Rental", amount: 500, householdMemberId: "m2", grossAmount: 600 }]),
    ];
    const result = aggregateAnnualIncomeByMember(series);
    expect(result).toEqual([
      {
        householdMemberId: "m1",
        year: 2026,
        sources: [{ label: "Salary", grossAnnual: 4000 }],
        taxFreeGross: 0,
        investmentGross: 0,
      },
      {
        householdMemberId: "m1",
        year: 2027,
        sources: [{ label: "Salary", grossAnnual: 4000 }],
        taxFreeGross: 0,
        investmentGross: 0,
      },
      {
        householdMemberId: "m2",
        year: 2027,
        sources: [{ label: "Rental", grossAnnual: 600 }],
        taxFreeGross: 0,
        investmentGross: 0,
      },
    ]);
  });

  it("routes tax-exempt items (ALG I) into taxFreeGross instead of sources", () => {
    const series: RunwayPoint[] = [
      point("2026-01-01", [
        { label: "ALG I (net)", amount: 1500, householdMemberId: "m1", taxExempt: true },
      ]),
    ];
    const result = aggregateAnnualIncomeByMember(series);
    expect(result).toEqual([
      { householdMemberId: "m1", year: 2026, sources: [], taxFreeGross: 1500, investmentGross: 0 },
    ]);
  });

  it("routes investment-income items into investmentGross, summed across months, instead of sources", () => {
    const series: RunwayPoint[] = [
      point("2026-01-01", [
        { label: "Fund — investment return", amount: 180, householdMemberId: "m1", grossAmount: 200, investmentIncome: true },
      ]),
      point("2026-02-01", [
        { label: "Fund — investment return", amount: 182, householdMemberId: "m1", grossAmount: 202, investmentIncome: true },
      ]),
    ];
    const result = aggregateAnnualIncomeByMember(series);
    expect(result).toEqual([
      { householdMemberId: "m1", year: 2026, sources: [], taxFreeGross: 0, investmentGross: 402 },
    ]);
  });

  it("ignores items with no householdMemberId (shared/unattributed income)", () => {
    const series: RunwayPoint[] = [point("2026-01-01", [{ label: "Household rental", amount: 500 }])];
    expect(aggregateAnnualIncomeByMember(series)).toEqual([]);
  });

  it("ignores attributed items with no grossAmount and no taxExempt/investmentIncome flag (e.g. the severance lump sum)", () => {
    const series: RunwayPoint[] = [
      point("2026-06-01", [{ label: "Severance lump sum (net)", amount: 20000, householdMemberId: "m1" }]),
    ];
    expect(aggregateAnnualIncomeByMember(series)).toEqual([]);
  });
});
