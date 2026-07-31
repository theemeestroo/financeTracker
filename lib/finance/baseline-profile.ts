import { SupabaseClient } from "@supabase/supabase-js";
import { activeCommitments, activeIncome, todayISO, totalMonthlyCommitments, totalMonthlyNetIncome } from "./dashboard";
import { getCurrentTaxYear } from "@/lib/tax";
import { toTaxProfile } from "./tax-profile-context";
import type { Commitment, HouseholdMember, Income, IncomeSplit, TaxProfileRow } from "@/lib/types";

// Every user gets exactly one baseline Living Profile via the
// handle_new_user() trigger (supabase/migrations). Commitments/income
// created from the top-level pages always attach to it.
export async function getBaselineProfile(
  supabase: SupabaseClient
): Promise<{ id: string; name: string; current_liquid_savings: number | null }> {
  const { data, error } = await supabase
    .from("living_profiles")
    .select("id, name, current_liquid_savings")
    .eq("is_baseline", true)
    .single();

  if (error || !data) {
    throw new Error("Baseline living profile not found for user.");
  }

  return data;
}

export async function getBaselineProfileId(supabase: SupabaseClient): Promise<string> {
  return (await getBaselineProfile(supabase)).id;
}

export type BaselineRunwayInputs = {
  /** Null when the household hasn't set a figure yet — callers should skip
   *  the "do-nothing" overlay entirely rather than assume 0. */
  currentLiquidSavings: number | null;
  /** Today's net monthly surplus (positive) or deficit (negative), from the
   *  baseline profile's own active commitments/income — the same figure the
   *  Overview dashboard shows, computed independently of any severance
   *  scenario (DESIGN v2 §2.5). */
  monthlySurplus: number;
};

/**
 * Feeds the "do-nothing" reference line (DESIGN v2 §2.5): a starting balance
 * plus today's ongoing burn/surplus rate, both sourced from the baseline
 * Living Profile rather than any one scenario — the same household
 * situation regardless of which scenario/comparison it's overlaid on.
 */
export async function getBaselineRunwayInputs(supabase: SupabaseClient): Promise<BaselineRunwayInputs> {
  const baseline = await getBaselineProfile(supabase);
  const onDate = todayISO();

  const [{ data: commitments }, { data: income }, { data: members }, { data: taxProfiles }] =
    await Promise.all([
      supabase
        .from("commitments")
        .select("id, profile_id, name, category, amount, frequency, essential, start_date, end_date")
        .eq("profile_id", baseline.id),
      supabase
        .from("income")
        .select(
          "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
        )
        .eq("profile_id", baseline.id),
      supabase
        .from("household_members")
        .select(
          "id, name, created_at, date_of_birth, statutory_health_insurance, health_insurance_addon_rate, private_health_insurance_monthly_premium"
        ),
      supabase
        .from("tax_profiles")
        .select("id, household_member_id, tax_class, church_tax, church_tax_state, has_children"),
    ]);

  const allIncome = (income ?? []) as Income[];
  const memberById = new Map(((members ?? []) as HouseholdMember[]).map((m) => [m.id, m]));
  const taxProfileByMember = new Map(
    ((taxProfiles ?? []) as TaxProfileRow[]).map((row) => [
      row.household_member_id,
      toTaxProfile(row, memberById.get(row.household_member_id)),
    ])
  );

  const { data: incomeSplitRows } = await supabase
    .from("income_splits")
    .select("id, income_id, household_member_id, percentage")
    .in("income_id", allIncome.map((i) => i.id));
  const splitsByIncome = new Map<string, IncomeSplit[]>();
  for (const s of (incomeSplitRows ?? []) as IncomeSplit[]) {
    splitsByIncome.set(s.income_id, [...(splitsByIncome.get(s.income_id) ?? []), s]);
  }

  const monthlyCommitments = totalMonthlyCommitments(
    activeCommitments((commitments ?? []) as Commitment[], onDate)
  );
  const { netMonthly: monthlyNetIncome } = totalMonthlyNetIncome(
    activeIncome(allIncome, onDate),
    splitsByIncome,
    taxProfileByMember,
    getCurrentTaxYear()
  );

  return {
    currentLiquidSavings: baseline.current_liquid_savings,
    monthlySurplus: monthlyNetIncome - monthlyCommitments,
  };
}
