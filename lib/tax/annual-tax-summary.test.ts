import { describe, expect, it } from "vitest";
import { annualPersonTaxSummary, taxBracketBreakdown } from "./annual-tax-summary";
import { calculateBaseIncomeTax, calculateIncomeTaxForClass } from "./wage-tax";
import type { TaxProfile } from "@/lib/types";

const profileClass1: TaxProfile = {
  id: "tp1",
  household_member_id: "alice",
  tax_class: 1,
  church_tax: false,
  church_tax_state: null,
  has_children: false,
  statutory_health_insurance: true,
  health_insurance_addon_rate: null,
  private_health_insurance_monthly_premium: null,
};

const profileClass3: TaxProfile = { ...profileClass1, id: "tp2", household_member_id: "bob", tax_class: 3 };

describe("taxBracketBreakdown", () => {
  it("always returns all 5 zones, in order, regardless of income", () => {
    for (const zve of [0, 5000, 12096, 60000, 400000]) {
      expect(taxBracketBreakdown(zve, 1, 2025).map((s) => s.zoneLabel)).toEqual([
        "0%",
        "14–24%",
        "24–42%",
        "42%",
        "45%",
      ]);
    }
  });

  it("zero income reaches no zones; income at the Grundfreibetrag reaches just the untaxed 0% zone", () => {
    expect(taxBracketBreakdown(0, 1, 2025).every((s) => !s.reached)).toBe(true);
    const steps = taxBracketBreakdown(12096, 1, 2025);
    expect(steps[0]).toEqual({
      zoneLabel: "0%",
      rangeStart: 0,
      rangeEnd: 12096,
      amountInZone: 12096,
      taxInZone: 0,
      reached: true,
    });
    expect(steps.slice(1).every((s) => !s.reached && s.amountInZone === 0 && s.taxInZone === 0)).toBe(true);
  });

  it("amounts sum exactly to the taxable income, tax sums exactly to the real total", () => {
    for (const zve of [15000, 60000, 100000, 400000]) {
      const steps = taxBracketBreakdown(zve, 1, 2025);
      const totalAmount = steps.reduce((s, x) => s + x.amountInZone, 0);
      const totalTax = steps.reduce((s, x) => s + x.taxInZone, 0);
      expect(totalAmount).toBeCloseTo(zve, 5);
      expect(totalTax).toBeCloseTo(calculateIncomeTaxForClass(zve, 1, 2025), 5);
    }
  });

  it("zvE 60,000 (2025 reference: €14,415 total) reaches the 0/zone1/zone2 bands, not beyond", () => {
    const steps = taxBracketBreakdown(60000, 1, 2025);
    expect(steps.filter((s) => s.reached).map((s) => s.zoneLabel)).toEqual(["0%", "14–24%", "24–42%"]);
    expect(steps[0].amountInZone).toBeCloseTo(12096, 5); // the Grundfreibetrag itself
    expect(steps[0].taxInZone).toBe(0);
    expect(steps[2].rangeEnd).toBe(68480); // zone2's own upper bound, not open-ended
    expect(steps.reduce((s, x) => s + x.taxInZone, 0)).toBeCloseTo(14415, 0);
  });

  it("a very high income reaches the open-ended 45% top zone", () => {
    const steps = taxBracketBreakdown(400000, 1, 2025);
    expect(steps).toHaveLength(5);
    expect(steps.at(-1)!.zoneLabel).toBe("45%");
    expect(steps.at(-1)!.rangeEnd).toBeNull();
    expect(steps.at(-1)!.reached).toBe(true);
  });

  it("class III (splitting) taxes the half and scales amounts/tax back up by 2", () => {
    const zve = 80000;
    const splitSteps = taxBracketBreakdown(zve, 3, 2025);
    const totalTax = splitSteps.reduce((s, x) => s + x.taxInZone, 0);
    const totalAmount = splitSteps.reduce((s, x) => s + x.amountInZone, 0);
    expect(totalAmount).toBeCloseTo(zve, 5);
    expect(totalTax).toBeCloseTo(2 * calculateBaseIncomeTax(zve / 2, 2025), 5);
    expect(totalTax).toBeCloseTo(calculateIncomeTaxForClass(zve, 3, 2025), 5);
  });

  it("zone rate labels are non-decreasing in strictness as income rises", () => {
    const steps = taxBracketBreakdown(400000, 1, 2026);
    expect(steps.map((s) => s.zoneLabel)).toEqual(["0%", "14–24%", "24–42%", "42%", "45%"]);
  });
});

