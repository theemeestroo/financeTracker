import { describe, expect, it } from "vitest";
import { monthlyHealthInsuranceCost } from "./health-coverage";

const gkvProfile = {
  statutory_health_insurance: true,
  has_children: true,
  health_insurance_addon_rate: null,
  private_health_insurance_monthly_premium: null,
};

const pkvProfile = {
  statutory_health_insurance: false,
  has_children: true,
  health_insurance_addon_rate: null,
  private_health_insurance_monthly_premium: 600,
};

describe("monthlyHealthInsuranceCost — GKV, 2026", () => {
  it("prices voluntary continuation at the full combined rate during a self-funded gap", () => {
    // base 1216.42 * (0.146 + 0.029) = 212.8735 (health) + 1216.42 * 0.036 = 43.79112 (care, has children)
    expect(monthlyHealthInsuranceCost(gkvProfile, "gap", 2026)).toBeCloseTo(256.66462, 2);
  });

  it("adds the childless surcharge (unhalved) during a self-funded gap", () => {
    const withChildren = monthlyHealthInsuranceCost(gkvProfile, "gap", 2026);
    const childless = monthlyHealthInsuranceCost({ ...gkvProfile, has_children: false }, "gap", 2026);
    expect(childless - withChildren).toBeCloseTo(1216.42 * 0.006, 2);
  });

  it("is free while actively drawing ALG I", () => {
    expect(monthlyHealthInsuranceCost(gkvProfile, "alg1", 2026)).toBe(0);
  });
});

describe("monthlyHealthInsuranceCost — PKV, 2026", () => {
  it("charges the full unsubsidized premium during a self-funded gap", () => {
    expect(monthlyHealthInsuranceCost(pkvProfile, "gap", 2026)).toBe(600);
  });

  it("subtracts the Bundesagentur subsidy ceiling while on ALG I", () => {
    // 600 - 456.32 = 143.68
    expect(monthlyHealthInsuranceCost(pkvProfile, "alg1", 2026)).toBeCloseTo(143.68, 2);
  });

  it("floors the ALG I cost at 0 when the premium is below the subsidy ceiling", () => {
    expect(
      monthlyHealthInsuranceCost({ ...pkvProfile, private_health_insurance_monthly_premium: 300 }, "alg1", 2026)
    ).toBe(0);
  });
});
