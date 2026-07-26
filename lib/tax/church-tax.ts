import { getTaxYearParameters } from "./parameters";
import type { TaxProfile } from "@/lib/types";

/** Kirchensteuer: 8% of income tax in Bavaria/Baden-Württemberg, 9% elsewhere. */
export function calculateChurchTax(
  incomeTax: number,
  profile: Pick<TaxProfile, "church_tax" | "church_tax_state">,
  year: number
): number {
  if (!profile.church_tax) return 0;

  const p = getTaxYearParameters(year).churchTax;
  const rate =
    profile.church_tax_state && p.lowRateStates.includes(profile.church_tax_state)
      ? p.lowRate
      : p.defaultRate;

  return incomeTax * rate;
}
