import { describe, expect, it } from "vitest";
import { calculateCapitalGainsTax } from "./capital-gains-tax";
import type { TaxProfile } from "@/lib/types";

const single: TaxProfile = {
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

const married: TaxProfile = { ...single, tax_class: 3 };
const churchMember: TaxProfile = { ...single, church_tax: true, church_tax_state: "NW" };

describe("calculateCapitalGainsTax", () => {
  it("gains within the Sparerpauschbetrag are entirely untaxed", () => {
    const result = calculateCapitalGainsTax(800, single, 2025);
    expect(result.allowanceUsed).toBe(800);
    expect(result.taxableAnnual).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.netAnnual).toBe(800);
  });

  it("only the amount over the allowance is taxed, at 25% flat plus 5.5% Soli", () => {
    const result = calculateCapitalGainsTax(3000, single, 2025);
    expect(result.allowanceUsed).toBe(1000);
    expect(result.taxableAnnual).toBe(2000);
    expect(result.flatTax).toBeCloseTo(500, 5); // 25% of 2000
    expect(result.soli).toBeCloseTo(27.5, 5); // 5.5% of 500
    expect(result.churchTax).toBe(0);
    expect(result.totalTax).toBeCloseTo(527.5, 5);
    expect(result.netAnnual).toBeCloseTo(3000 - 527.5, 5);
  });

  it("a married (class III) profile gets double the allowance", () => {
    const result = calculateCapitalGainsTax(3000, married, 2025);
    expect(result.allowanceUsed).toBe(2000);
    expect(result.taxableAnnual).toBe(1000);
  });

  it("adds church tax on the flat tax when registered", () => {
    const withChurch = calculateCapitalGainsTax(3000, churchMember, 2025);
    const without = calculateCapitalGainsTax(3000, single, 2025);
    expect(withChurch.churchTax).toBeGreaterThan(0);
    expect(withChurch.totalTax).toBeGreaterThan(without.totalTax);
  });

  it("zero or negative gross is untaxed and passes through unchanged", () => {
    expect(calculateCapitalGainsTax(0, single, 2025)).toMatchObject({ totalTax: 0, netAnnual: 0 });
    expect(calculateCapitalGainsTax(-50, single, 2025)).toMatchObject({ totalTax: 0, netAnnual: -50 });
  });
});
