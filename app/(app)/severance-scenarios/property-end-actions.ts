"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mergeScenarioPropertyEnds } from "@/lib/severance";
import type { SeveranceGlobalPropertyEndOverride, SeveranceScenarioPropertyEnd } from "@/lib/types";

export type FormState = { error?: string } | undefined;

const PropertyEndSchema = z.object({
  property_id: z.string().trim().min(1, { message: "Select a property." }),
  end_date: z.string().min(1, { message: "End date is required." }),
  scope: z.enum(["global", "scenario"]).default("scenario"),
});

/**
 * Ends a property scoped to `scenarioId` — unless the form's scope toggle
 * was set to "All scenarios", in which case it's created directly in the
 * Global list instead, regardless of which scenario this form was opened
 * from (same "creating a global item" pattern as `addScenarioEvent`).
 */
export async function addScenarioPropertyEnd(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = PropertyEndSchema.safeParse({
    property_id: formData.get("property_id"),
    end_date: formData.get("end_date"),
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
    // A property can only have one global end declaration — unlike events/
    // savings rules (arbitrary named items), a property-end's identity *is*
    // its property_id, so a second one would just be ambiguous about which
    // date actually applies.
    const { data: existing } = await supabase
      .from("severance_scenario_property_ends")
      .select("id")
      .eq("scope", "global")
      .eq("property_id", data.property_id)
      .maybeSingle();
    if (existing) {
      return { error: "This property already has a global end date — edit it from Global Rules instead." };
    }

    const { error } = await supabase.from("severance_scenario_property_ends").insert({
      user_id: user.id,
      scope: "global",
      scenario_id: null,
      property_id: data.property_id,
      end_date: data.end_date,
    });
    if (error) return { error: error.message };

    revalidatePath(`/severance-scenarios/${scenarioId}`);
    revalidatePath("/global-rules");
    return undefined;
  }

  const { error } = await supabase.from("severance_scenario_property_ends").upsert(
    {
      user_id: user.id,
      scope: "scenario",
      scenario_id: scenarioId,
      property_id: data.property_id,
      end_date: data.end_date,
    },
    { onConflict: "scenario_id,property_id" }
  );

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

/** Scenario-scoped property ends only — a global one's trailing actions in
 *  the merged view are override/duplicate, not delete; it's only deletable
 *  from the Global list (`deleteGlobalPropertyEnd`). */
export async function deleteScenarioPropertyEnd(propertyEndId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_property_ends").delete().eq("id", propertyEndId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

const OverrideSchema = z.object({
  end_date: z.string().min(1, { message: "Date is required." }),
});

/** Sets (or replaces) this scenario's local supersede of a global
 *  property-end's own `end_date` — doesn't fork the item, see
 *  `global-items.ts`. */
export async function setPropertyEndOverride(
  globalPropertyEndId: string,
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = OverrideSchema.safeParse({ end_date: formData.get("end_date") });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_global_property_end_overrides").upsert(
    {
      user_id: user.id,
      global_property_end_id: globalPropertyEndId,
      scenario_id: scenarioId,
      end_date: validated.data.end_date,
      suppressed: false,
    },
    { onConflict: "global_property_end_id,scenario_id" }
  );
  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

/** Reverts a scenario back to the global property-end's own default date. */
export async function clearPropertyEndOverride(globalPropertyEndId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase
    .from("severance_global_property_end_overrides")
    .delete()
    .eq("global_property_end_id", globalPropertyEndId)
    .eq("scenario_id", scenarioId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

/**
 * "Fully duplicate" — reads the *effective* (override-aware) current
 * end_date via `mergeScenarioPropertyEnds`, inserts an independent
 * scope="scenario" copy, then marks the global property-end suppressed for
 * this one scenario so the two don't both cap the same property's
 * commitments. Same reasoning as `duplicateGlobalEventIntoScenario`.
 */
export async function duplicateGlobalPropertyEndIntoScenario(globalPropertyEndId: string, scenarioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: globalPropertyEndRow } = await supabase
    .from("severance_scenario_property_ends")
    .select("*")
    .eq("id", globalPropertyEndId)
    .single();
  if (!globalPropertyEndRow) return;

  const { data: overrideRows } = await supabase
    .from("severance_global_property_end_overrides")
    .select("*")
    .eq("global_property_end_id", globalPropertyEndId)
    .eq("scenario_id", scenarioId);

  const [effective] = mergeScenarioPropertyEnds(
    [],
    [globalPropertyEndRow as SeveranceScenarioPropertyEnd],
    (overrideRows ?? []) as SeveranceGlobalPropertyEndOverride[]
  );
  if (!effective) return; // already suppressed here — nothing to duplicate from

  await supabase.from("severance_scenario_property_ends").insert({
    user_id: user.id,
    scope: "scenario",
    scenario_id: scenarioId,
    property_id: effective.property_id,
    end_date: effective.end_date,
  });

  await supabase.from("severance_global_property_end_overrides").upsert(
    {
      user_id: user.id,
      global_property_end_id: globalPropertyEndId,
      scenario_id: scenarioId,
      end_date: null,
      suppressed: true,
    },
    { onConflict: "global_property_end_id,scenario_id" }
  );

  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

/** Removes a stale override (its global property-end was deleted) from the
 *  "Needs review" list — just dismisses it, nothing else references it
 *  anymore. */
export async function dismissStalePropertyEndOverride(overrideId: string) {
  const supabase = await createClient();
  await supabase.from("severance_global_property_end_overrides").delete().eq("id", overrideId);
  revalidatePath("/global-rules");
}
