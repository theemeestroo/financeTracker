"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mergePhases } from "@/lib/severance";
import type { SeveranceGlobalPhaseOverride, SeveranceScenarioPhase } from "@/lib/types";

export type FormState = { error?: string } | undefined;

const PhaseSchema = z.object({
  profile_id: z.string().trim().min(1, { message: "Select a Living Profile." }),
  start_date: z.string().min(1, { message: "Start date is required." }),
  label: z.string().trim().optional(),
  scope: z.enum(["global", "scenario"]).default("scenario"),
});

/**
 * Adds a phase scoped to `scenarioId` — unless the form's scope toggle was
 * set to "All scenarios", in which case it's created directly in the Global
 * list instead, regardless of which scenario this form was opened from (same
 * "creating a global item" pattern as `addScenarioEvent`/`addScenarioPropertyEnd`).
 * No duplicate-rejection check on the global branch — unlike a property-end,
 * a phase has no natural per-scenario identity to collide on; a timeline can
 * have arbitrarily many global phases.
 */
export async function addScenarioPhase(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = PhaseSchema.safeParse({
    profile_id: formData.get("profile_id"),
    start_date: formData.get("start_date"),
    label: formData.get("label") || undefined,
    scope: formData.get("scope") || undefined,
  });
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (data.scope === "global") {
    const { error } = await supabase.from("severance_scenario_phases").insert({
      user_id: user.id,
      scope: "global",
      scenario_id: null,
      profile_id: data.profile_id,
      start_date: data.start_date,
      label: data.label || null,
    });
    if (error) return { error: error.message };

    revalidatePath(`/severance-scenarios/${scenarioId}`);
    revalidatePath("/global-rules");
    return undefined;
  }

  const { error } = await supabase.from("severance_scenario_phases").insert({
    user_id: user.id,
    scope: "scenario",
    scenario_id: scenarioId,
    profile_id: data.profile_id,
    start_date: data.start_date,
    label: data.label || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

/** Scenario-scoped phases only — a global one's trailing actions in the
 *  merged view are override/duplicate, not delete; it's only deletable from
 *  the Global list (`deleteGlobalPhase`). */
export async function deleteScenarioPhase(phaseId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_phases").delete().eq("id", phaseId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

const OverrideSchema = z.object({
  profile_id: z.string().trim().min(1, { message: "Select a Living Profile." }),
});

/** Sets (or replaces) this scenario's local supersede of a global phase's
 *  own `profile_id` — doesn't fork the item, see `global-items.ts`. The
 *  trigger `start_date` is never overridden. */
export async function setPhaseOverride(
  globalPhaseId: string,
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = OverrideSchema.safeParse({ profile_id: formData.get("profile_id") });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_global_phase_overrides").upsert(
    {
      user_id: user.id,
      global_phase_id: globalPhaseId,
      scenario_id: scenarioId,
      profile_id: validated.data.profile_id,
      suppressed: false,
    },
    { onConflict: "global_phase_id,scenario_id" }
  );
  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

/** Reverts a scenario back to the global phase's own default profile. */
export async function clearPhaseOverride(globalPhaseId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase
    .from("severance_global_phase_overrides")
    .delete()
    .eq("global_phase_id", globalPhaseId)
    .eq("scenario_id", scenarioId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

/**
 * "Fully duplicate" — reads the *effective* (override-aware) current
 * profile_id via `mergePhases`, inserts an independent scope="scenario"
 * copy, then marks the global phase suppressed for this one scenario so the
 * two don't both apply. Same reasoning as `duplicateGlobalPropertyEndIntoScenario`.
 */
export async function duplicateGlobalPhaseIntoScenario(globalPhaseId: string, scenarioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: globalPhaseRow } = await supabase
    .from("severance_scenario_phases")
    .select("*")
    .eq("id", globalPhaseId)
    .single();
  if (!globalPhaseRow) return;

  const { data: overrideRows } = await supabase
    .from("severance_global_phase_overrides")
    .select("*")
    .eq("global_phase_id", globalPhaseId)
    .eq("scenario_id", scenarioId);

  const [effective] = mergePhases(
    [],
    [globalPhaseRow as SeveranceScenarioPhase],
    (overrideRows ?? []) as SeveranceGlobalPhaseOverride[]
  );
  if (!effective) return; // already suppressed here — nothing to duplicate from

  await supabase.from("severance_scenario_phases").insert({
    user_id: user.id,
    scope: "scenario",
    scenario_id: scenarioId,
    profile_id: effective.profile_id,
    start_date: effective.start_date,
    label: effective.label,
  });

  await supabase.from("severance_global_phase_overrides").upsert(
    {
      user_id: user.id,
      global_phase_id: globalPhaseId,
      scenario_id: scenarioId,
      profile_id: null,
      suppressed: true,
    },
    { onConflict: "global_phase_id,scenario_id" }
  );

  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

/** Removes a stale override (its global phase was deleted) from the "Needs
 *  review" list — just dismisses it, nothing else references it anymore. */
export async function dismissStalePhaseOverride(overrideId: string) {
  const supabase = await createClient();
  await supabase.from("severance_global_phase_overrides").delete().eq("id", overrideId);
  revalidatePath("/global-rules");
}
