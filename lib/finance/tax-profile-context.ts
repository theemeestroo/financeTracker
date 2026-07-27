import type { HouseholdMember, TaxProfile, TaxProfileRow } from "@/lib/types";

/**
 * Joins a raw `tax_profiles` row with its household member's health-insurance
 * fields into the calc-ready `TaxProfile` shape every `lib/tax`/`lib/finance`/
 * `lib/runway` consumer expects. The join point for the health-insurance
 * move — `statutory_health_insurance`/etc. live on `HouseholdMember` now, not
 * `tax_profiles` — so this is where the two tables come back together.
 * `member` missing (deleted/not yet loaded) falls back to the same
 * statutory-GKV default the column itself defaults to.
 */
export function toTaxProfile(row: TaxProfileRow, member: HouseholdMember | undefined): TaxProfile {
  return {
    ...row,
    statutory_health_insurance: member?.statutory_health_insurance ?? true,
    health_insurance_addon_rate: member?.health_insurance_addon_rate ?? null,
    private_health_insurance_monthly_premium: member?.private_health_insurance_monthly_premium ?? null,
  };
}
