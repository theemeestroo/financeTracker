import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SavingsRuleForm } from "../../../../severance-scenarios/savings-rule-form";
import { updateGlobalSavingsRule } from "../../../savings-rule-actions";
import type { HouseholdMember, SeveranceScenarioSavingsRule } from "@/lib/types";

export default async function EditGlobalSavingsRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: rule }, { data: members }] = await Promise.all([
    supabase.from("severance_scenario_savings_rules").select("*").eq("id", id).eq("scope", "global").single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
  ]);

  if (!rule) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit global savings rule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply everywhere this rule is referenced, immediately.
        </p>
      </div>
      <SavingsRuleForm
        action={updateGlobalSavingsRule.bind(null, id)}
        packages={[]}
        householdMembers={(members ?? []) as HouseholdMember[]}
        defaultValues={rule as SeveranceScenarioSavingsRule}
        fixedScope="global"
      />
    </div>
  );
}
