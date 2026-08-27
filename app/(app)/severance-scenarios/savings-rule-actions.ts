"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveScenario } from "./resolve-scenario";
import { mergeScenarioSavingsRules } from "@/lib/severance";
import { formatEUR } from "@/lib/finance/frequency";
import type { SeveranceGlobalSavingsRuleOverride, SeveranceScenario, SeveranceScenarioSavingsRule } from "@/lib/types";

export type FormState = { error?: string } | undefined;

const SavingsRuleSchema = z
  .object({
    scope: z.enum(["global", "scenario"]).default("scenario"),
    package_id: z.string().uuid().optional(),
    household_member_id: z.string().uuid().optional(),
    name: z.string().trim().min(1, { message: "Name is required." }),
    allocation_type: z.enum(["amount", "percentage"]),
    amount: z.coerce.number().min(0).optional(),
    percentage: z.coerce.number().min(0).max(100).optional(),
    annual_return_pct: z.coerce.number().min(-100).max(1000),
    accrual_frequency: z.enum(["monthly", "quarterly", "annually"]),
  })
  .refine((data) => data.scope !== "scenario" || !!data.package_id, {
    message: "Choose who this applies to.",
    path: ["package_id"],
  })
  .refine((data) => data.scope !== "global" || !!data.household_member_id, {
    message: "Choose who this applies to.",
    path: ["household_member_id"],
  });

/**
 * Resolves a package's own net-severance base (net ?? gross, same fallback
 * `resolve-scenario.ts` uses everywhere) and how much of it is already
 * spoken for — by reusing `resolveScenario`'s own already-merged
 * `runwayScenario.savingsRules` (scenario rules + every applicable global
 * rule, override-aware) rather than re-deriving that merge here, so the
 * validation figure exactly matches what the tab itself shows and can never
 * under-count a global rule that also allocates from this same person.
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

  const { runwayScenario, packageSummaries } = await resolveScenario(supabase, scenarioRow as SeveranceScenario);
  const summary = packageSummaries.find((s) => s.package.id === packageId);
  if (!summary) return { error: "That person's package could not be found." };
  // Money isn't investable until it's actually in hand — netAtPayment
  // (2025+ marginal-rate withholding), not the eventual post-refund
  // netSeverance figure, which isn't liquid until the following year — and
  // never the amount diverted into a pension, which never reaches the
  // household as cash at all.
  const severanceBase = summary.netAtPayment ?? summary.severanceGross - summary.pensionDeposit;

  const alreadyAllocated = (runwayScenario?.savingsRules ?? [])
    .filter((r) => r.householdMemberId === summary.package.household_member_id)
    .reduce((sum, r) => sum + r.principal, 0);

  return { severanceBase, alreadyAllocated };
}

/**
 * Adds a rule scoped to `scenarioId`'s `package_id` — unless the form's
 * scope toggle was set to "All scenarios", in which case it's created
 * directly in the Global list against `household_member_id` instead (a
 * package is scenario-specific, so a global rule can't reference one — see
 * the migration's own comment), and headroom isn't validated here at all:
 * there's no single scenario to validate against yet. Over-allocation from
 * a global rule instead shows up as a non-blocking warning wherever it
 * resolves (the Savings tab's existing headroom display).
 */
