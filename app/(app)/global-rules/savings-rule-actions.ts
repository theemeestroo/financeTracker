"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | undefined;

const GlobalSavingsRuleSchema = z.object({
  household_member_id: z.string().uuid({ message: "Choose who this applies to." }),
  name: z.string().trim().min(1, { message: "Name is required." }),
  allocation_type: z.enum(["amount", "percentage"]),
  amount: z.coerce.number().min(0).optional(),
  percentage: z.coerce.number().min(0).max(100).optional(),
  annual_return_pct: z.coerce.number().min(-100).max(1000),
  accrual_frequency: z.enum(["monthly", "quarterly", "annually"]),
});

function parseGlobalSavingsRuleForm(formData: FormData) {
  return GlobalSavingsRuleSchema.safeParse({
    household_member_id: formData.get("household_member_id"),
    name: formData.get("name"),
    allocation_type: formData.get("allocation_type"),
    amount: formData.get("amount") || undefined,
    percentage: formData.get("percentage") || undefined,
    annual_return_pct: formData.get("annual_return_pct") || 0,
    accrual_frequency: formData.get("accrual_frequency"),
  });
}

/** No headroom validation here — a global rule isn't tied to one scenario's
 *  package, so there's no single severance figure to validate against yet
 *  (see savings-rule-actions.ts's own comment on where that check happens
 *  instead, once the rule resolves against a real scenario). */
export async function addGlobalSavingsRule(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = parseGlobalSavingsRuleForm(formData);
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

  revalidatePath("/global-rules");
  return undefined;
}

/** Edits the single shared object in place — propagates immediately to
 *  every scenario referencing it (same "affects an unbounded set of other
 *  pages" reasoning `app/(app)/profiles/actions.ts` already uses). */
export async function updateGlobalSavingsRule(
  ruleId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseGlobalSavingsRuleForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };
  const data = validated.data;

  if (data.allocation_type === "amount" && (data.amount == null || data.amount <= 0)) {
    return { error: "Enter an amount greater than zero." };
  }
  if (data.allocation_type === "percentage" && (data.percentage == null || data.percentage <= 0)) {
    return { error: "Enter a percentage greater than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("severance_scenario_savings_rules")
    .update({
      household_member_id: data.household_member_id,
      name: data.name,
      allocation_type: data.allocation_type,
      amount: data.allocation_type === "amount" ? data.amount : null,
      percentage: data.allocation_type === "percentage" ? data.percentage : null,
      annual_return_pct: data.annual_return_pct,
      accrual_frequency: data.accrual_frequency,
    })
    .eq("id", ruleId)
    .eq("scope", "global");
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return undefined;
}

/** Deletes the global rule; its per-scenario overrides aren't deleted
 *  automatically — they're flagged for review, same as
 *  `deleteGlobalEvent` in the sibling events action file. */
export async function deleteGlobalSavingsRule(ruleId: string) {
  const supabase = await createClient();

  const { data: ruleRow } = await supabase
    .from("severance_scenario_savings_rules")
    .select("name")
    .eq("id", ruleId)
    .single();

  if (ruleRow) {
    await supabase
      .from("severance_global_savings_rule_overrides")
      .update({ stale_since: new Date().toISOString(), orphaned_item_name: ruleRow.name })
      .eq("global_rule_id", ruleId);
  }

  await supabase.from("severance_scenario_savings_rules").delete().eq("id", ruleId).eq("scope", "global");
  revalidatePath("/", "layout");
}
