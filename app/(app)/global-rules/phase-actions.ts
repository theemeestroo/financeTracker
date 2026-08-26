"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const GlobalPhaseSchema = z.object({
  profile_id: z.string().trim().min(1, { message: "Select a Living Profile." }),
  start_date: z.string().min(1, { message: "Start date is required." }),
  label: z.string().trim().optional(),
});

function parseGlobalPhaseForm(formData: FormData) {
  return GlobalPhaseSchema.safeParse({
    profile_id: formData.get("profile_id"),
    start_date: formData.get("start_date"),
    label: formData.get("label") || undefined,
  });
}

/** No duplicate-rejection check, unlike `addGlobalPropertyEnd` — a phase has
 *  no natural per-scenario identity to collide on; a timeline can have
 *  arbitrarily many global phases. */
export async function addGlobalPhase(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = parseGlobalPhaseForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_scenario_phases").insert({
    user_id: user.id,
    scope: "global",
    scenario_id: null,
    profile_id: data.profile_id,
    start_date: data.start_date,
    label: data.label || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/global-rules");
  return undefined;
}

/** Edits the single shared object in place — propagates immediately to
 *  every scenario referencing it, so every scenario page needs busting, not
 *  just the Global list (same reasoning as `updateGlobalPropertyEnd`). */
export async function updateGlobalPhase(
  phaseId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseGlobalPhaseForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("severance_scenario_phases")
    .update({
      profile_id: data.profile_id,
      start_date: data.start_date,
      label: data.label || null,
    })
    .eq("id", phaseId)
    .eq("scope", "global");
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return undefined;
}

/** Deletes the global phase; its per-scenario overrides aren't deleted
 *  automatically — they're flagged for review (snapshotted here just before
 *  the delete, since the FK nulls the reference out once it's gone), same as
 *  `deleteGlobalPropertyEnd`. Phases have no independent name field, so the
 *  snapshot uses the profile's name (plus the phase's own label, if set). */
export async function deleteGlobalPhase(phaseId: string) {
  const supabase = await createClient();

  const { data: phaseRow } = await supabase
    .from("severance_scenario_phases")
    .select("profile_id, label")
    .eq("id", phaseId)
    .single();

  if (phaseRow) {
    const { data: profileRow } = await supabase
      .from("living_profiles")
      .select("name")
      .eq("id", phaseRow.profile_id)
      .single();
    const profileName = profileRow?.name ?? "Living Profile";
    await supabase
      .from("severance_global_phase_overrides")
      .update({
        stale_since: new Date().toISOString(),
        orphaned_item_name: phaseRow.label ? `${profileName} — ${phaseRow.label}` : profileName,
      })
      .eq("global_phase_id", phaseId);
  }

  await supabase.from("severance_scenario_phases").delete().eq("id", phaseId).eq("scope", "global");
  revalidatePath("/", "layout");
}
