"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";

const IncomeSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Name is required." }),
    household_member_id: z.string().trim().min(1, { message: "Select a household member." }),
    gross_amount: z.coerce.number().positive({ message: "Amount must be greater than 0." }),
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
  })
  .refine(
    (data) => !data.start_date || !data.end_date || data.end_date >= data.start_date,
    { message: "End date must be on or after the start date.", path: ["end_date"] }
  );

export type FormState = { error?: string } | undefined;

function parseIncomeForm(formData: FormData) {
  return IncomeSchema.safeParse({
    name: formData.get("name"),
    household_member_id: formData.get("household_member_id"),
    gross_amount: formData.get("gross_amount"),
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const profileId =
    (formData.get("profile_id") as string | null) || (await getBaselineProfileId(supabase));
  const redirectTo = (formData.get("redirect_to") as string | null) || "/income";

  const { error } = await supabase.from("income").insert({
    ...validated.data,
    start_date: validated.data.start_date || null,
    end_date: validated.data.end_date || null,
    user_id: user.id,
    profile_id: profileId,
  });

  if (error) return { error: error.message };

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

  const supabase = await createClient();
  const { error } = await supabase
    .from("income")
    .update({
      ...validated.data,
      start_date: validated.data.start_date || null,
      end_date: validated.data.end_date || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/income");
  redirect("/income");
}

export async function deleteIncome(id: string, revalidateTarget = "/income") {
  const supabase = await createClient();
  await supabase.from("income").delete().eq("id", id);
  revalidatePath("/income");
  revalidatePath(revalidateTarget);
}
