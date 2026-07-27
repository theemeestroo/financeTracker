"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const HouseholdMemberSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required." }),
  date_of_birth: z.string().trim().optional(),
  statutory_health_insurance: z.boolean(),
  health_insurance_addon_rate: z.string().optional(),
  private_health_insurance_monthly_premium: z.coerce.number().min(0).optional(),
});

export type FormState = { error?: string } | undefined;

function parseHouseholdMemberForm(formData: FormData) {
  return HouseholdMemberSchema.safeParse({
    name: formData.get("name"),
    date_of_birth: formData.get("date_of_birth") || undefined,
    statutory_health_insurance: formData.get("statutory_health_insurance") === "on",
    health_insurance_addon_rate: formData.get("health_insurance_addon_rate") || undefined,
    private_health_insurance_monthly_premium:
      formData.get("private_health_insurance_monthly_premium") || undefined,
  });
}

function toRow(data: z.infer<typeof HouseholdMemberSchema>) {
  const addOnRatePct = data.health_insurance_addon_rate ? Number(data.health_insurance_addon_rate) : null;
  return {
    name: data.name,
    date_of_birth: data.date_of_birth ?? null,
    statutory_health_insurance: data.statutory_health_insurance,
    health_insurance_addon_rate: addOnRatePct !== null ? addOnRatePct / 100 : null,
    private_health_insurance_monthly_premium: data.statutory_health_insurance
      ? null
      : (data.private_health_insurance_monthly_premium ?? null),
  };
}

export async function createHouseholdMember(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseHouseholdMemberForm(formData);
  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("household_members").insert({
    user_id: user.id,
    ...toRow(validated.data),
  });

  if (error) return { error: error.message };

  revalidatePath("/household");
  redirect("/household");
}

export async function updateHouseholdMember(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseHouseholdMemberForm(formData);
  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("household_members")
    .update(toRow(validated.data))
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/household");
  redirect("/household");
}

export async function deleteHouseholdMember(id: string) {
  const supabase = await createClient();
  await supabase.from("household_members").delete().eq("id", id);
  revalidatePath("/household");
}
