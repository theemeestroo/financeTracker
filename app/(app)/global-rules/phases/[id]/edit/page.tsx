import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhaseForm } from "../../../../severance-scenarios/phase-form";
import { updateGlobalPhase } from "../../../phase-actions";
import type { LivingProfile, SeveranceScenarioPhase } from "@/lib/types";

export default async function EditGlobalPhasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: phase }, { data: profiles }] = await Promise.all([
    supabase.from("severance_scenario_phases").select("*").eq("id", id).eq("scope", "global").single(),
    supabase.from("living_profiles").select("id, name, description, is_baseline").order("name"),
  ]);

  if (!phase) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit global cost phase</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply to every scenario&apos;s timeline that isn&apos;t overriding this phase,
          immediately.
        </p>
      </div>
      <PhaseForm
        action={updateGlobalPhase.bind(null, id)}
        profiles={(profiles ?? []) as LivingProfile[]}
        defaultValues={phase as SeveranceScenarioPhase}
      />
    </div>
  );
}
