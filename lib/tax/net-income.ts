import { calculateSocialContributions, type SocialContributions } from "./social-contributions";
import { taxableWageIncome } from "./taxable-income";
import { calculateIncomeTaxForClass } from "./wage-tax";
import { calculateSoli } from "./soli";
import { calculateChurchTax } from "./church-tax";
import type { Frequency, TaxProfile } from "@/lib/types";

const PERIODS_PER_YEAR: Record<Frequency, number> = {
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

export type NetIncomeBreakdown = {
  grossAnnual: number;
  socialContributions: SocialContributions;
  taxableIncome: number;
  incomeTax: number;
  soli: number;
  churchTax: number;
  netAnnual: number;
  netMonthly: number;
};

/**
 * Nets a recurring wage/part-time income figure for one household member.
 * `grossAmount`/`frequency` describe a single income row (see lib/types.ts);
 * the result is annualised internally and returned both ways.
 */
export function calculateNetIncome(
  grossAmount: number,
  frequency: Frequency,
  profile: TaxProfile,
  year: number
): NetIncomeBreakdown {
  const grossAnnual = grossAmount * PERIODS_PER_YEAR[frequency];
  const grossMonthlyEquivalent = grossAnnual / 12;

  const socialContributions = calculateSocialContributions(grossMonthlyEquivalent, profile, year);
  const socialContributionsAnnual = socialContributions.total * 12;

  const taxableIncome = taxableWageIncome(grossAnnual, socialContributionsAnnual, profile, year);
  const incomeTax = calculateIncomeTaxForClass(taxableIncome, profile.tax_class, year);
  const soli = calculateSoli(incomeTax, profile.tax_class, year);
  const churchTax = calculateChurchTax(incomeTax, profile, year);

  const netAnnual = grossAnnual - socialContributionsAnnual - incomeTax - soli - churchTax;

  return {
    grossAnnual,
    socialContributions,
    taxableIncome,
    incomeTax,
    soli,
    churchTax,
    netAnnual,
    netMonthly: netAnnual / 12,
  };
}
