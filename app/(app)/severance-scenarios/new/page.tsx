import { ScenarioForm } from "../scenario-form";
import { createScenario } from "../actions";

export default function NewScenarioPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New severance scenario</h1>
        <p className="text-sm text-muted-foreground">
          Start with the household basics — add one or more people&apos;s severance packages, cost
          phases, and one-off events after saving.
        </p>
      </div>
      <ScenarioForm action={createScenario} />
    </div>
  );
}
