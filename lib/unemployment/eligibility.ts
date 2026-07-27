import { getUnemploymentBenefitYearParameters } from "./parameters";

/**
 * ALG I benefit duration (§147 SGB III): looked up from the statutory
 * insured-months → duration table, extended by an age-graduated bonus when
 * both the claimant's age and insured time clear that bonus tier's own
 * threshold. Returns 0 when insuredMonths is below the lowest tier (no
 * entitlement) — mirrors this codebase's documented-simplification
 * convention (see lib/unemployment/parameters.ts header): insuredMonths is
 * expected to already reflect the "last 30 months" Rahmenfrist, not just
 * derived from years_of_service at the current employer.
 */
export function alg1DurationMonths(
  insuredMonths: number,
  ageAtClaim: number | null,
  year: number
): number {
  const params = getUnemploymentBenefitYearParameters(year);

  let duration = 0;
  for (const tier of params.durationTable) {
    if (insuredMonths >= tier.insuredMonths) duration = tier.durationMonths;
  }
  if (duration === 0) return 0;

  if (ageAtClaim != null) {
    for (const bonus of params.ageDurationBonuses) {
      if (ageAtClaim >= bonus.minAge && insuredMonths >= bonus.minInsuredMonths) {
        duration = Math.max(duration, bonus.durationMonths);
      }
    }
  }

  return duration;
}
