import { getTaxYearParameters } from "./parameters";
import type { TaxProfile } from "@/lib/types";

export type SocialContributions = {
  pension: number;
  unemployment: number;
  health: number;
  care: number;
  total: number;
};

/**
 * Employee-side statutory social insurance contributions on a monthly gross
 * amount, capped at each contribution's Beitragsbemessungsgrenze.
 *
 * Privately insured members (statutory_health_insurance = false) are modeled
 * with health/care contributions at 0 here — private premiums are a fixed
 * monthly cost, not a percentage of income, and belong in `commitments`
 * rather than the tax engine.
 */
export function calculateSocialContributions(
  grossMonthly: number,
  profile: Pick<
    TaxProfile,
    "statutory_health_insurance" | "has_children" | "health_insurance_addon_rate"
  >,
  year: number
): SocialContributions {
  const p = getTaxYearParameters(year).socialInsurance;

  const rvAlvBase = Math.min(grossMonthly, p.pensionUnemploymentCeilingMonthly);
  const pension = rvAlvBase * (p.pensionRate / 2);
  const unemployment = rvAlvBase * (p.unemploymentRate / 2);

  let health = 0;
  let care = 0;

  if (profile.statutory_health_insurance) {
    const kvPvBase = Math.min(grossMonthly, p.healthCareCeilingMonthly);
    const addOnRate = profile.health_insurance_addon_rate ?? p.healthAvgAddOnRate;
    health = kvPvBase * (p.healthBaseRate / 2 + addOnRate / 2);
    care = kvPvBase * (p.careRate / 2);
    if (!profile.has_children) {
      care += kvPvBase * p.careChildlessSurcharge;
    }
  }

  return {
    pension,
    unemployment,
    health,
    care,
    total: pension + unemployment + health + care,
  };
}
