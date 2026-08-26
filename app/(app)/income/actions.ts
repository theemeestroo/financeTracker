"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";

const IncomeSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Name is required." }),
    gross_amount: z.coerce.number().positive({ message: "Amount must be greater than 0." }),
    currency: z.enum(["EUR", "GBP"]),
    // Only shown (and editable) in the form when currency isn't EUR — an
    // EUR row is always exactly 1, no conversion to apply.
    exchange_rate_to_eur: z.coerce.number().positive({ message: "Exchange rate must be greater than 0." }),
    type: z.enum(["salary", "part_time", "rental", "other"]),
    frequency: z.enum(["monthly", "quarterly", "annual"]),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    // Salary-only components — the form only renders these inputs when
    // type is "salary", so absent/blank always means "not applicable",
    // never "unset", hence the plain 0 fallback in parseIncomeForm below.
    christmas_bonus_pct: z.coerce.number().min(0).max(300),
    holiday_pay_pct: z.coerce.number().min(0).max(300),
    annual_bonus: z.coerce.number().min(0),
    bonus_distribution: z.enum(["one_time", "spread"]),
    annual_car_allowance: z.coerce.number().min(0),
    monthly_pension_contribution: z.coerce.number().min(0),
    monthly_company_car_cost: z.coerce.number().min(0),
    // Rental-only — the form only renders this input when type is
    // "rental", so absent/blank means "not applicable" (0), same as the
    // salary-only fields above.
    rental_overhead_pct: z.coerce.number().min(0).max(100),
  })
  .refine(
    (data) => !data.start_date || !data.end_date || data.end_date >= data.start_date,
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
  incomeId: string,
  splits: { household_member_id: string; percentage: number }[]
) {
  await supabase.from("income_splits").delete().eq("income_id", incomeId);
  if (splits.length > 0) {
    await supabase.from("income_splits").insert(
      splits.map((s) => ({
        user_id: userId,
        income_id: incomeId,
        household_member_id: s.household_member_id,
        percentage: s.percentage,
      }))
    );
  }
}

function parseIncomeForm(formData: FormData) {
  return IncomeSchema.safeParse({
    name: formData.get("name"),
    gross_amount: formData.get("gross_amount"),
    currency: formData.get("currency") || "EUR",
    exchange_rate_to_eur: formData.get("exchange_rate_to_eur") || 1,
    type: formData.get("type"),
    frequency: formData.get("frequency"),
    start_date: formData.get("start_date") || undefined,
    end_date: formData.get("end_date") || undefined,
    christmas_bonus_pct: formData.get("christmas_bonus_pct") || 0,
    holiday_pay_pct: formData.get("holiday_pay_pct") || 0,
    annual_bonus: formData.get("annual_bonus") || 0,
    bonus_distribution: formData.get("bonus_distribution") || "one_time",
    annual_car_allowance: formData.get("annual_car_allowance") || 0,
    monthly_pension_contribution: formData.get("monthly_pension_contribution") || 0,
    monthly_company_car_cost: formData.get("monthly_company_car_cost") || 0,
    rental_overhead_pct: formData.get("rental_overhead_pct") || 0,
  });
}

export async function createIncome(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseIncomeForm(formData);
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

  const profileId =
    (formData.get("profile_id") as string | null) || (await getBaselineProfileId(supabase));
  const redirectTo = (formData.get("redirect_to") as string | null) || "/income";

  const { data: income, error } = await supabase
    .from("income")
    .insert({
      ...validated.data,
      start_date: validated.data.start_date || null,
      end_date: validated.data.end_date || null,
      user_id: user.id,
      profile_id: profileId,
    })
    .select("id")
    .single();

  if (error || !income) return { error: error?.message ?? "Could not create income." };

  await replaceSplits(supabase, user.id, income.id, splits);

  revalidatePath("/income");
  revalidatePath(redirectTo);
  redirect(redirectTo);
}

export async function updateIncome(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseIncomeForm(formData);
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

  const { error } = await supabase
    .from("income")
    .update({
      ...validated.data,
      start_date: validated.data.start_date || null,
      end_date: validated.data.end_date || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await replaceSplits(supabase, user.id, id, splits);

  revalidatePath("/income");
  redirect("/income");
}

const AdjustAmountSchema = z.object({
  gross_amount: z.coerce.number().positive({ message: "Amount must be greater than 0." }),
});

/** Adjusts just an income row's gross amount — the profile detail page's
 *  control for moving a cloned row's value up/down from the
 *  `baseline_gross_amount` it was cloned at, without touching any of its
 *  other fields. */
export async function adjustIncomeAmount(
  id: string,
  revalidateTarget: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = AdjustAmountSchema.safeParse({ gross_amount: formData.get("gross_amount") });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("income")
    .update({ gross_amount: validated.data.gross_amount })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/income");
  revalidatePath(revalidateTarget);
}

export async function deleteIncome(id: string, revalidateTarget = "/income") {
  const supabase = await createClient();
  await supabase.from("income").delete().eq("id", id);
  revalidatePath("/income");
  revalidatePath(revalidateTarget);
}
