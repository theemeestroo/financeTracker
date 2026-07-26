"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
  })
  .refine(
    (data) => data.event_type === "recurring_income_start" || data.amount != null,
    { message: "Amount is required for one-off events.", path: ["amount"] }
  )
  .refine(
    (data) => data.event_type !== "recurring_income_start" || data.recurring_gross_amount != null,
    { message: "Gross amount is required for recurring income.", path: ["recurring_gross_amount"] }
  );

export async function addScenarioEvent(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = EventSchema.safeParse({
    name: formData.get("name"),
    event_type: formData.get("event_type"),
    date: formData.get("date"),
    amount: formData.get("amount") || undefined,
    recurring_gross_amount: formData.get("recurring_gross_amount") || undefined,
    recurring_frequency: formData.get("recurring_frequency") || undefined,
    recurring_tax_profile_id: formData.get("recurring_tax_profile_id") || undefined,
    recurring_end_date: formData.get("recurring_end_date") || undefined,
  });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_scenario_events").insert({
    user_id: user.id,
    scenario_id: scenarioId,
    name: validated.data.name,
    event_type: validated.data.event_type,
    date: validated.data.date,
    amount: validated.data.amount ?? null,
    recurring_gross_amount: validated.data.recurring_gross_amount ?? null,
    recurring_frequency: validated.data.recurring_frequency ?? null,
    recurring_tax_profile_id: validated.data.recurring_tax_profile_id || null,
    recurring_end_date: validated.data.recurring_end_date || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

export async function deleteScenarioEvent(eventId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_events").delete().eq("id", eventId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}
