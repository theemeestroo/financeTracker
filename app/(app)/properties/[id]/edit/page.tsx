import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PropertyForm } from "../../property-form";
import { updateProperty } from "../../actions";
import type { HouseholdMember, Property, PropertySplit } from "@/lib/types";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: members }, { data: splits }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, profile_id, name, address, notes, end_date")
      .eq("id", id)
      .single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
    supabase
      .from("property_splits")
      .select("id, property_id, household_member_id, percentage")
      .eq("property_id", id),
  ]);

  if (!property) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit property</h1>
      </div>
      <PropertyForm
        action={updateProperty.bind(null, id)}
        members={(members ?? []) as HouseholdMember[]}
        defaultValues={property as Property}
        defaultSplits={(splits ?? []) as PropertySplit[]}
      />
    </div>
  );
}
