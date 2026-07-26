import { createClient } from "@/lib/supabase/server";
import { ScenarioForm } from "../scenario-form";
import { createScenario } from "../actions";
import type { HouseholdMember } from "@/lib/types";

export default async function NewScenarioPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("household_members")
    .select("id, name, created_at")
    .order("name");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New severance scenario</h1>
        <p className="text-sm text-muted-foreground">
          Size the package, then set the timeline — you can add cost-of-living phases and one-off
          events after saving.
        </p>
      </div>
      <ScenarioForm action={createScenario} members={(members ?? []) as HouseholdMember[]} />
    </div>
  );
}
