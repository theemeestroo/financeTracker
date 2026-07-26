import { describe, expect, it } from "vitest";
import { calculateSeverancePackage } from "./package-calculator";

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
});
