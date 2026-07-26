import { toMonthlyEquivalent } from "./frequency";
import { calculateNetIncome } from "@/lib/tax";
import type { Income, TaxProfile } from "@/lib/types";

export type IncomeGrossBreakdown = {
  /** Recurring monthly-equivalent gross — base pay only when
   *  `bonus_distribution` is "one_time"; base pay plus amortized bonus
   *  when "spread". This is what feeds every "per month" figure across
   *  the app (dashboard, income totals, runway projections). */
  recurringMonthlyGross: number;
  /** Annual gross bonus (Christmas + holiday + discretionary annual bonus)
   *  paid as a single lump when `bonus_distribution` is "one_time" — 0
   *  when "spread" (already folded into `recurringMonthlyGross` instead).
   *  The total annual compensation is identical either way; this only
   *  changes how it's split for display. */
  oneTimeAnnualGross: number;
  /** Christmas + holiday + discretionary annual bonus, combined —
   *  regardless of `bonus_distribution`. Equals `oneTimeAnnualGross` when
   *  "one_time"; when "spread" it's already inside `recurringMonthlyGross`
   *  instead, so this is the only place to read the total. 0 for
   *  non-salary rows or a salary row with no bonus components set. */
  bonusAnnualTotal: number;
  /** Reference only — a non-cash benefit-in-kind, excluded from every
   *  gross/net total. Not "money you see" — kept on the row for a future
   *  severance calculation to use. */
  annualCarAllowance: number;
  /** Reference only — pre-tax deferred comp (e.g. Entgeltumwandlung) that
   *  never reaches the household as cash, so it's excluded from gross/net
   *  entirely rather than netted out of them. */
  annualPensionContribution: number;
  /** A company car's monthly private-use cost. Unlike the other reference
   *  fields above, this one *does* reduce take-home pay — it's subtracted
   *  straight from `recurringMonthlyNet` in `incomeNetBreakdown`, not from
   *  gross (it's a net payroll deduction, not a taxable-income change). */
  monthlyCompanyCarCost: number;
};

/**
 * Splits one income row's compensation into what's recurring (feeds
 * monthly figures) versus what's genuinely a once-a-year lump, plus the
 * two components that never count as gross/net income at all. Non-salary
 * rows never carry bonus/car/pension values (the form only shows those
 * fields for `type: "salary"`), so they always fall through to the plain
 * base-pay case.
 */
export function incomeGrossBreakdown(income: Income): IncomeGrossBreakdown {
  const monthlyBase = toMonthlyEquivalent(income.gross_amount, income.frequency);

  if (income.type !== "salary") {
    return {
      recurringMonthlyGross: monthlyBase,
      oneTimeAnnualGross: 0,
      bonusAnnualTotal: 0,
      annualCarAllowance: 0,
      annualPensionContribution: 0,
      monthlyCompanyCarCost: 0,
    };
  }

  const christmasBonus = monthlyBase * ((income.christmas_bonus_pct ?? 0) / 100);
  const holidayBonus = monthlyBase * ((income.holiday_pay_pct ?? 0) / 100);
  const bonusAnnual = christmasBonus + holidayBonus + (income.annual_bonus ?? 0);
  const spread = income.bonus_distribution === "spread";

  return {
    recurringMonthlyGross: monthlyBase + (spread ? bonusAnnual / 12 : 0),
    oneTimeAnnualGross: spread ? 0 : bonusAnnual,
    bonusAnnualTotal: bonusAnnual,
    annualCarAllowance: income.annual_car_allowance ?? 0,
    annualPensionContribution: (income.monthly_pension_contribution ?? 0) * 12,
    monthlyCompanyCarCost: income.monthly_company_car_cost ?? 0,
  };
}

export type IncomeNetBreakdown = {
  /** Net for the recurring monthly figure — excludes any one-time bonus. */
  recurringMonthlyNet: number;
  /** Net on the one-time annual bonus alone, 0 when there isn't one. */
  oneTimeAnnualNet: number;
};

/**
 * Nets a row via the differential method: tax the recurring annual gross
 * alone, then tax recurring+bonus together, and attribute the difference
 * to the bonus. That's a better approximation of the bonus's real
 * marginal tax rate than netting it independently (German wage tax is
 * progressive — a bonus stacked on top of a salary is taxed at that
 * salary's marginal rate, not its own standalone average rate). Same
 * annual-blend simplification as the rest of lib/tax otherwise: no
 * distinct "sonstige Bezüge" withholding timing.
 */
export function incomeNetBreakdown(
  income: Income,
  profile: TaxProfile,
  year: number
): IncomeNetBreakdown {
  const gross = incomeGrossBreakdown(income);
  const recurringAnnualGross = gross.recurringMonthlyGross * 12;
  const recurringAnnualNet = calculateNetIncome(
    recurringAnnualGross,
    "annual",
    profile,
    year
  ).netAnnual;
  const recurringMonthlyNet = recurringAnnualNet / 12 - gross.monthlyCompanyCarCost;

  if (gross.oneTimeAnnualGross <= 0) {
    return { recurringMonthlyNet, oneTimeAnnualNet: 0 };
  }

  const totalAnnualNet = calculateNetIncome(
    recurringAnnualGross + gross.oneTimeAnnualGross,
    "annual",
    profile,
    year
  ).netAnnual;

  return {
    recurringMonthlyNet,
    oneTimeAnnualNet: totalAnnualNet - recurringAnnualNet,
  };
}
