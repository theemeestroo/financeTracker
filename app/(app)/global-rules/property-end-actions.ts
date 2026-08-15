"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const GlobalPropertyEndSchema = z.object({
  property_id: z.string().trim().min(1, { message: "Select a property." }),
  end_date: z.string().min(1, { message: "End date is required." }),
});

function parseGlobalPropertyEndForm(formData: FormData) {
  return GlobalPropertyEndSchema.safeParse({
    property_id: formData.get("property_id"),
    end_date: formData.get("end_date"),
  });
}

export async function addGlobalPropertyEnd(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = parseGlobalPropertyEndForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // A property can only have one global end declaration — see
  // `addScenarioPropertyEnd`'s own comment for why.
  const { data: existing } = await supabase
    .from("severance_scenario_property_ends")
    .select("id")
    .eq("scope", "global")
    .eq("property_id", data.property_id)
    .maybeSingle();
  if (existing) {
    return { error: "This property already has a global end date — edit it below instead." };
  }

  const { error } = await supabase.from("severance_scenario_property_ends").insert({
    user_id: user.id,
    scope: "global",
    scenario_id: null,
    property_id: data.property_id,
    end_date: data.end_date,
  });
  if (error) return { error: error.message };

  revalidatePath("/global-rules");
  return undefined;
}

/** Edits the single shared object in place — propagates immediately to
 *  every scenario referencing it, so every scenario page needs busting, not
 *  just the Global list (same reasoning as `updateGlobalEvent`). */
export async function updateGlobalPropertyEnd(
  propertyEndId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseGlobalPropertyEndForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("severance_scenario_property_ends")
    .update({
      property_id: data.property_id,
      end_date: data.end_date,
    })
    .eq("id", propertyEndId)
    .eq("scope", "global");
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return undefined;
}

/** Deletes the global property-end; its per-scenario overrides aren't
 *  deleted automatically — they're flagged for review (snapshotted here
 *  just before the delete, since the FK nulls the reference out once it's
 *  gone), same as `deleteGlobalEvent`. */
export async function deleteGlobalPropertyEnd(propertyEndId: string) {
  const supabase = await createClient();

  const { data: propertyEndRow } = await supabase
    .from("severance_scenario_property_ends")
    .select("property_id")
    .eq("id", propertyEndId)
    .single();

  if (propertyEndRow) {
    const { data: propertyRow } = await supabase
      .from("properties")
      .select("name")
      .eq("id", propertyEndRow.property_id)
      .single();
    await supabase
      .from("severance_global_property_end_overrides")
      .update({ stale_since: new Date().toISOString(), orphaned_item_name: propertyRow?.name ?? null })
      .eq("global_property_end_id", propertyEndId);
  }

  await supabase.from("severance_scenario_property_ends").delete().eq("id", propertyEndId).eq("scope", "global");
  revalidatePath("/", "layout");
}
