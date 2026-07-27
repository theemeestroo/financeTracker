import { calculateIncomeTaxForClass, calculateSoli, getTaxYearParameters } from "@/lib/tax";
import { getUnemploymentBenefitYearParameters } from "./parameters";

/**
 * Monthly ALG I benefit amount — §153 SGB III's "pauschaliertes
 * Nettoentgelt" (Leistungsentgelt), not a flat percentage of take-home pay:
 * 1. Cap gross monthly salary at the RV/ALV Beitragsbemessungsgrenze —
 *    salary above the ceiling doesn't increase the benefit.
 * 2. Deduct the statutory 20% Sozialversicherungspauschale.
 * 3. Deduct a *notional* Lohnsteuer + Soli on what's left, computed as if
 *    under Steuerklasse I — regardless of the claimant's real tax class.
 *    This reuses the same wage-tax engine as ordinary payroll
 *    (calculateIncomeTaxForClass/calculateSoli), just always at class I,
 *    since the Bundesagentur's own Leistungsgruppen A–F system (which this
 *    app doesn't model) approximates to class I for the common case. The
 *    one remaining simplification versus the real LStDV table.
 * 4. The result ("Leistungsentgelt") × 60% (67% with a qualifying child) is
 *    the monthly benefit.
 */
export function alg1MonthlyNet(
  lastGrossMonthlySalary: number,
  hasChildren: boolean,
  year: number
): number {
  const taxParams = getTaxYearParameters(year);
  const algParams = getUnemploymentBenefitYearParameters(year);

  const cappedGrossAnnual =
    Math.min(lastGrossMonthlySalary, taxParams.socialInsurance.pensionUnemploymentCeilingMonthly) * 12;
  const svAllowanceAnnual = cappedGrossAnnual * algParams.socialInsurancePauschaleRate;
  const notionalTaxableIncome = Math.max(0, cappedGrossAnnual - svAllowanceAnnual);

  const notionalLohnsteuer = calculateIncomeTaxForClass(notionalTaxableIncome, 1, year);
  const notionalSoli = calculateSoli(notionalLohnsteuer, 1, year);

  const leistungsentgeltAnnual = notionalTaxableIncome - notionalLohnsteuer - notionalSoli;
  const leistungssatz = hasChildren
    ? algParams.leistungssatzWithChildren
    : algParams.leistungssatzStandard;

  return (leistungsentgeltAnnual / 12) * leistungssatz;
}
