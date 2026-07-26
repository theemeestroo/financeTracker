"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";
import { todayISO } from "@/lib/finance/dashboard";

const ScenarioSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required." }),
  starting_balance: z.coerce.number().default(0),
  notes: z.string().trim().optional(),
});

export type FormState = { error?: string } | undefined;

function parseScenarioForm(formData: FormData) {
  return ScenarioSchema.safeParse({
    name: formData.get("name"),
    starting_balance: formData.get("starting_balance") || 0,
    notes: formData.get("notes") || undefined,
  });
}

function toRow(data: z.infer<typeof ScenarioSchema>) {
  return {
    name: data.name,
    starting_balance: data.starting_balance,
    notes: data.notes || null,
  };
}

export async function createScenario(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseScenarioForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: scenario, error } = await supabase
    .from("severance_scenarios")
    .insert({ ...toRow(validated.data), user_id: user.id })
    .select("id")
    .single();

  if (error || !scenario) return { error: error?.message ?? "Could not create scenario." };

  // Every scenario starts with one phase — the baseline Living Profile,
  // active from today — so simple scenarios never need to think about
  // phases at all (DESIGN §10 Phase 4/5). Each severance package supplies
  // its own start date; the phase is just "whatever's active before any of
  // them kick in."
  const baselineProfileId = await getBaselineProfileId(supabase);
  await supabase.from("severance_scenario_phases").insert({
    user_id: user.id,
    scenario_id: scenario.id,
    profile_id: baselineProfileId,
    start_date: todayISO(),
    label: null,
  });

  revalidatePath("/severance-scenarios");
  redirect(`/severance-scenarios/${scenario.id}`);
}

export async function updateScenario(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseScenarioForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("severance_scenarios")
    .update(toRow(validated.data))
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/severance-scenarios");
  revalidatePath(`/severance-scenarios/${id}`);
  redirect(`/severance-scenarios/${id}`);
}

export async function deleteScenario(id: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenarios").delete().eq("id", id);
  revalidatePath("/severance-scenarios");
}
