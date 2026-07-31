"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const NameSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required." }),
  description: z.string().trim().optional(),
});

export async function createLivingProfile(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = NameSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("living_profiles")
    .insert({
      user_id: user.id,
      name: validated.data.name,
      description: validated.data.description || null,
      is_baseline: false,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create profile." };

  revalidatePath("/", "layout");
  redirect(`/profiles/${data.id}`);
}

/** Duplicates an existing profile's commitments and income as a starting point. */
export async function cloneLivingProfile(
  sourceProfileId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = NameSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: newProfile, error: profileError } = await supabase
    .from("living_profiles")
    .insert({
      user_id: user.id,
      name: validated.data.name,
      description: validated.data.description || null,
      is_baseline: false,
    })
    .select("id")
    .single();

  if (profileError || !newProfile) {
    return { error: profileError?.message ?? "Could not create profile." };
  }

  const [{ data: commitments }, { data: income }] = await Promise.all([
    supabase
      .from("commitments")
      .select("id, name, category, amount, frequency, essential, start_date, end_date")
      .eq("profile_id", sourceProfileId),
    supabase
      .from("income")
      .select(
        "id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
      )
      .eq("profile_id", sourceProfileId),
  ]);

  if (commitments && commitments.length > 0) {
    const { data: cloned } = await supabase
      .from("commitments")
      .insert(
        commitments.map((c) => ({
          name: c.name,
          category: c.category,
          amount: c.amount,
          frequency: c.frequency,
          essential: c.essential,
          start_date: c.start_date,
          end_date: c.end_date,
          user_id: user.id,
          profile_id: newProfile.id,
        }))
      )
      .select("id");

    if (cloned) {
      const { data: splits } = await supabase
        .from("commitment_splits")
        .select("commitment_id, household_member_id, percentage")
        .in("commitment_id", commitments.map((c) => c.id));

      if (splits && splits.length > 0) {
        const oldToNewId = new Map(commitments.map((c, i) => [c.id, cloned[i]?.id]));
        const newSplits = splits
          .filter((s) => oldToNewId.get(s.commitment_id))
          .map((s) => ({
            user_id: user.id,
            commitment_id: oldToNewId.get(s.commitment_id)!,
            household_member_id: s.household_member_id,
            percentage: s.percentage,
          }));
        if (newSplits.length > 0) {
          await supabase.from("commitment_splits").insert(newSplits);
        }
      }
    }
  }
  if (income && income.length > 0) {
    const { data: clonedIncome } = await supabase
      .from("income")
      .insert(
        income.map((i) => ({
          name: i.name,
          gross_amount: i.gross_amount,
          type: i.type,
          frequency: i.frequency,
          start_date: i.start_date,
          end_date: i.end_date,
          tax_profile_id: i.tax_profile_id,
          christmas_bonus_pct: i.christmas_bonus_pct,
          holiday_pay_pct: i.holiday_pay_pct,
          annual_bonus: i.annual_bonus,
          bonus_distribution: i.bonus_distribution,
          annual_car_allowance: i.annual_car_allowance,
          monthly_pension_contribution: i.monthly_pension_contribution,
          monthly_company_car_cost: i.monthly_company_car_cost,
          rental_overhead_pct: i.rental_overhead_pct,
          currency: i.currency,
          exchange_rate_to_eur: i.exchange_rate_to_eur,
          user_id: user.id,
          profile_id: newProfile.id,
        }))
      )
      .select("id");

    if (clonedIncome) {
      const { data: incomeSplits } = await supabase
        .from("income_splits")
        .select("income_id, household_member_id, percentage")
        .in("income_id", income.map((i) => i.id));

      if (incomeSplits && incomeSplits.length > 0) {
        const oldToNewIncomeId = new Map(income.map((i, idx) => [i.id, clonedIncome[idx]?.id]));
        const newIncomeSplits = incomeSplits
          .filter((s) => oldToNewIncomeId.get(s.income_id))
          .map((s) => ({
            user_id: user.id,
            income_id: oldToNewIncomeId.get(s.income_id)!,
            household_member_id: s.household_member_id,
            percentage: s.percentage,
          }));
        if (newIncomeSplits.length > 0) {
          await supabase.from("income_splits").insert(newIncomeSplits);
        }
      }
    }
  }

  revalidatePath("/", "layout");
  redirect(`/profiles/${newProfile.id}`);
}

export async function updateLivingProfile(
  profileId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = NameSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("living_profiles")
    .update({ name: validated.data.name, description: validated.data.description || null })
    .eq("id", profileId);

  if (error) return { error: error.message };

  revalidatePath(`/profiles/${profileId}`);
  redirect(`/profiles/${profileId}`);
}

const LiquidSavingsSchema = z.object({
  current_liquid_savings: z.coerce.number().min(0, { message: "Must be zero or more." }),
});

/** Baseline-only (DESIGN v2 §2.5) — seeds the "do-nothing" overlay's
 *  starting balance. Not gated server-side on is_baseline since RLS already
 *  scopes the row to its owner and a non-baseline profile setting this is
 *  harmless (just unused — nothing reads it off a non-baseline row). */
export async function updateCurrentLiquidSavings(
  profileId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const raw = formData.get("current_liquid_savings");
  if (!raw) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("living_profiles")
      .update({ current_liquid_savings: null })
      .eq("id", profileId);
    if (error) return { error: error.message };
    revalidatePath(`/profiles/${profileId}`);
    return;
  }

  const validated = LiquidSavingsSchema.safeParse({ current_liquid_savings: raw });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("living_profiles")
    .update({ current_liquid_savings: validated.data.current_liquid_savings })
    .eq("id", profileId);

  if (error) return { error: error.message };

  revalidatePath(`/profiles/${profileId}`);
}

export async function deleteLivingProfile(profileId: string) {
  const supabase = await createClient();
  // RLS + the is_baseline check together prevent deleting the baseline profile.
  await supabase.from("living_profiles").delete().eq("id", profileId).eq("is_baseline", false);
  revalidatePath("/", "layout");
}
