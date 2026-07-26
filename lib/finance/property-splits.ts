import type { SupabaseClient } from "@supabase/supabase-js";
import type { Property, PropertySplit } from "@/lib/types";

/** Properties for a Living Profile, with their ownership splits keyed by property id —
 *  used to populate a commitment form's property picker and its inherit-on-select prefill. */
export async function propertiesWithSplits(
  supabase: SupabaseClient,
  profileId: string
): Promise<{ properties: Property[]; splitsByProperty: Map<string, PropertySplit[]> }> {
  const { data: properties } = await supabase
    .from("properties")
    .select("id, profile_id, name, address, notes, end_date")
    .eq("profile_id", profileId)
    .order("name");

  const propertyRows = (properties ?? []) as Property[];
  const { data: splitRows } = await supabase
    .from("property_splits")
    .select("id, property_id, household_member_id, percentage")
    .in("property_id", propertyRows.map((p) => p.id));

  const splitsByProperty = new Map<string, PropertySplit[]>();
  for (const s of (splitRows ?? []) as PropertySplit[]) {
    splitsByProperty.set(s.property_id, [...(splitsByProperty.get(s.property_id) ?? []), s]);
  }

  return { properties: propertyRows, splitsByProperty };
}
