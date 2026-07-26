"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";

const PropertySchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required." }),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  end_date: z.string().optional(),
});

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
  propertyId: string,
  splits: { household_member_id: string; percentage: number }[]
) {
  await supabase.from("property_splits").delete().eq("property_id", propertyId);
  if (splits.length > 0) {
    await supabase.from("property_splits").insert(
      splits.map((s) => ({
        user_id: userId,
        property_id: propertyId,
        household_member_id: s.household_member_id,
        percentage: s.percentage,
      }))
    );
  }
}

function parsePropertyForm(formData: FormData) {
  return PropertySchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    notes: formData.get("notes") || undefined,
    end_date: formData.get("end_date") || undefined,
  });
}

export async function createProperty(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parsePropertyForm(formData);
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
  const redirectTo = (formData.get("redirect_to") as string | null) || "/properties";

  const { data: property, error } = await supabase
    .from("properties")
    .insert({
      name: validated.data.name,
      address: validated.data.address || null,
      notes: validated.data.notes || null,
      end_date: validated.data.end_date || null,
      user_id: user.id,
      profile_id: profileId,
    })
    .select("id")
    .single();

  if (error || !property) return { error: error?.message ?? "Could not create property." };

  await replaceSplits(supabase, user.id, property.id, splits);

  revalidatePath("/properties");
  revalidatePath(redirectTo);
  redirect(redirectTo);
}

export async function updateProperty(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parsePropertyForm(formData);
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

  const redirectTo = (formData.get("redirect_to") as string | null) || "/properties";

  const { error } = await supabase
    .from("properties")
    .update({
      name: validated.data.name,
      address: validated.data.address || null,
      notes: validated.data.notes || null,
      end_date: validated.data.end_date || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await replaceSplits(supabase, user.id, id, splits);

  revalidatePath("/properties");
  revalidatePath(redirectTo);
  redirect(redirectTo);
}

export async function deleteProperty(id: string, revalidateTarget = "/properties") {
  const supabase = await createClient();
  await supabase.from("properties").delete().eq("id", id);
  revalidatePath("/properties");
  revalidatePath(revalidateTarget);
  revalidatePath("/commitments");
}
