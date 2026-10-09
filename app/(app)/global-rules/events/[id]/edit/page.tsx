import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "../../../../severance-scenarios/event-form";
import { updateGlobalEvent } from "../../../event-actions";
import type { HouseholdMember, SeveranceScenarioEvent } from "@/lib/types";

export default async function EditGlobalEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("severance_scenario_events")
    .select("*")
    .eq("id", id)
    .eq("scope", "global")
    .single();

  if (!event) notFound();

  const { data: members } = await supabase.from("household_members").select("id, name, created_at").order("created_at");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit global event</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply everywhere this event is referenced, immediately.
        </p>
      </div>
      <EventForm
        action={updateGlobalEvent.bind(null, id)}
        defaultValues={event as SeveranceScenarioEvent}
        members={(members ?? []) as HouseholdMember[]}
      />
    </div>
  );
}
