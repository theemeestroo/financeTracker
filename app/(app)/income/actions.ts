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

  const profileId = await getBaselineProfileId(supabase);

  const { error } = await supabase.from("income").insert({
    ...validated.data,
    start_date: validated.data.start_date || null,
    end_date: validated.data.end_date || null,
    user_id: user.id,
    profile_id: profileId,
  });

  if (error) return { error: error.message };

  revalidatePath("/income");
  redirect("/income");
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

export async function deleteIncome(id: string) {
  const supabase = await createClient();
  await supabase.from("income").delete().eq("id", id);
  revalidatePath("/income");
}
