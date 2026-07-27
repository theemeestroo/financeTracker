"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const ChecklistItemSchema = z.object({
  label: z.string().trim().min(1, { message: "Label is required." }),
  due_date: z.string().optional(),
});

export async function addChecklistItem(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = ChecklistItemSchema.safeParse({
    label: formData.get("label"),
    due_date: formData.get("due_date") || undefined,
  });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("scenario_checklist_items").insert({
    user_id: user.id,
    scenario_id: scenarioId,
    template_key: null,
    label: validated.data.label,
    due_date: validated.data.due_date || null,
    completed: false,
  });

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

export async function toggleChecklistItem(itemId: string, scenarioId: string, completed: boolean) {
  const supabase = await createClient();
  await supabase
    .from("scenario_checklist_items")
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", itemId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

export async function deleteChecklistItem(itemId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("scenario_checklist_items").delete().eq("id", itemId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}
