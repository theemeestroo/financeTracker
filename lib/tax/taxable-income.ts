import { getTaxYearParameters } from "./parameters";
import type { TaxProfile } from "@/lib/types";

/**
 * Converts annual gross wage income into taxable income (zvE) for the
 * standard-tariff classes (I, II, IV): deduct the Arbeitnehmer-Pauschbetrag,
 * Sonderausgaben-Pauschbetrag, actual social insurance contributions (used
 * here as the Vorsorgepauschale proxy — very close to the real mechanism for
 * a standard employee case), and — for class II — the Entlastungsbetrag für
 * Alleinerziehende.
 *
 * Classes V and VI skip these deductions entirely (see wage-tax.ts for why).
 */
export function taxableWageIncome(
  grossAnnual: number,
  socialContributionsAnnual: number,
  profile: Pick<TaxProfile, "tax_class">,
  year: number
): number {
  if (profile.tax_class === 5 || profile.tax_class === 6) {
    return Math.max(0, grossAnnual);
  }

  const p = getTaxYearParameters(year).allowances;
  let deductions = p.employeeFlatRate + p.specialExpensesFlatRate + socialContributionsAnnual;

  if (profile.tax_class === 2) {
    deductions += p.singleParentRelief;
  }

  return Math.max(0, grossAnnual - deductions);
}
