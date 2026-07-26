import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScenarioForm } from "../../scenario-form";
import { updateScenario } from "../../actions";
import type { SeveranceScenario } from "@/lib/types";

export default async function EditScenarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: scenario } = await supabase
    .from("severance_scenarios")
    .select("id, name, starting_balance, notes")
    .eq("id", id)
    .single();

  if (!scenario) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit scenario</h1>
      </div>
      <ScenarioForm
        action={updateScenario.bind(null, id)}
        defaultValues={scenario as SeveranceScenario}
      />
    </div>
  );
}
