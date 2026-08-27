"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const PensionDepositSchema = z.object({
  pension_deposit_default: z.coerce.number().min(0, { message: "Enter a non-negative amount." }),
});

/** Upserts the household's one settings row (see severance_global_settings'
 *  own migration comment) — every unoverridden package resolves against
 *  this, so it needs the same full-tree revalidation `updateGlobalPhase`
 *  and friends use, not just `/global-rules` itself. */
export async function updateGlobalPensionDepositDefault(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = PensionDepositSchema.safeParse({
    pension_deposit_default: formData.get("pension_deposit_default"),
  });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("severance_global_settings")
    .upsert(
      { user_id: user.id, pension_deposit_default: validated.data.pension_deposit_default },
      { onConflict: "user_id" }
    );
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return undefined;
}