export async function addSavingsRule(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = SavingsRuleSchema.safeParse({
    scope: formData.get("scope") || undefined,
    package_id: formData.get("package_id") || undefined,
    household_member_id: formData.get("household_member_id") || undefined,
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

  if (data.scope === "global") {
    const { error } = await supabase.from("severance_scenario_savings_rules").insert({
      user_id: user.id,
      scope: "global",
      scenario_id: null,
      package_id: null,
      household_member_id: data.household_member_id,
      name: data.name,
      allocation_type: data.allocation_type,
      amount: data.allocation_type === "amount" ? data.amount : null,
      percentage: data.allocation_type === "percentage" ? data.percentage : null,
      annual_return_pct: data.annual_return_pct,
      accrual_frequency: data.accrual_frequency,
    });
    if (error) return { error: error.message };
    revalidatePath(`/severance-scenarios/${scenarioId}`);
    revalidatePath("/global-rules");
    return undefined;
  }

  const state = await packageAllocationState(supabase, scenarioId, data.package_id!);
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
    scope: "scenario",
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

/** Scenario-scoped rules only — a global rule's trailing actions in the
 *  merged view are override/duplicate, not delete; it's only deletable from
 *  the Global list (`deleteGlobalSavingsRule`). */
export async function deleteSavingsRule(ruleId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_savings_rules").delete().eq("id", ruleId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

const OverrideSchema = z.object({
  value: z.coerce.number(),
});

/** Sets (or replaces) this scenario's local supersede of a global rule's
 *  own amount/percentage (whichever its allocation_type uses) — doesn't
 *  fork the item, see `global-items.ts`. */
export async function setSavingsRuleOverride(
  globalRuleId: string,
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = OverrideSchema.safeParse({ value: formData.get("value") });
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_global_savings_rule_overrides").upsert(
    {
      user_id: user.id,
      global_rule_id: globalRuleId,
      scenario_id: scenarioId,
      value: validated.data.value,
      suppressed: false,
    },
    { onConflict: "global_rule_id,scenario_id" }
  );
  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  return undefined;
}

/** Reverts a scenario back to the global rule's own default value. */
export async function clearSavingsRuleOverride(globalRuleId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase
    .from("severance_global_savings_rule_overrides")
    .delete()
    .eq("global_rule_id", globalRuleId)
    .eq("scenario_id", scenarioId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

/**
 * "Fully duplicate" — reads the effective (override-aware) current values,
 * inserts an independent scope="scenario" copy against this scenario's own
 * package for the rule's household member, then marks the global rule
 * suppressed for this one scenario so the two don't double-allocate the
 * same severance. Same reasoning as `duplicateGlobalEventIntoScenario`.
 */
export async function duplicateGlobalSavingsRuleIntoScenario(globalRuleId: string, scenarioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: globalRuleRow } = await supabase
    .from("severance_scenario_savings_rules")
    .select("*")
    .eq("id", globalRuleId)
    .single();
  if (!globalRuleRow) return;
  const rule = globalRuleRow as SeveranceScenarioSavingsRule;
  if (!rule.household_member_id) return;

  const { data: packageRow } = await supabase
    .from("severance_scenario_packages")
    .select("id")
    .eq("scenario_id", scenarioId)
    .eq("household_member_id", rule.household_member_id)
    .maybeSingle();
  if (!packageRow) return; // no package for this member in this scenario — nothing to duplicate into

  const { data: overrideRows } = await supabase
    .from("severance_global_savings_rule_overrides")
    .select("*")
    .eq("global_rule_id", globalRuleId)
    .eq("scenario_id", scenarioId);

  const packageIdByMember = new Map([[rule.household_member_id, packageRow.id as string]]);
  const [effective] = mergeScenarioSavingsRules(
    [],
    [rule],
    (overrideRows ?? []) as SeveranceGlobalSavingsRuleOverride[],
    packageIdByMember
  );
  if (!effective) return; // already suppressed here — nothing to duplicate from

  await supabase.from("severance_scenario_savings_rules").insert({
    user_id: user.id,
    scope: "scenario",
    scenario_id: scenarioId,
    package_id: effective.packageId,
    name: effective.name,
    allocation_type: effective.allocation_type,
    amount: effective.amount,
    percentage: effective.percentage,
    annual_return_pct: effective.annual_return_pct,
    accrual_frequency: effective.accrual_frequency,
  });

  await supabase.from("severance_global_savings_rule_overrides").upsert(
    {
      user_id: user.id,
      global_rule_id: globalRuleId,
      scenario_id: scenarioId,
      value: null,
      suppressed: true,
    },
    { onConflict: "global_rule_id,scenario_id" }
  );

  revalidatePath(`/severance-scenarios/${scenarioId}`);
}

/** Removes a stale override (its global rule was deleted) from the "Needs
 *  review" list. */
export async function dismissStaleSavingsRuleOverride(overrideId: string) {
  const supabase = await createClient();
  await supabase.from("severance_global_savings_rule_overrides").delete().eq("id", overrideId);
  revalidatePath("/global-rules");
}
