import type { SeveranceScenarioPackage } from "@/lib/types";

export type SeverancePackageInput = Pick<
  SeveranceScenarioPackage,
  | "monthly_base_salary"
  | "annual_bonus"
  | "annual_car_benefit"
  | "years_of_service"
  | "severance_multiplier"
  | "include_bonus_in_calc"
  | "include_car_in_calc"
  | "include_garden_leave"
  | "notice_period_months"
  | "gross_severance_override"
  | "christmas_bonus_pct"
  | "include_christmas_bonus_in_calc"
>;

export type SeverancePackageResult = {
  monthlyBaseForCalc: number;
  formulaGross: number; // what the multiplier × years × base formula produces, ignoring any override
  severanceGross: number; // the override if set, else formulaGross
  noticePay: number; // gross notice-period pay, informational — the runway engine nets this monthly instead
  totalGrossPackage: number;
  isOverridden: boolean;
};

/**
 * Sizes the gross severance package — modeled on severance-scenarios.jsx.
 * Pure and self-contained: takes the scenario's own salary snapshot, not the
 * household's live `income` table (see DESIGN §6 for why).
 */
export function calculateSeverancePackage(input: SeverancePackageInput): SeverancePackageResult {
  const monthlyBase = input.monthly_base_salary ?? 0;
  const monthlyBaseForCalc =
    monthlyBase +
    (input.include_bonus_in_calc ? input.annual_bonus / 12 : 0) +
    (input.include_car_in_calc ? input.annual_car_benefit / 12 : 0) +
    (input.include_christmas_bonus_in_calc
      ? monthlyBase * ((input.christmas_bonus_pct ?? 0) / 100)
      : 0);

  const formulaGross = (input.severance_multiplier ?? 0) * (input.years_of_service ?? 0) * monthlyBaseForCalc;
  const isOverridden = input.gross_severance_override != null;
  const severanceGross = isOverridden ? input.gross_severance_override! : formulaGross;

  const noticePay = input.include_garden_leave ? (input.notice_period_months ?? 0) * monthlyBase : 0;

  return {
    monthlyBaseForCalc,
    formulaGross,
    severanceGross,
    noticePay,
    totalGrossPackage: severanceGross + noticePay,
    isOverridden,
  };
}

/**
 * The §1a KSchG rule-of-thumb severance ceiling — 0.5 months' pay × years of
 * service. Reference-only baseline (not what most negotiated packages
 * actually pay), and also the severance-size half of the Sperrzeit
 * safe-harbor test (lib/unemployment/sperrzeit.ts).
 */
export function statutoryFloor(monthlyBaseSalary: number, yearsOfService: number): number {
  return 0.5 * monthlyBaseSalary * yearsOfService;
}
