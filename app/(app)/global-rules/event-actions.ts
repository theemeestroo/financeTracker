"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const GlobalEventSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Name is required." }),
    event_type: z.enum(["one_off_outflow", "one_off_inflow", "recurring_income_start"]),
    date: z.string().min(1, { message: "Date is required." }),
    amount: z.coerce.number().optional(),
    recurring_gross_amount: z.coerce.number().optional(),
    recurring_frequency: z.enum(["monthly", "quarterly", "annual"]).optional(),
    recurring_tax_profile_id: z.string().trim().optional(),
    recurring_end_date: z.string().optional(),
  })
  .refine(
    (data) => data.event_type === "recurring_income_start" || data.amount != null,
    { message: "Amount is required for one-off events.", path: ["amount"] }
  )
  .refine(
    (data) => data.event_type !== "recurring_income_start" || data.recurring_gross_amount != null,
    { message: "Gross amount is required for recurring income.", path: ["recurring_gross_amount"] }
  );

function parseGlobalEventForm(formData: FormData) {
  return GlobalEventSchema.safeParse({
    name: formData.get("name"),
    event_type: formData.get("event_type"),
    date: formData.get("date"),
    amount: formData.get("amount") || undefined,
    recurring_gross_amount: formData.get("recurring_gross_amount") || undefined,
    recurring_frequency: formData.get("recurring_frequency") || undefined,
    recurring_tax_profile_id: formData.get("recurring_tax_profile_id") || undefined,
    recurring_end_date: formData.get("recurring_end_date") || undefined,
  });
}

export async function addGlobalEvent(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = parseGlobalEventForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_scenario_events").insert({
    user_id: user.id,
    scope: "global",
    scenario_id: null,
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

  revalidatePath("/global-rules");
  return undefined;
}

/** Edits the single shared object in place — propagates immediately to
 *  every scenario referencing it, so every scenario page needs busting, not
 *  just the Global list (same "affects an unbounded set of other pages"
 *  reasoning `app/(app)/profiles/actions.ts` already uses). */
export async function updateGlobalEvent(
  eventId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseGlobalEventForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("severance_scenario_events")
    .update({
      name: data.name,
      event_type: data.event_type,
      date: data.date,
      amount: data.amount ?? null,
      recurring_gross_amount: data.recurring_gross_amount ?? null,
      recurring_frequency: data.recurring_frequency ?? null,
      recurring_tax_profile_id: data.recurring_tax_profile_id || null,
      recurring_end_date: data.recurring_end_date || null,
    })
    .eq("id", eventId)
    .eq("scope", "global");
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return undefined;
}

/** Deletes the global event; its per-scenario overrides aren't deleted
 *  automatically — they're flagged for review (snapshotted here just
 *  before the delete, since the FK nulls the reference out once it's gone)
 *  so the user can see which scenarios had an override tied to this item. */
export async function deleteGlobalEvent(eventId: string) {
  const supabase = await createClient();

  const { data: eventRow } = await supabase
    .from("severance_scenario_events")
    .select("name")
    .eq("id", eventId)
    .single();

  if (eventRow) {
    await supabase
      .from("severance_global_event_overrides")
      .update({ stale_since: new Date().toISOString(), orphaned_item_name: eventRow.name })
      .eq("global_event_id", eventId);
  }

  await supabase.from("severance_scenario_events").delete().eq("id", eventId).eq("scope", "global");
  revalidatePath("/", "layout");
}