describe("annualPersonTaxSummary", () => {
  it("a single income source matches the underlying wage-tax formula directly", () => {
    const summary = annualPersonTaxSummary(
      "alice",
      2025,
      [{ label: "Salary", grossAnnual: 60000 }],
      0,
      profileClass1
    );
    expect(summary.totalGrossRegular).toBe(60000);
    expect(summary.incomeTax).toBe(calculateIncomeTaxForClass(summary.taxableIncome, 1, 2025));
    expect(summary.totalTaxRegular).toBeCloseTo(summary.incomeTax + summary.soli + summary.churchTax, 5);
    expect(summary.netRegular).toBeCloseTo(
      summary.totalGrossRegular - summary.socialContributions - summary.totalTaxRegular,
      5
    );
    expect(summary.totalNetAll).toBeCloseTo(summary.netRegular, 5);
  });

  it("combining two sources for the same person taxes them together, not independently", () => {
    const combined = annualPersonTaxSummary(
      "alice",
      2025,
      [
        { label: "Salary", grossAnnual: 50000 },
        { label: "Rental", grossAnnual: 10000 },
      ],
      0,
      profileClass1
    );
    const asOneSource = annualPersonTaxSummary(
      "alice",
      2025,
      [{ label: "Combined", grossAnnual: 60000 }],
      0,
      profileClass1
    );
    // Splitting the same total gross across two labeled sources must not
    // change the actual tax owed — only how it's itemized.
    expect(combined.totalTaxRegular).toBeCloseTo(asOneSource.totalTaxRegular, 5);
    expect(combined.netRegular).toBeCloseTo(asOneSource.netRegular, 5);
  });

  it("tax-free income (ALG I) adds to totals but never to taxable income", () => {
    const withTaxFree = annualPersonTaxSummary(
      "alice",
      2025,
      [{ label: "Salary", grossAnnual: 40000 }],
      12000,
      profileClass1
    );
    const withoutTaxFree = annualPersonTaxSummary(
      "alice",
      2025,
      [{ label: "Salary", grossAnnual: 40000 }],
      0,
      profileClass1
    );
    expect(withTaxFree.taxableIncome).toBe(withoutTaxFree.taxableIncome);
    expect(withTaxFree.totalTaxRegular).toBe(withoutTaxFree.totalTaxRegular);
    expect(withTaxFree.totalGrossAll).toBeCloseTo(withoutTaxFree.totalGrossAll + 12000, 5);
    expect(withTaxFree.totalNetAll).toBeCloseTo(withoutTaxFree.totalNetAll + 12000, 5);
  });

  it("a severance lump sum is passed through unchanged into totals, not retaxed here", () => {
    const summary = annualPersonTaxSummary(
      "bob",
      2026,
      [{ label: "Salary", grossAnnual: 70000 }],
      0,
      profileClass3,
      { gross: 30000, totalTax: 6000, net: 24000 }
    );
    expect(summary.severance).toEqual({ gross: 30000, totalTax: 6000, net: 24000 });
    expect(summary.totalGrossAll).toBeCloseTo(summary.totalGrossRegular + 30000, 5);
    expect(summary.totalTaxAll).toBeCloseTo(summary.totalTaxRegular + 6000, 5);
    expect(summary.totalNetAll).toBeCloseTo(summary.netRegular + 24000, 5);
  });

  it("investment income is taxed under the flat regime, kept out of taxableIncome/bracketSteps, but folded into overall totals", () => {
    const withInvestment = annualPersonTaxSummary(
      "alice",
      2025,
      [{ label: "Salary", grossAnnual: 40000 }],
      0,
      profileClass1,
      undefined,
      5000
    );
    const withoutInvestment = annualPersonTaxSummary(
      "alice",
      2025,
      [{ label: "Salary", grossAnnual: 40000 }],
      0,
      profileClass1
    );
    // Same wage-tax position either way — investment income never touches
    // the progressive calculation.
    expect(withInvestment.taxableIncome).toBe(withoutInvestment.taxableIncome);
    expect(withInvestment.bracketSteps).toEqual(withoutInvestment.bracketSteps);
    expect(withInvestment.totalTaxRegular).toBe(withoutInvestment.totalTaxRegular);
    // But it's genuinely taxed (Sparerpauschbetrag only shelters the first
    // €1,000) and shows up in the overall totals.
    expect(withInvestment.investmentIncomeGross).toBe(5000);
    expect(withInvestment.investmentIncomeTax).toBeGreaterThan(0);
    expect(withInvestment.investmentIncomeNet).toBeLessThan(5000);
    expect(withInvestment.totalGrossAll).toBeCloseTo(withoutInvestment.totalGrossAll + 5000, 5);
    expect(withInvestment.totalTaxAll).toBeCloseTo(withoutInvestment.totalTaxAll + withInvestment.investmentIncomeTax, 5);
    expect(withInvestment.totalNetAll).toBeCloseTo(withoutInvestment.totalNetAll + withInvestment.investmentIncomeNet, 5);
  });

  it("no income sources at all nets to zero, not an error", () => {
    const summary = annualPersonTaxSummary("alice", 2025, [], 0, profileClass1);
    expect(summary.taxableIncome).toBe(0);
    expect(summary.bracketSteps).toHaveLength(5);
    expect(summary.bracketSteps.every((s) => !s.reached)).toBe(true);
    expect(summary.totalTaxRegular).toBe(0);
    expect(summary.netRegular).toBe(0);
  });
});
