"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const HouseholdMemberSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required." }),
});

export type FormState = { error?: string } | undefined;

export async function createHouseholdMember(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = HouseholdMemberSchema.safeParse({
    name: formData.get("name"),
  });
  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("household_members")
    .insert({ user_id: user.id, name: validated.data.name });

  if (error) return { error: error.message };

  revalidatePath("/household");
  redirect("/household");
}

export async function updateHouseholdMember(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = HouseholdMemberSchema.safeParse({
    name: formData.get("name"),
  });
  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("household_members")
    .update({ name: validated.data.name })
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
