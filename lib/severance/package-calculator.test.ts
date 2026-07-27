import { describe, expect, it } from "vitest";
import { calculateSeverancePackage, statutoryFloor } from "./package-calculator";

// Cross-checked against the severance-scenarios.jsx mock's worked example:
// monthlySalary 10,480, 19 years service, 1.75× multiplier, bonus included,
// car excluded, garden leave on (6 months notice).
describe("calculateSeverancePackage", () => {
  const base = {
    monthly_base_salary: 10480,
    annual_bonus: 12000,
    annual_car_benefit: 6630,
    years_of_service: 19,
    severance_multiplier: 1.75,
    include_bonus_in_calc: true,
    include_car_in_calc: false,
    include_garden_leave: true,
    notice_period_months: 6,
    gross_severance_override: null,
    christmas_bonus_pct: null,
    include_christmas_bonus_in_calc: false,
  };

  it("matches the mock's worked example", () => {
    const result = calculateSeverancePackage(base);
    expect(result.monthlyBaseForCalc).toBeCloseTo(11480, 2);
    expect(result.severanceGross).toBeCloseTo(381710, 2);
    expect(result.noticePay).toBeCloseTo(62880, 2);
    expect(result.totalGrossPackage).toBeCloseTo(444590, 2);
    expect(result.isOverridden).toBe(false);
  });

  it("an override replaces the formula result but leaves notice pay alone", () => {
    const result = calculateSeverancePackage({ ...base, gross_severance_override: 250000 });
    expect(result.severanceGross).toBe(250000);
    expect(result.formulaGross).toBeCloseTo(381710, 2);
    expect(result.noticePay).toBeCloseTo(62880, 2);
    expect(result.isOverridden).toBe(true);
  });

  it("excludes car benefit from the base when include_car_in_calc is false", () => {
    const withCar = calculateSeverancePackage({ ...base, include_car_in_calc: true });
    const withoutCar = calculateSeverancePackage(base);
    expect(withCar.monthlyBaseForCalc).toBeCloseTo(
      withoutCar.monthlyBaseForCalc + base.annual_car_benefit / 12,
      2
    );
  });

  it("no garden leave means no notice pay", () => {
    const result = calculateSeverancePackage({ ...base, include_garden_leave: false });
    expect(result.noticePay).toBe(0);
  });

  it("folds christmas bonus % into the calc base when included", () => {
    const withXmas = calculateSeverancePackage({
      ...base,
      christmas_bonus_pct: 100,
      include_christmas_bonus_in_calc: true,
    });
    const without = calculateSeverancePackage(base);
    // 100% of monthly_base_salary (10480) added to the calc base
    expect(withXmas.monthlyBaseForCalc).toBeCloseTo(without.monthlyBaseForCalc + 10480, 2);
  });

  it("leaves the calc base unchanged when christmas bonus is not included", () => {
    const result = calculateSeverancePackage({ ...base, christmas_bonus_pct: 100 });
    expect(result.monthlyBaseForCalc).toBeCloseTo(11480, 2);
  });
});

describe("statutoryFloor", () => {
  it("computes 0.5 months' pay × years of service", () => {
    // 0.5 * 10480 * 19 = 99560
    expect(statutoryFloor(10480, 19)).toBeCloseTo(99560, 2);
  });

  it("is zero with no service", () => {
    expect(statutoryFloor(10480, 0)).toBe(0);
  });
});
