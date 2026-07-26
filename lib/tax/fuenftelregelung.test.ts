import { describe, expect, it } from "vitest";
import { calculateSeveranceNet } from "./fuenftelregelung";
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
