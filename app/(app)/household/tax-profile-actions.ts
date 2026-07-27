"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const TaxProfileSchema = z.object({
  tax_class: z.coerce.number().int().min(1).max(6),
  church_tax: z.boolean(),
  church_tax_state: z.string().trim().optional(),
  has_children: z.boolean(),
});

export type FormState = { error?: string } | undefined;

export async function upsertTaxProfile(
  householdMemberId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = TaxProfileSchema.safeParse({
    tax_class: formData.get("tax_class"),
    church_tax: formData.get("church_tax") === "on",
    church_tax_state: formData.get("church_tax_state") || undefined,
    has_children: formData.get("has_children") === "on",
  });

  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("tax_profiles").upsert(
    {
      user_id: user.id,
      household_member_id: householdMemberId,
      tax_class: validated.data.tax_class,
      church_tax: validated.data.church_tax,
      church_tax_state: validated.data.church_tax ? validated.data.church_tax_state || null : null,
      has_children: validated.data.has_children,
    },
    { onConflict: "household_member_id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/household");
  revalidatePath("/income");
  revalidatePath("/");
  redirect("/household");
}
