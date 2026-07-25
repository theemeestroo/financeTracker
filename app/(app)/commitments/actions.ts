"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
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
    ownership: z.enum(["shared", "individual"]),
    household_member_id: z.string().trim().optional(),
    start_date: z.string().min(1, { message: "Start date is required." }),
    end_date: z.string().optional(),
  })
  .refine(
    (data) => data.ownership === "shared" || !!data.household_member_id,
    {
      message: "Select a household member for an individual commitment.",
      path: ["household_member_id"],
    }
  )
  .refine(
    (data) => !data.end_date || data.end_date >= data.start_date,
    { message: "End date must be on or after the start date.", path: ["end_date"] }
  );

export type FormState = { error?: string } | undefined;

function parseCommitmentForm(formData: FormData) {
  return CommitmentSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    frequency: formData.get("frequency"),
    essential: formData.get("essential") === "on",
    ownership: formData.get("ownership"),
    household_member_id: formData.get("household_member_id") || undefined,
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date") || undefined,
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const profileId = await getBaselineProfileId(supabase);
  const { ownership, household_member_id, ...rest } = validated.data;

  const { error } = await supabase.from("commitments").insert({
    ...rest,
    ownership,
    household_member_id: ownership === "individual" ? household_member_id : null,
    user_id: user.id,
    profile_id: profileId,
    end_date: validated.data.frequency === "one_off" ? null : validated.data.end_date || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/commitments");
  redirect("/commitments");
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

  const supabase = await createClient();
  const { ownership, household_member_id, ...rest } = validated.data;

  const { error } = await supabase
    .from("commitments")
    .update({
      ...rest,
      ownership,
      household_member_id: ownership === "individual" ? household_member_id : null,
      end_date: validated.data.frequency === "one_off" ? null : validated.data.end_date || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/commitments");
  redirect("/commitments");
}

export async function deleteCommitment(id: string) {
  const supabase = await createClient();
  await supabase.from("commitments").delete().eq("id", id);
  revalidatePath("/commitments");
}
