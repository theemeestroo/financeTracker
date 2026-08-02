import { getTaxYearParameters } from "./parameters";
import { calculateBaseIncomeTax, calculateIncomeTaxForClass } from "./wage-tax";
import { calculateSocialContributions } from "./social-contributions";
import { taxableWageIncome } from "./taxable-income";
import { calculateSoli } from "./soli";
import { calculateChurchTax } from "./church-tax";
import { calculateCapitalGainsTax } from "./capital-gains-tax";
import type { TaxProfile } from "@/lib/types";

export type TaxBracketStep = {
  /** e.g. "0%", "14–24%", "24–42%", "42%", "45%" — zone 1/2 have a rising
   *  marginal rate rather than a flat one, so the range is shown as-is
   *  rather than picking a single misleading number. */
  zoneLabel: string;
  rangeStart: number;
  /** null on the top (45%) zone — open-ended. */
  rangeEnd: number | null;
  /** The portion of taxable income actually falling in this zone — 0 when
   *  `reached` is false. */
  amountInZone: number;
  /** Tax attributable to this zone — 0 when `reached` is false. Across
   *  reached zones this always sums exactly to calculateIncomeTaxForClass's
   *  own total (the last reached zone absorbs any floor-rounding remainder
   *  rather than each zone being computed independently and risking a few
   *  cents of drift). */
  taxInZone: number;
  /** Whether the taxable income actually extends into this zone at all —
   *  every zone is always returned (see `taxBracketBreakdown`), so a
   *  bracket-ladder UI can render the full 0–45% structure and grey out
   *  the zones a person hasn't reached, not just the filled ones. */
  reached: boolean;
};

const ZONE_LABELS = ["0%", "14–24%", "24–42%", "42%", "45%"];

/**
 * Steps a taxable income (zvE) through *all* five §32a EStG progressive
 * zones — always five entries, in order, regardless of how much of the
 * income actually reaches each one — returning how much of the income
 * falls in each zone and the tax attributable to it. The data behind a
 * "here's the whole tax ladder, and here's where my income sits on it"
 * bar: every zone is present so the UI can show the full 0–45% structure,
 * with `reached`/`amountInZone` distinguishing the zones actually used
 * from the ones still ahead. Tax class III (Splittingverfahren) runs the
 * tariff on half the income and doubles the result, same as
 * `calculateIncomeTaxForClass`; this mirrors that by computing on the half
 * and scaling zone amounts/tax back up by 2, so the visual reflects what a
 * splitting couple actually sees (each euro taxed as if split between two
 * people).
 */
export function taxBracketBreakdown(
  taxableIncome: number,
  taxClass: 1 | 2 | 3 | 4 | 5 | 6,
  year: number
): TaxBracketStep[] {
  const p = getTaxYearParameters(year).incomeTax;
  const isSplitting = taxClass === 3;
  const base = isSplitting ? Math.max(0, taxableIncome) / 2 : Math.max(0, taxableIncome);
  const scale = isSplitting ? 2 : 1;

  const zoneBounds = [0, p.basicAllowance, p.zone1End, p.zone2End, p.zone3End, Infinity];
  const totalTax = calculateBaseIncomeTax(base, year);

  const zones = ZONE_LABELS.map((label, i) => {
    const lo = zoneBounds[i];
    const hi = zoneBounds[i + 1];
    return { lo, hi, label, amount: Math.max(0, Math.min(base, hi) - lo) };
  });
  const lastReachedIndex = zones.reduce((last, z, i) => (z.amount > 0 ? i : last), -1);

  let allocatedTax = 0;
  return zones.map((zone, idx) => {
    const reached = zone.amount > 0;
    const taxInZone = reached
      ? idx === lastReachedIndex
        ? totalTax - allocatedTax
        : calculateBaseIncomeTax(zone.hi, year) - calculateBaseIncomeTax(zone.lo, year)
      : 0;
    if (reached) allocatedTax += taxInZone;
    return {
      zoneLabel: zone.label,
      rangeStart: zone.lo * scale,
      rangeEnd: zone.hi === Infinity ? null : zone.hi * scale,
      amountInZone: zone.amount * scale,
      taxInZone: taxInZone * scale,
      reached,
    };
  });
}

export type AnnualIncomeSource = {
  label: string;
  grossAnnual: number;
};

export type AnnualSeveranceTax = {
  gross: number;
  totalTax: number;
  net: number;
};

