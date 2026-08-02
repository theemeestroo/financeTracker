import { getTaxYearParameters } from "@/lib/tax";
import { getUnemploymentBenefitYearParameters } from "./parameters";
import type { TaxProfile } from "@/lib/types";

/**
 * Which health-insurance cost regime applies for a given month of a
 * severance scenario. "employed" (still on payroll or garden leave) is
 * correctly priced inside calculateNetIncome/calculateSocialContributions
 * for GKV (a real percentage-of-income deduction) — but *not* for PKV,
 * which calculateSocialContributions deliberately charges nothing (its own
 * comment explains why: the employer subsidy already shows up as extra net
 * pay, and a fixed premium doesn't belong in a payroll-percentage
 * calculation). That gap is real money a PKV household still pays every
 * month of ordinary employment, not just after it ends — it's costed by
 * `lib/finance/health-insurance-outgoing.ts` as a synthesized commitment
 * instead of a third regime here, since "employed" isn't a scenario-only
 * concept (the Overview dashboard needs the exact same cost with no
 * severance scenario in sight). Only the two states that exist *because*
 * employment ended are modeled in this file.
 */
export type HealthInsuranceRegime = "gap" | "alg1";

/**
 * Post-severance monthly health-insurance outflow — a real cost the runway
 * projection has no other way to see, since nothing charges anything once
 * salary income stops (see DESIGN-financial-runway-app-v2.md §2.2).
 *
 * GKV (statutory): "gap" prices voluntary ("freiwillige") continuation off
 * the statutory minimum income base, at the *full* combined rate (no
 * employer to halve it, unlike calculateSocialContributions); "alg1" is €0
 * — the Bundesagentur pays it in full while a claim is active.
 *
 * PKV (private): "gap" is the full unsubsidized premium; "alg1" is the
 * premium minus the Bundesagentur's capped subsidy (Zuschuss), floored at 0.
 */
export function monthlyHealthInsuranceCost(
  profile: Pick<
    TaxProfile,
    "statutory_health_insurance" | "has_children" | "health_insurance_addon_rate" | "private_health_insurance_monthly_premium"
  >,
  regime: HealthInsuranceRegime,
  year: number
): number {
  if (profile.statutory_health_insurance) {
    if (regime === "alg1") return 0;

    const taxParams = getTaxYearParameters(year).socialInsurance;
    const base = getUnemploymentBenefitYearParameters(year).voluntaryGkvMinimumMonthlyBase;
    const addOnRate = profile.health_insurance_addon_rate ?? taxParams.healthAvgAddOnRate;
    const health = base * (taxParams.healthBaseRate + addOnRate);
    const care =
      base * taxParams.careRate + (profile.has_children ? 0 : base * taxParams.careChildlessSurcharge);
    return health + care;
  }

  const premium = profile.private_health_insurance_monthly_premium ?? 0;
  if (regime === "gap") return premium;

  const ceiling = getUnemploymentBenefitYearParameters(year).pkvSubsidyCeilingMonthly;
  return Math.max(0, premium - ceiling);
}
