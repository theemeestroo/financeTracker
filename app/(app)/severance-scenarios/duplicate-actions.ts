"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  SeveranceScenario,
  SeveranceScenarioEvent,
  SeveranceScenarioPackage,
  SeveranceScenarioPhase,
  SeveranceScenarioPropertyEnd,
  SeveranceScenarioSavingsRule,
} from "@/lib/types";

/**
 * Deep-clones a scenario's packages/phases/events/property-ends/savings
 * rules into a brand-new scenario, then sends the user straight to it —
 * the fastest way to explore "what if I changed the multiplier/bonus/etc."
 * is to duplicate a known-good scenario and edit the copy's package(s) via
 * the existing package edit form (every field — multiplier, include-bonus,
 * garden leave, ... — is already editable there), rather than re-entering
 * everything from scratch or building a second parallel editing UI.
 *
 * Checklist items are deliberately not copied — they're task-completion
 * state tied to a specific real plan, not a modeling assumption, same
 * choice `generateScenarioVariants` already makes for its own variants.
 */
export async function duplicateScenario(sourceScenarioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const [
    { data: source },
    { data: packageRows },
    { data: phaseRows },
    { data: eventRows },
    { data: propertyEndRows },
    { data: savingsRuleRows },
  ] = await Promise.all([
    supabase.from("severance_scenarios").select("*").eq("id", sourceScenarioId).single(),
    supabase.from("severance_scenario_packages").select("*").eq("scenario_id", sourceScenarioId),
    supabase.from("severance_scenario_phases").select("*").eq("scenario_id", sourceScenarioId),
    supabase.from("severance_scenario_events").select("*").eq("scenario_id", sourceScenarioId),
    supabase.from("severance_scenario_property_ends").select("*").eq("scenario_id", sourceScenarioId),
    supabase.from("severance_scenario_savings_rules").select("*").eq("scenario_id", sourceScenarioId),
  ]);

  if (!source) return;

  const scenario = source as SeveranceScenario;
  const packages = (packageRows ?? []) as SeveranceScenarioPackage[];
  const phases = (phaseRows ?? []) as SeveranceScenarioPhase[];
  const events = (eventRows ?? []) as SeveranceScenarioEvent[];
  const propertyEnds = (propertyEndRows ?? []) as SeveranceScenarioPropertyEnd[];
  const savingsRules = (savingsRuleRows ?? []) as SeveranceScenarioSavingsRule[];

  const { data: newScenario, error: scenarioError } = await supabase
    .from("severance_scenarios")
    .insert({
      user_id: user.id,
      name: `${scenario.name} (copy)`,
      starting_balance: scenario.starting_balance,
      notes: scenario.notes,
    })
    .select("id")
    .single();

  if (scenarioError || !newScenario) return;
  const newScenarioId = newScenario.id as string;

  if (packages.length > 0) {
    const { data: newPackages } = await supabase
      .from("severance_scenario_packages")
      .insert(
        packages.map((p) => ({
          user_id: user.id,
          scenario_id: newScenarioId,
          household_member_id: p.household_member_id,
          employer_name: p.employer_name,
          years_of_service: p.years_of_service,
          employment_start_date: p.employment_start_date,
          monthly_base_salary: p.monthly_base_salary,
          holiday_pay_pct: p.holiday_pay_pct,
          annual_bonus: p.annual_bonus,
          annual_car_benefit: p.annual_car_benefit,
          monthly_pension_contribution: p.monthly_pension_contribution,
          severance_multiplier: p.severance_multiplier,
          include_bonus_in_calc: p.include_bonus_in_calc,
          include_car_in_calc: p.include_car_in_calc,
          include_garden_leave: p.include_garden_leave,
          notice_period_months: p.notice_period_months,
          gross_severance_override: p.gross_severance_override,
          severance_start_date: p.severance_start_date,
          christmas_bonus_pct: p.christmas_bonus_pct,
          include_christmas_bonus_in_calc: p.include_christmas_bonus_in_calc,
          claim_unemployment_benefit: p.claim_unemployment_benefit,
          unemployment_benefit_defer_months: p.unemployment_benefit_defer_months,
          months_insured_override: p.months_insured_override,
          new_job_start_date: p.new_job_start_date,
          sperrzeit_safe_confirmed: p.sperrzeit_safe_confirmed,
        }))
      )
      .select("id, household_member_id");

    // Savings rules reference a package_id — remap old package -> new
    // package via the household member each package belongs to (unique
    // per scenario, per the packages table's own constraint).
    if (savingsRules.length > 0 && newPackages) {
      const memberByOldPackageId = new Map(packages.map((p) => [p.id, p.household_member_id]));
      const newPackageIdByMember = new Map(
        newPackages.map((p) => [p.household_member_id as string, p.id as string])
      );
      const remappedRules = savingsRules
        .map((rule) => {
          const memberId = memberByOldPackageId.get(rule.package_id);
          const newPackageId = memberId ? newPackageIdByMember.get(memberId) : undefined;
          if (!newPackageId) return null;
          return {
            user_id: user.id,
            scenario_id: newScenarioId,
            package_id: newPackageId,
            name: rule.name,
            allocation_type: rule.allocation_type,
            amount: rule.amount,
            percentage: rule.percentage,
            annual_return_pct: rule.annual_return_pct,
            accrual_frequency: rule.accrual_frequency,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (remappedRules.length > 0) {
        await supabase.from("severance_scenario_savings_rules").insert(remappedRules);
      }
    }
  }

  if (phases.length > 0) {
    await supabase.from("severance_scenario_phases").insert(
      phases.map((p) => ({
        user_id: user.id,
        scenario_id: newScenarioId,
        profile_id: p.profile_id,
        start_date: p.start_date,
        label: p.label,
      }))
    );
  }

  if (events.length > 0) {
    await supabase.from("severance_scenario_events").insert(
      events.map((e) => ({
        user_id: user.id,
        scenario_id: newScenarioId,
        name: e.name,
        event_type: e.event_type,
        amount: e.amount,
        date: e.date,
        recurring_gross_amount: e.recurring_gross_amount,
        recurring_frequency: e.recurring_frequency,
        recurring_tax_profile_id: e.recurring_tax_profile_id,
        recurring_end_date: e.recurring_end_date,
      }))
    );
  }

  if (propertyEnds.length > 0) {
    await supabase.from("severance_scenario_property_ends").insert(
      propertyEnds.map((pe) => ({
        user_id: user.id,
        scenario_id: newScenarioId,
        property_id: pe.property_id,
        end_date: pe.end_date,
      }))
    );
  }

  redirect(`/severance-scenarios/${newScenarioId}`);
}
