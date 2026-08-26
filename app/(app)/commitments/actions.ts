"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";

const CommitmentSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Name is required." }),
    category: z.enum([
      "housing",
      "utilities",
      "insurance",
      "subscriptions",
      "debt_loans",
      "transport",
      "childcare_education",
      "healthcare",
      "groceries_living",
      "leisure_discretionary",
      "savings_investment",
      "one_off",
      "other",
    ]),
    amount: z.coerce.number().positive({ message: "Amount must be greater than 0." }),
    frequency: z.enum(["monthly", "quarterly", "annual", "one_off"]),
    essential: z.boolean(),
    start_date: z.string().min(1, { message: "Start date is required." }),
    end_date: z.string().optional(),
    property_id: z.string().optional(),
  })
  .refine(
    (data) => !data.end_date || data.end_date >= data.start_date,
    { message: "End date must be on or after the start date.", path: ["end_date"] }
  );

export type FormState = { error?: string } | undefined;

const SPLIT_FIELD = /^splits\[(.+)\]$/;

/** Reads `splits[<memberId>]` percentage fields off the form. */
function parseSplits(formData: FormData): { household_member_id: string; percentage: number }[] {
  const splits: { household_member_id: string; percentage: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const match = key.match(SPLIT_FIELD);
    if (!match) continue;
    const percentage = Number(value);
    if (percentage > 0) splits.push({ household_member_id: match[1], percentage });
  }
  // A single link is always fully attributed, regardless of what was submitted.
  if (splits.length === 1) splits[0].percentage = 100;
  return splits;
}

function validateSplits(splits: { percentage: number }[]): string | null {
  if (splits.length < 2) return null;
  const total = splits.reduce((sum, s) => sum + s.percentage, 0);
  if (Math.abs(total - 100) > 0.5) {
    return `The split must add up to 100% (currently ${total}%).`;
  }
  return null;
}

async function replaceSplits(
  supabase: SupabaseClient,
  userId: string,
  commitmentId: string,
  splits: { household_member_id: string; percentage: number }[]
) {
  await supabase.from("commitment_splits").delete().eq("commitment_id", commitmentId);
  if (splits.length > 0) {
    await supabase.from("commitment_splits").insert(
      splits.map((s) => ({
        user_id: userId,
        commitment_id: commitmentId,
        household_member_id: s.household_member_id,
        percentage: s.percentage,
      }))
    );
  }
}

function parseCommitmentForm(formData: FormData) {
  return CommitmentSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    frequency: formData.get("frequency"),
    essential: formData.get("essential") === "on",
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date") || undefined,
    property_id: formData.get("property_id") || undefined,
  });
}

export async function createCommitment(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseCommitmentForm(formData);
  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const splits = parseSplits(formData);
  const splitError = validateSplits(splits);
  if (splitError) return { error: splitError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // A hidden `profile_id` field lets this same action serve an alternate
  // Living Profile's commitments editor (Phase 5); the top-level
  // Commitments page omits it, so it defaults to the baseline profile.
  const profileId =
    (formData.get("profile_id") as string | null) || (await getBaselineProfileId(supabase));
  const redirectTo = (formData.get("redirect_to") as string | null) || "/commitments";

  const { data: commitment, error } = await supabase
    .from("commitments")
    .insert({
      ...validated.data,
      user_id: user.id,
      profile_id: profileId,
      end_date: validated.data.frequency === "one_off" ? null : validated.data.end_date || null,
      property_id: validated.data.property_id || null,
    })
    .select("id")
    .single();

  if (error || !commitment) return { error: error?.message ?? "Could not create commitment." };

  await replaceSplits(supabase, user.id, commitment.id, splits);

  revalidatePath("/commitments");
  revalidatePath(redirectTo);
  redirect(redirectTo);
}

export async function updateCommitment(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseCommitmentForm(formData);
  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const splits = parseSplits(formData);
  const splitError = validateSplits(splits);
  if (splitError) return { error: splitError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const redirectTo = (formData.get("redirect_to") as string | null) || "/commitments";

  const { error } = await supabase
    .from("commitments")
    .update({
      ...validated.data,
      end_date: validated.data.frequency === "one_off" ? null : validated.data.end_date || null,
      property_id: validated.data.property_id || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await replaceSplits(supabase, user.id, id, splits);

  revalidatePath("/commitments");
  revalidatePath(redirectTo);
  redirect(redirectTo);
}

const AdjustAmountSchema = z.object({
  amount: z.coerce.number().positive({ message: "Amount must be greater than 0." }),
});

/** Adjusts just a commitment's amount — the profile detail page's control for
 *  moving a cloned row's value up/down from the `baseline_amount` it was
 *  cloned at, without touching any of its other fields. */
export async function adjustCommitmentAmount(
  id: string,
  revalidateTarget: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = AdjustAmountSchema.safeParse({ amount: formData.get("amount") });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("commitments")
    .update({ amount: validated.data.amount })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/commitments");
  revalidatePath(revalidateTarget);
}

export async function deleteCommitment(id: string, revalidateTarget = "/commitments") {
  const supabase = await createClient();
  await supabase.from("commitments").delete().eq("id", id);
  revalidatePath("/commitments");
  revalidatePath(revalidateTarget);
}

/** Bulk-removes every commitment linked to one property within one profile —
 *  the Living Profile detail page's "Delete all" action on a property's
 *  group header. `profile_id` is redundant with `property_id` alone (a
 *  property already belongs to exactly one profile) but kept as an explicit
 *  safety scope. */
export async function deleteCommitmentsByProperty(
  propertyId: string,
  profileId: string,
  revalidateTarget = "/commitments"
) {
  const supabase = await createClient();
  await supabase.from("commitments").delete().eq("property_id", propertyId).eq("profile_id", profileId);
  revalidatePath("/commitments");
  revalidatePath(revalidateTarget);
}
