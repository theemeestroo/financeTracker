import { toMonthlyEquivalent } from "./frequency";
import type { Split } from "./splits";
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
 * base-pay case — except `rental`, which reduces that base by its own
 * overhead reserve (vacancy, maintenance, etc.) before it becomes the
 * recurring gross figure. Since `incomeNetBreakdown` below taxes whatever
 * `recurringMonthlyGross` comes out of here, the overhead-adjusted amount
 * is what actually gets taxed too — not the raw rent.
 *
 * Everything is converted to EUR first (a no-op for EUR rows, whose
 * `exchange_rate_to_eur` is always 1) — every gross/net figure and every
 * tax calculation downstream operates in EUR regardless of what currency
 * the row was actually entered in.
 */
export function incomeGrossBreakdown(rawIncome: Income): IncomeGrossBreakdown {
  const income = convertToEUR(rawIncome);
  const monthlyBase = toMonthlyEquivalent(income.gross_amount, income.frequency);

  if (income.type !== "salary") {
    const overheadFactor =
      income.type === "rental" ? 1 - (income.rental_overhead_pct ?? 0) / 100 : 1;
    return {
      recurringMonthlyGross: monthlyBase * overheadFactor,
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

/** Scales every dollar field on an income row by a factor — shared by
 *  split-share proration and currency conversion below, since both are
 *  just "multiply the money fields, leave everything else (including
 *  percentage fields like christmas_bonus_pct/holiday_pay_pct) alone." */
function scaleMonetaryFields(income: Income, factor: number): Income {
  return {
    ...income,
    gross_amount: income.gross_amount * factor,
    annual_bonus: income.annual_bonus * factor,
    annual_car_allowance: income.annual_car_allowance * factor,
    monthly_pension_contribution: income.monthly_pension_contribution * factor,
    monthly_company_car_cost: income.monthly_company_car_cost * factor,
  };
}

/** One split's share of an income row. The percentage fields stay put —
 *  they're already relative to the (now-scaled) base, so scaling the base
 *  alone correctly scales the bonus too. */
function scaleIncomeToShare(income: Income, percentage: number): Income {
  return scaleMonetaryFields(income, percentage / 100);
}

/** Converts every dollar field to EUR via the row's own exchange rate — a
 *  no-op for EUR rows, whose rate is always 1. */
function convertToEUR(income: Income): Income {
  return scaleMonetaryFields(income, income.exchange_rate_to_eur ?? 1);
}

export type IncomeSplitBreakdown = {
  householdMemberId: string;
  gross: IncomeGrossBreakdown;
  /** null when this share's member has no tax profile yet (or the row is unattributed). */
  net: IncomeNetBreakdown | null;
};

/**
 * The per-share view every other income calculation is built from. Zero
 * splits (household/unattributed income) is one entry covering the whole
 * row with `net: null` — there's no one to tax. One or more splits is one
 * entry per split, each scaled to its share and netted via that person's
 * own tax profile.
 */
export function incomeBreakdownPerSplit(
  income: Income,
  splits: Split[],
  taxProfileByMember: Map<string, TaxProfile>,
  year: number
): IncomeSplitBreakdown[] {
  if (splits.length === 0) {
    return [{ householdMemberId: "", gross: incomeGrossBreakdown(income), net: null }];
  }

  return splits.map((s) => {
    const share = scaleIncomeToShare(income, s.percentage);
    const profile = taxProfileByMember.get(s.household_member_id);
    return {
      householdMemberId: s.household_member_id,
      gross: incomeGrossBreakdown(share),
      net: profile ? incomeNetBreakdown(share, profile, year) : null,
    };
  });
}

/** Gross total across every share — gross doesn't need a named recipient,
 *  so this doesn't need tax profiles at all. */
export function incomeGrossBreakdownForRow(income: Income, splits: Split[]): IncomeGrossBreakdown {
  const shares = splits.length === 0 ? [income] : splits.map((s) => scaleIncomeToShare(income, s.percentage));
  return shares.reduce<IncomeGrossBreakdown>(
    (acc, share) => {
      const b = incomeGrossBreakdown(share);
      return {
        recurringMonthlyGross: acc.recurringMonthlyGross + b.recurringMonthlyGross,
        oneTimeAnnualGross: acc.oneTimeAnnualGross + b.oneTimeAnnualGross,
        bonusAnnualTotal: acc.bonusAnnualTotal + b.bonusAnnualTotal,
        annualCarAllowance: acc.annualCarAllowance + b.annualCarAllowance,
        annualPensionContribution: acc.annualPensionContribution + b.annualPensionContribution,
        monthlyCompanyCarCost: acc.monthlyCompanyCarCost + b.monthlyCompanyCarCost,
      };
    },
    {
      recurringMonthlyGross: 0,
      oneTimeAnnualGross: 0,
      bonusAnnualTotal: 0,
      annualCarAllowance: 0,
      annualPensionContribution: 0,
      monthlyCompanyCarCost: 0,
    }
  );
}

/** Net total across every share that has a resolvable tax profile —
 *  `missingShares` counts the rest (an unattributed row, or a named share
 *  whose member has no tax profile yet), the way `missingProfileCount`
 *  already surfaces this in the UI today. */
export function incomeNetBreakdownForRow(
  income: Income,
  splits: Split[],
  taxProfileByMember: Map<string, TaxProfile>,
  year: number
): { net: IncomeNetBreakdown; missingShares: number } {
  let recurringMonthlyNet = 0;
  let oneTimeAnnualNet = 0;
  let missingShares = 0;

  for (const share of incomeBreakdownPerSplit(income, splits, taxProfileByMember, year)) {
    if (!share.net) {
      missingShares += 1;
      continue;
    }
    recurringMonthlyNet += share.net.recurringMonthlyNet;
    oneTimeAnnualNet += share.net.oneTimeAnnualNet;
  }

  return { net: { recurringMonthlyNet, oneTimeAnnualNet }, missingShares };
}
