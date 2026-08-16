import { calculateIncomeTaxForClass } from "./wage-tax";
import { calculateSoli } from "./soli";
import { calculateChurchTax } from "./church-tax";
import { calculateSocialContributions } from "./social-contributions";
import { taxableWageIncome } from "./taxable-income";
import { clampToAvailableTaxYear } from "./parameters";
import type { TaxProfile } from "@/lib/types";

export type SeveranceTaxResult = {
  taxOnSeverance: number; // income tax attributable to the severance (Fünftelregelung)
  soliOnSeverance: number;
  churchTaxOnSeverance: number;
  totalTaxOnSeverance: number;
  netSeverance: number;
  marginalTax: number; // income tax if taxed as ordinary income in one go, for comparison
  taxSaving: number; // marginalTax - taxOnSeverance (income tax only, pre soli/church)
};

/**
 * Fünftelregelung (§34 EStG): severance is taxed as if one-fifth of it were
 * added to regular income, with the resulting tax difference multiplied by
 * five. This keeps a lump sum from being pushed entirely into the top
 * bracket. `regularTaxableIncome` is the household member's zvE from their
 * *regular* income for the year, excluding the severance itself.
 */
export function calculateSeveranceNet(
  grossSeverance: number,
  regularTaxableIncome: number,
  profile: TaxProfile,
  year: number
): SeveranceTaxResult {
  const baseTax = calculateIncomeTaxForClass(regularTaxableIncome, profile.tax_class, year);
  const withFifth = calculateIncomeTaxForClass(
    regularTaxableIncome + grossSeverance / 5,
    profile.tax_class,
    year
  );
  const taxOnSeverance = Math.max(0, 5 * (withFifth - baseTax));

  const soliOnSeverance = calculateSoli(baseTax + taxOnSeverance, profile.tax_class, year) -
    calculateSoli(baseTax, profile.tax_class, year);
  const churchTaxOnSeverance =
    calculateChurchTax(baseTax + taxOnSeverance, profile, year) -
    calculateChurchTax(baseTax, profile, year);

  const totalTaxOnSeverance = taxOnSeverance + soliOnSeverance + churchTaxOnSeverance;
  const netSeverance = grossSeverance - totalTaxOnSeverance;

  const withFull = calculateIncomeTaxForClass(
    regularTaxableIncome + grossSeverance,
    profile.tax_class,
    year
  );
  const marginalTax = Math.max(0, withFull - baseTax);

  return {
    taxOnSeverance,
    soliOnSeverance,
    churchTaxOnSeverance,
    totalTaxOnSeverance,
    netSeverance,
    marginalTax,
    taxSaving: marginalTax - taxOnSeverance,
  };
}

export type SeverancePaymentTiming = {
  /** The result at the payment date actually configured (or assumed). */
  actual: SeveranceTaxResult;
  /** The result under the other side of the calendar-year boundary, for
   *  comparison — paid immediately within the departure year (full salary
   *  base) when `actual` lands later, or deferred to January of the
   *  following year (no salary base) when `actual` lands within the
   *  departure year itself. */
  alternate: SeveranceTaxResult;
  /** `alternate.totalTaxOnSeverance - actual.totalTaxOnSeverance` — positive
   *  means the actual/chosen timing saves tax versus the alternate; negative
   *  means the alternate would have been cheaper. */
  timingTaxSaving: number;
  /** True when the payment lands in a calendar year after the one
   *  employment ends in — usually the reason for a lower marginal rate,
   *  since that year's "regular" taxable income no longer includes salary. */
  paidAfterEmploymentEnds: boolean;
};

/**
 * Compares a severance's tax outcome at its actual payment date against the
 * other side of the calendar-year boundary — the classic German severance
 * timing lever: tax is owed in the year the lump sum is *received*, so
 * paying it in a year with materially less other income (typically: after
 * employment has fully ended, so no more salary) can push a meaningful share
 * of it into lower brackets. `departureYear`/`paymentYear` are plain
 * calendar years (`Number(date.slice(0, 4))`) — `paymentYear` is expected to
 * be `departureYear` or later; nothing stops a caller passing an earlier
 * year, but the "alternate" framing (immediate vs. next-January) only makes
 * sense forward from the departure year.
 *
 * `nonSalaryAnnualGross` (rental/part-time/other income, already annualized
 * — see `resolve-scenario.ts`'s own `nonSalaryAnnualGrossByMember`) is
 * assumed to continue in every candidate year; only the salary/bonus portion
 * of "regular taxable income" is dropped once employment has ended.
 */
export function compareSeverancePaymentTiming(
  grossSeverance: number,
  monthlyBaseSalary: number,
  annualBonus: number,
  nonSalaryAnnualGross: number,
  profile: TaxProfile,
  departureYear: number,
  paymentYear: number
): SeverancePaymentTiming {
  const paidAfterEmploymentEnds = paymentYear > departureYear;

  function outcomeForYear(year: number, includeSalaryBase: boolean): SeveranceTaxResult {
    const clampedYear = clampToAvailableTaxYear(year);
    const grossAnnual = includeSalaryBase
      ? monthlyBaseSalary * 12 + annualBonus + nonSalaryAnnualGross
      : nonSalaryAnnualGross;
    const socialContribsAnnual = includeSalaryBase
      ? calculateSocialContributions(monthlyBaseSalary, profile, clampedYear).total * 12
      : 0;
    const regularTaxableIncome = taxableWageIncome(grossAnnual, socialContribsAnnual, profile, clampedYear);
    return calculateSeveranceNet(grossSeverance, regularTaxableIncome, profile, clampedYear);
  }

  const actual = outcomeForYear(paymentYear, !paidAfterEmploymentEnds);
  const alternate = paidAfterEmploymentEnds
    ? outcomeForYear(departureYear, true)
    : outcomeForYear(departureYear + 1, false);

  return {
    actual,
    alternate,
    timingTaxSaving: alternate.totalTaxOnSeverance - actual.totalTaxOnSeverance,
    paidAfterEmploymentEnds,
  };
}
