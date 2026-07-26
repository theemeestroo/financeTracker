import { SupabaseClient } from "@supabase/supabase-js";

// Every user gets exactly one baseline Living Profile via the
// handle_new_user() trigger (supabase/migrations). Commitments/income
// created from the top-level pages always attach to it.
export async function getBaselineProfile(
  supabase: SupabaseClient
): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase
    .from("living_profiles")
    .select("id, name")
    .eq("is_baseline", true)
    .single();

  if (error || !data) {
    throw new Error("Baseline living profile not found for user.");
  }

  return data;
}

export async function getBaselineProfileId(supabase: SupabaseClient): Promise<string> {
  return (await getBaselineProfile(supabase)).id;
}
