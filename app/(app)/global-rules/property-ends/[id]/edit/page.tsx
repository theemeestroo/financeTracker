import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PropertyEndForm } from "../../../../severance-scenarios/property-end-form";
import { updateGlobalPropertyEnd } from "../../../property-end-actions";
import type { Property, SeveranceScenarioPropertyEnd } from "@/lib/types";

export default async function EditGlobalPropertyEndPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: propertyEnd }, { data: properties }] = await Promise.all([
    supabase.from("severance_scenario_property_ends").select("*").eq("id", id).eq("scope", "global").single(),
    supabase.from("properties").select("id, profile_id, name, address, notes, end_date").order("name"),
  ]);

  if (!propertyEnd) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit global property change</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply everywhere this property change is referenced, immediately.
        </p>
      </div>
      <PropertyEndForm
        action={updateGlobalPropertyEnd.bind(null, id)}
        properties={(properties ?? []) as Property[]}
        defaultValues={propertyEnd as SeveranceScenarioPropertyEnd}
      />
    </div>
  );
}