export type AnnualPersonTaxSummary = {
  householdMemberId: string;
  year: number;
  /** Regular wage-taxable income, by source label (salary, rental, garden
   *  leave, recurring events, ...) — merged across every row/month that
   *  landed in this calendar year. Excludes the severance lump sum
   *  (handled separately below) and tax-exempt income (ALG I). */
  incomeSources: AnnualIncomeSource[];
  /** Tax-exempt income (ALG I) — shown for completeness, not part of
   *  `taxableIncome`/`bracketSteps`. The Progressionsvorbehalt effect
   *  (tax-free but still nudges the rate on other income) isn't modeled. */
  taxFreeIncome: number;
  totalGrossRegular: number;
  socialContributions: number;
  taxableIncome: number;
  bracketSteps: TaxBracketStep[];
  incomeTax: number;
  soli: number;
  churchTax: number;
  totalTaxRegular: number;
  netRegular: number;
  /** Severance lump sum landing in this year, taxed via the Fünftelregelung
   *  — 0s when none. Reused as-is from the scenario's own package summary
   *  (lib/tax/fuenftelregelung.ts via resolve-scenario.ts) rather than
   *  recomputed here, so this view always agrees with the Cash Flow tab's
   *  own severance figures. */
  severance: AnnualSeveranceTax;
  /** Savings/investment accrual for the year (gross, before Abgeltungsteuer)
   *  and its own flat-tax breakdown — kept out of `taxableIncome`/
   *  `bracketSteps` entirely, since it's a different tax regime (flat
   *  capital-gains tax, not progressive wage tax), but folded into the
   *  totals below so it's genuinely "considered for the overall calc." */
  investmentIncomeGross: number;
  investmentIncomeTax: number;
  investmentIncomeNet: number;
  totalGrossAll: number;
  totalTaxAll: number;
  totalNetAll: number;
};

/**
 * One household member's full-year tax position: every regular income
 * source combined into a single annual wage-tax calculation (so a second
 * income source shares the person's real marginal position instead of
 * getting its own allowance — see `combinedIncomeBreakdown` in
 * lib/finance/income-gross.ts for the same fix applied month-by-month),
 * that year's severance lump sum (if any) taxed separately via the
 * Fünftelregelung and shown as its own segment (it genuinely isn't taxed
 * the same way as ordinary income), and savings/investment accrual taxed
 * under the flat Abgeltungsteuer (`lib/tax/capital-gains-tax.ts`) — a
 * third, independent regime, so it's neither combined into `taxableIncome`
 * nor treated as ordinary wage income.
 */
export function annualPersonTaxSummary(
  householdMemberId: string,
  year: number,
  incomeSources: AnnualIncomeSource[],
  taxFreeIncome: number,
  profile: TaxProfile,
  severance: AnnualSeveranceTax = { gross: 0, totalTax: 0, net: 0 },
  investmentIncomeGross = 0
): AnnualPersonTaxSummary {
  const totalGrossRegular = incomeSources.reduce((sum, s) => sum + s.grossAnnual, 0);
  const socialContributions =
    totalGrossRegular > 0
      ? calculateSocialContributions(totalGrossRegular / 12, profile, year).total * 12
      : 0;
  const taxableIncome = taxableWageIncome(totalGrossRegular, socialContributions, profile, year);
  const bracketSteps = taxBracketBreakdown(taxableIncome, profile.tax_class, year);
  const incomeTax = calculateIncomeTaxForClass(taxableIncome, profile.tax_class, year);
  const soli = calculateSoli(incomeTax, profile.tax_class, year);
  const churchTax = calculateChurchTax(incomeTax, profile, year);
  const totalTaxRegular = incomeTax + soli + churchTax;
  const netRegular = totalGrossRegular - socialContributions - totalTaxRegular;

  const investment = calculateCapitalGainsTax(investmentIncomeGross, profile, year);

  return {
    householdMemberId,
    year,
    incomeSources,
    taxFreeIncome,
    totalGrossRegular,
    socialContributions,
    taxableIncome,
    bracketSteps,
    incomeTax,
    soli,
    churchTax,
    totalTaxRegular,
    netRegular,
    severance,
    investmentIncomeGross: investment.grossAnnual,
    investmentIncomeTax: investment.totalTax,
    investmentIncomeNet: investment.netAnnual,
    totalGrossAll: totalGrossRegular + severance.gross + taxFreeIncome + investment.grossAnnual,
    totalTaxAll: totalTaxRegular + severance.totalTax + investment.totalTax,
    totalNetAll: netRegular + severance.net + taxFreeIncome + investment.netAnnual,
  };
}
