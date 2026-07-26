"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const PropertyEndSchema = z.object({
  property_id: z.string().trim().min(1, { message: "Select a property." }),
  end_date: z.string().min(1, { message: "End date is required." }),
});

export async function addScenarioPropertyEnd(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = PropertyEndSchema.safeParse({
    property_id: formData.get("property_id"),
    end_date: formData.get("end_date"),
  });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_scenario_property_ends").upsert(
    {
      user_id: user.id,
      scenario_id: scenarioId,
      property_id: validated.data.property_id,
      end_date: validated.data.end_date,
    },
    { onConflict: "scenario_id,property_id" }
  );

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

export async function deleteScenarioPropertyEnd(propertyEndId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_property_ends").delete().eq("id", propertyEndId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}
