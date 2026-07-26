import { describe, expect, it } from "vitest";
import { calculateSocialContributions } from "./social-contributions";

const baseProfile = {
  statutory_health_insurance: true,
  has_children: true,
  health_insurance_addon_rate: null,
};

describe("calculateSocialContributions — 2026", () => {
  it("matches hand-computed employee shares below the contribution ceilings", () => {
    const result = calculateSocialContributions(5000, baseProfile, 2026);
    // RV: 5000 * 0.093 = 465; ALV: 5000 * 0.013 = 65
    expect(result.pension).toBeCloseTo(465, 2);
    expect(result.unemployment).toBeCloseTo(65, 2);
    // KV: 5000 * (0.073 + 0.029/2) = 5000 * 0.0875 = 437.5
    expect(result.health).toBeCloseTo(437.5, 2);
    // PV: 5000 * 0.018 = 90 (has children, no surcharge)
    expect(result.care).toBeCloseTo(90, 2);
  });

  it("caps RV/ALV at the Beitragsbemessungsgrenze (8,450/mo in 2026)", () => {
    const result = calculateSocialContributions(20000, baseProfile, 2026);
    expect(result.pension).toBeCloseTo(8450 * 0.093, 2);
    expect(result.unemployment).toBeCloseTo(8450 * 0.013, 2);
  });

  it("caps KV/PV at the lower Beitragsbemessungsgrenze (5,812.50/mo in 2026)", () => {
    const result = calculateSocialContributions(20000, baseProfile, 2026);
    expect(result.health).toBeCloseTo(5812.5 * 0.0875, 2);
  });

  it("applies the childless Pflegeversicherung surcharge when has_children is false", () => {
    const withChildren = calculateSocialContributions(5000, { ...baseProfile, has_children: true }, 2026);
    const childless = calculateSocialContributions(5000, { ...baseProfile, has_children: false }, 2026);
    expect(childless.care - withChildren.care).toBeCloseTo(5000 * 0.006, 2);
  });

  it("returns zero KV/PV for privately insured members", () => {
    const result = calculateSocialContributions(
      5000,
      { ...baseProfile, statutory_health_insurance: false },
      2026
    );
    expect(result.health).toBe(0);
    expect(result.care).toBe(0);
    expect(result.pension).toBeGreaterThan(0);
  });
});
