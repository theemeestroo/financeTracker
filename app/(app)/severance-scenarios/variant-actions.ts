"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addMonths } from "@/lib/finance/date-utils";
import type {
  SeveranceScenario,
  SeveranceScenarioEvent,
  SeveranceScenarioPackage,
  SeveranceScenarioPhase,
  SeveranceScenarioPropertyEnd,
} from "@/lib/types";

export type FormState = { error?: string } | undefined;

const VariantSchema = z.object({
  months: z.coerce.number().min(0),
  salaryPct: z.coerce.number().min(0),
});

const VariantsSchema = z.object({
  variants: z.array(VariantSchema).length(3),
});

function parseVariantsForm(formData: FormData) {
  const variants = [0, 1, 2].map((i) => ({
    months: formData.get(`variant_${i}_months`),
    salaryPct: formData.get(`variant_${i}_salary_pct`),
  }));
  return VariantsSchema.safeParse({ variants });
}

/**
 * "What if the job search takes longer" without hand-cloning a scenario and
 * hand-editing a recurring_income_start event's date (DESIGN v2 §2.4). Deep
 * clones the source scenario's packages/phases/existing events/property-ends
 * unchanged (the negotiated severance terms don't depend on re-employment
 * timing) once per variant, then adds one new recurring_income_start event
 * per variant representing the re-employment assumption.
 *
 * "Previous salary" is the sum of monthly_base_salary across all of the
 * source scenario's packages — correct for the common single-earner case;
 * for a two-package scenario this is a combined-household approximation,
 * same spirit as this app's other event-based re-employment modeling (events
 * aren't attributed to a household member — see resolve-scenario.ts's salary
 * cutoff note). The re-employment date is measured from the earliest
 * package's severance_start_date.
 */
export async function generateScenarioVariants(
  sourceScenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseVariantsForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [{ data: source }, { data: packageRows }, { data: phaseRows }, { data: eventRows }, { data: propertyEndRows }] =
    await Promise.all([
      supabase.from("severance_scenarios").select("*").eq("id", sourceScenarioId).single(),
      supabase.from("severance_scenario_packages").select("*").eq("scenario_id", sourceScenarioId),
      supabase.from("severance_scenario_phases").select("*").eq("scenario_id", sourceScenarioId),
      supabase.from("severance_scenario_events").select("*").eq("scenario_id", sourceScenarioId),
      supabase.from("severance_scenario_property_ends").select("*").eq("scenario_id", sourceScenarioId),
    ]);

  if (!source) return { error: "Scenario not found." };

  const scenario = source as SeveranceScenario;
  const packages = (packageRows ?? []) as SeveranceScenarioPackage[];
  if (packages.length === 0) {
    return { error: "Add at least one severance package before generating variants." };
  }
  const phases = (phaseRows ?? []) as SeveranceScenarioPhase[];
  const events = (eventRows ?? []) as SeveranceScenarioEvent[];
  const propertyEnds = (propertyEndRows ?? []) as SeveranceScenarioPropertyEnd[];

  const anchorDate = packages.reduce(
    (earliest, p) => (p.severance_start_date < earliest ? p.severance_start_date : earliest),
    packages[0].severance_start_date
  );
  const combinedPreviousSalary = packages.reduce((sum, p) => sum + (p.monthly_base_salary ?? 0), 0);

  const newScenarioIds: string[] = [];

  for (const variant of validated.data.variants) {
    const { data: newScenario, error: scenarioError } = await supabase
      .from("severance_scenarios")
      .insert({
        user_id: user.id,
        name: `${scenario.name} — ${variant.months}mo @ ${variant.salaryPct}%`,
        starting_balance: scenario.starting_balance,
        notes: scenario.notes,
      })
      .select("id")
      .single();

    if (scenarioError || !newScenario) {
      return { error: scenarioError?.message ?? "Could not create a variant scenario." };
    }
    const newScenarioId = newScenario.id as string;
    newScenarioIds.push(newScenarioId);

    await supabase.from("severance_scenario_packages").insert(
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
        severance_payment_date: p.severance_payment_date,
        christmas_bonus_pct: p.christmas_bonus_pct,
        include_christmas_bonus_in_calc: p.include_christmas_bonus_in_calc,
        claim_unemployment_benefit: p.claim_unemployment_benefit,
        unemployment_benefit_defer_months: p.unemployment_benefit_defer_months,
        months_insured_override: p.months_insured_override,
        new_job_start_date: p.new_job_start_date,
        sperrzeit_safe_confirmed: p.sperrzeit_safe_confirmed,
      }))
    );

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

    await supabase.from("severance_scenario_events").insert({
      user_id: user.id,
      scenario_id: newScenarioId,
      name: `Re-employment (${variant.salaryPct}% of previous salary)`,
      event_type: "recurring_income_start",
      amount: null,
      date: addMonths(anchorDate, Math.round(variant.months)),
      recurring_gross_amount: combinedPreviousSalary * (variant.salaryPct / 100),
      recurring_frequency: "monthly",
      recurring_tax_profile_id: null,
      recurring_end_date: null,
    });
  }

  redirect(`/severance-scenarios/compare?ids=${newScenarioIds.join(",")}`);
}
