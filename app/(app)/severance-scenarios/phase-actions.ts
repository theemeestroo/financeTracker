"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const PhaseSchema = z.object({
  profile_id: z.string().trim().min(1, { message: "Select a Living Profile." }),
  start_date: z.string().min(1, { message: "Start date is required." }),
  label: z.string().trim().optional(),
});

export async function addScenarioPhase(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = PhaseSchema.safeParse({
    profile_id: formData.get("profile_id"),
    start_date: formData.get("start_date"),
    label: formData.get("label") || undefined,
  });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_scenario_phases").insert({
    user_id: user.id,
    scenario_id: scenarioId,
    profile_id: validated.data.profile_id,
    start_date: validated.data.start_date,
    label: validated.data.label || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

export async function deleteScenarioPhase(phaseId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_phases").delete().eq("id", phaseId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}
