import { getTaxYearParameters } from "./parameters";
import { calculateChurchTax } from "./church-tax";
import type { TaxProfile } from "@/lib/types";

export type CapitalGainsTaxResult = {
  grossAnnual: number;
  allowanceUsed: number;
  taxableAnnual: number;
  flatTax: number; // Abgeltungsteuer, 25% of taxableAnnual
  soli: number;
  churchTax: number;
  totalTax: number;
  netAnnual: number;
};

/**
 * Abgeltungsteuer — the flat withholding tax on capital income (interest,
 * dividends, investment returns): 25% after the annual Sparerpauschbetrag
 * allowance, plus a straight 5.5% Soli and (if registered) church tax on
 * the resulting flat tax. Unlike wage-tax Soli, there's no Freigrenze here
 * — Abgeltungsteuer is a final withholding tax the bank/broker applies
 * directly, not run through the annual assessment's exemption test (a
 * Günstigerprüfung comparing to the marginal wage-tax rate exists in real
 * life but isn't modeled here — a documented v1 gap, same spirit as the
 * class V/VI wage-tax approximation elsewhere in this module).
 *
 * `tax_class === 3` is reused as the "married" proxy for which
 * Sparerpauschbetrag applies, same convention `calculateSoli` already uses
 * for its Freigrenze — not a real filing-status field this app tracks
 * separately.
 */
export function calculateCapitalGainsTax(
  grossAnnual: number,
  profile: Pick<TaxProfile, "tax_class" | "church_tax" | "church_tax_state">,
  year: number
): CapitalGainsTaxResult {
  if (grossAnnual <= 0) {
    return {
      grossAnnual,
      allowanceUsed: 0,
      taxableAnnual: 0,
      flatTax: 0,
      soli: 0,
      churchTax: 0,
      totalTax: 0,
      netAnnual: grossAnnual,
    };
  }

  const p = getTaxYearParameters(year);
  const allowance =
    profile.tax_class === 3 ? p.capitalGains.sparerPauschbetragMarried : p.capitalGains.sparerPauschbetragSingle;
  const allowanceUsed = Math.min(grossAnnual, allowance);
  const taxableAnnual = grossAnnual - allowanceUsed;

  const flatTax = taxableAnnual * p.capitalGains.flatRate;
  const soli = flatTax * p.soli.rate;
  const churchTax = calculateChurchTax(flatTax, profile, year);
  const totalTax = flatTax + soli + churchTax;

  return {
    grossAnnual,
    allowanceUsed,
    taxableAnnual,
    flatTax,
    soli,
    churchTax,
    totalTax,
    netAnnual: grossAnnual - totalTax,
  };
}
