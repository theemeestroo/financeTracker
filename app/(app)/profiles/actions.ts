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
        "household_member_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost"
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
    await supabase.from("income").insert(
      income.map((i) => ({ ...i, user_id: user.id, profile_id: newProfile.id }))
    );
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

export async function deleteLivingProfile(profileId: string) {
  const supabase = await createClient();
  // RLS + the is_baseline check together prevent deleting the baseline profile.
  await supabase.from("living_profiles").delete().eq("id", profileId).eq("is_baseline", false);
  revalidatePath("/", "layout");
}
