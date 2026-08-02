"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveScenario } from "./resolve-scenario";
import { formatEUR } from "@/lib/finance/frequency";
import type { SeveranceScenario } from "@/lib/types";

export type FormState = { error?: string } | undefined;

const SavingsRuleSchema = z.object({
  package_id: z.string().uuid({ message: "Choose who this applies to." }),
  name: z.string().trim().min(1, { message: "Name is required." }),
  allocation_type: z.enum(["amount", "percentage"]),
  amount: z.coerce.number().min(0).optional(),
  percentage: z.coerce.number().min(0).max(100).optional(),
  annual_return_pct: z.coerce.number().min(-100).max(1000),
  accrual_frequency: z.enum(["monthly", "quarterly", "annually"]),
});

/**
 * Resolves a package's own net-severance base (net ?? gross, same fallback
 * `resolve-scenario.ts` uses everywhere) and how much of it is already
 * spoken for by existing rules, by reusing `resolveScenario` rather than
 * re-deriving the tax math here — this is a form submission, not a hot
 * path, so the extra resolution work is cheap next to guaranteeing the
 * validation figure exactly matches what the tab itself shows.
 */
async function packageAllocationState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scenarioId: string,
  packageId: string
): Promise<{ severanceBase: number; alreadyAllocated: number } | { error: string }> {
  const { data: scenarioRow } = await supabase
    .from("severance_scenarios")
    .select("*")
    .eq("id", scenarioId)
    .single();
  if (!scenarioRow) return { error: "Scenario not found." };

  const { packageSummaries } = await resolveScenario(supabase, scenarioRow as SeveranceScenario);
  const summary = packageSummaries.find((s) => s.package.id === packageId);
  if (!summary) return { error: "That person's package could not be found." };
  const severanceBase = summary.netSeverance ?? summary.severanceGross;

  const { data: existingRules } = await supabase
    .from("severance_scenario_savings_rules")
    .select("allocation_type, amount, percentage")
    .eq("package_id", packageId);

  const alreadyAllocated = (existingRules ?? []).reduce(
    (sum, r) =>
      sum +
      (r.allocation_type === "amount" ? (r.amount ?? 0) : ((r.percentage ?? 0) / 100) * severanceBase),
    0
  );

  return { severanceBase, alreadyAllocated };
}

export async function addSavingsRule(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = SavingsRuleSchema.safeParse({
    package_id: formData.get("package_id"),
    name: formData.get("name"),
    allocation_type: formData.get("allocation_type"),
    amount: formData.get("amount") || undefined,
    percentage: formData.get("percentage") || undefined,
    annual_return_pct: formData.get("annual_return_pct") || 0,
    accrual_frequency: formData.get("accrual_frequency"),
  });
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  if (data.allocation_type === "amount" && (data.amount == null || data.amount <= 0)) {
    return { error: "Enter an amount greater than zero." };
  }
  if (data.allocation_type === "percentage" && (data.percentage == null || data.percentage <= 0)) {
    return { error: "Enter a percentage greater than zero." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const state = await packageAllocationState(supabase, scenarioId, data.package_id);
  if ("error" in state) return state;
  const { severanceBase, alreadyAllocated } = state;

  const newAmount =
    data.allocation_type === "amount" ? data.amount! : (data.percentage! / 100) * severanceBase;

  // Small epsilon tolerance for floating-point rounding, not a real allowance.
  if (alreadyAllocated + newAmount > severanceBase + 0.01) {
    const remaining = Math.max(0, severanceBase - alreadyAllocated);
    return {
      error: `That exceeds this person's available severance — ${formatEUR(remaining)} left to allocate.`,
    };
  }

  const { error } = await supabase.from("severance_scenario_savings_rules").insert({
    user_id: user.id,
    scenario_id: scenarioId,
    package_id: data.package_id,
    name: data.name,
    allocation_type: data.allocation_type,
    amount: data.allocation_type === "amount" ? data.amount : null,
    percentage: data.allocation_type === "percentage" ? data.percentage : null,
    annual_return_pct: data.annual_return_pct,
    accrual_frequency: data.accrual_frequency,
  });

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

export async function deleteSavingsRule(ruleId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_savings_rules").delete().eq("id", ruleId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}
