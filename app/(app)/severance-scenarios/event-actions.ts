"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mergeScenarioEvents } from "@/lib/severance";
import type { SeveranceGlobalEventOverride, SeveranceScenarioEvent } from "@/lib/types";

export type FormState = { error?: string } | undefined;

const EventSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Name is required." }),
    event_type: z.enum(["one_off_outflow", "one_off_inflow", "recurring_income_start"]),
    date: z.string().min(1, { message: "Date is required." }),
    amount: z.coerce.number().optional(),
    recurring_gross_amount: z.coerce.number().optional(),
    recurring_frequency: z.enum(["monthly", "quarterly", "annual"]).optional(),
    recurring_tax_profile_id: z.string().trim().optional(),
    recurring_end_date: z.string().optional(),
    scope: z.enum(["global", "scenario"]).default("scenario"),
  })
  .refine(
    (data) => data.event_type === "recurring_income_start" || data.amount != null,
    { message: "Amount is required for one-off events.", path: ["amount"] }
  )
  .refine(
    (data) => data.event_type !== "recurring_income_start" || data.recurring_gross_amount != null,
    { message: "Gross amount is required for recurring income.", path: ["recurring_gross_amount"] }
  );

function parseEventForm(formData: FormData) {
  return EventSchema.safeParse({
    name: formData.get("name"),
    event_type: formData.get("event_type"),
    date: formData.get("date"),
    amount: formData.get("amount") || undefined,
    recurring_gross_amount: formData.get("recurring_gross_amount") || undefined,
    recurring_frequency: formData.get("recurring_frequency") || undefined,
    recurring_tax_profile_id: formData.get("recurring_tax_profile_id") || undefined,
    recurring_end_date: formData.get("recurring_end_date") || undefined,
    scope: formData.get("scope") || undefined,
  });
}

/**
 * Adds an event scoped to `scenarioId` — unless the form's scope toggle was
 * set to "All scenarios", in which case it's created directly in the
 * Global list instead, regardless of which scenario this form was opened
 * from (PRD: "Creating an item").
 */
export async function addScenarioEvent(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseEventForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const isGlobal = data.scope === "global";
  const { error } = await supabase.from("severance_scenario_events").insert({
    user_id: user.id,
    scope: data.scope,
    scenario_id: isGlobal ? null : scenarioId,
    name: data.name,
    event_type: data.event_type,
    date: data.date,
    amount: data.amount ?? null,
    recurring_gross_amount: data.recurring_gross_amount ?? null,
    recurring_frequency: data.recurring_frequency ?? null,
    recurring_tax_profile_id: data.recurring_tax_profile_id || null,
    recurring_end_date: data.recurring_end_date || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  if (isGlobal) revalidatePath("/global-rules");
  return undefined;
}

/** Scenario-scoped events only (scope="scenario") — a global event's
 *  trailing actions in the merged view are override/duplicate, not delete;
 *  it's only deletable from the Global list (`deleteGlobalEvent`). */
export async function deleteScenarioEvent(eventId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_events").delete().eq("id", eventId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

const OverrideSchema = z.object({
  value: z.coerce.number(),
});

/** Sets (or replaces) this scenario's local supersede of a global event's
 *  own amount/recurring_gross_amount — doesn't fork the item, see
 *  `global-items.ts`. */
export async function setEventOverride(
  globalEventId: string,
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = OverrideSchema.safeParse({ value: formData.get("value") });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_global_event_overrides").upsert(
    {
      user_id: user.id,
      global_event_id: globalEventId,
      scenario_id: scenarioId,
      value: validated.data.value,
      suppressed: false,
    },
    { onConflict: "global_event_id,scenario_id" }
  );
  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

/** Reverts a scenario back to the global event's own default value. */
export async function clearEventOverride(globalEventId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase
    .from("severance_global_event_overrides")
    .delete()
    .eq("global_event_id", globalEventId)
    .eq("scenario_id", scenarioId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

/**
 * "Fully duplicate" (PRD: "Editing") — for when more than just the amount
 * needs to diverge. Reads the *effective* (override-aware) current values
 * via `mergeScenarioEvents`, inserts an independent scope="scenario" copy,
 * then marks the global event suppressed for this one scenario so the two
 * don't double-count the same cash flow — per your answer, a side effect of
 * this one explicit action, not a general subset-of-scenarios feature.
 */
export async function duplicateGlobalEventIntoScenario(globalEventId: string, scenarioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: globalEventRow } = await supabase
    .from("severance_scenario_events")
    .select("*")
    .eq("id", globalEventId)
    .single();
  if (!globalEventRow) return;

  const { data: overrideRows } = await supabase
    .from("severance_global_event_overrides")
    .select("*")
    .eq("global_event_id", globalEventId)
    .eq("scenario_id", scenarioId);

  const [effective] = mergeScenarioEvents(
    [],
    [globalEventRow as SeveranceScenarioEvent],
    (overrideRows ?? []) as SeveranceGlobalEventOverride[]
  );
  if (!effective) return; // already suppressed here — nothing to duplicate from

  await supabase.from("severance_scenario_events").insert({
    user_id: user.id,
    scope: "scenario",
    scenario_id: scenarioId,
    name: effective.name,
    event_type: effective.event_type,
    date: effective.date,
    amount: effective.amount,
    recurring_gross_amount: effective.recurring_gross_amount,
    recurring_frequency: effective.recurring_frequency,
    recurring_tax_profile_id: effective.recurring_tax_profile_id,
    recurring_end_date: effective.recurring_end_date,
  });

  await supabase.from("severance_global_event_overrides").upsert(
    {
      user_id: user.id,
      global_event_id: globalEventId,
      scenario_id: scenarioId,
      value: null,
      suppressed: true,
    },
    { onConflict: "global_event_id,scenario_id" }
  );

  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

/** Removes a stale override (its global event was deleted) from the "Needs
 *  review" list — just dismisses it, nothing else references it anymore. */
export async function dismissStaleEventOverride(overrideId: string) {
  const supabase = await createClient();
  await supabase.from("severance_global_event_overrides").delete().eq("id", overrideId);
  revalidatePath("/global-rules");
}
