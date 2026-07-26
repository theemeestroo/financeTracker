"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";

const ScenarioSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required." }),
  household_member_id: z.string().trim().min(1, { message: "Select who this severance is for." }),
  employer_name: z.string().trim().optional(),
  years_of_service: z.coerce.number().min(0).optional(),
  employment_start_date: z.string().optional(),
  monthly_base_salary: z.coerce.number().min(0).optional(),
  holiday_pay_pct: z.coerce.number().min(0).optional(),
  annual_bonus: z.coerce.number().min(0).default(0),
  annual_car_benefit: z.coerce.number().min(0).default(0),
  monthly_pension_contribution: z.coerce.number().min(0).default(0),
  severance_multiplier: z.coerce.number().min(0).default(1),
  include_bonus_in_calc: z.boolean().default(false),
  include_car_in_calc: z.boolean().default(false),
  include_garden_leave: z.boolean().default(false),
  notice_period_months: z.coerce.number().min(0).optional(),
  gross_severance_override: z.coerce.number().min(0).optional(),
  severance_start_date: z.string().min(1, { message: "Severance start date is required." }),
  starting_balance: z.coerce.number().default(0),
  notes: z.string().trim().optional(),
});

export type FormState = { error?: string } | undefined;

function parseScenarioForm(formData: FormData) {
  return ScenarioSchema.safeParse({
    name: formData.get("name"),
    household_member_id: formData.get("household_member_id"),
    employer_name: formData.get("employer_name") || undefined,
    years_of_service: formData.get("years_of_service") || undefined,
    employment_start_date: formData.get("employment_start_date") || undefined,
    monthly_base_salary: formData.get("monthly_base_salary") || undefined,
    holiday_pay_pct: formData.get("holiday_pay_pct") || undefined,
    annual_bonus: formData.get("annual_bonus") || 0,
    annual_car_benefit: formData.get("annual_car_benefit") || 0,
    monthly_pension_contribution: formData.get("monthly_pension_contribution") || 0,
    severance_multiplier: formData.get("severance_multiplier") || 1,
    include_bonus_in_calc: formData.get("include_bonus_in_calc") === "on",
    include_car_in_calc: formData.get("include_car_in_calc") === "on",
    include_garden_leave: formData.get("include_garden_leave") === "on",
    notice_period_months: formData.get("notice_period_months") || undefined,
    gross_severance_override: formData.get("gross_severance_override") || undefined,
    severance_start_date: formData.get("severance_start_date"),
    starting_balance: formData.get("starting_balance") || 0,
    notes: formData.get("notes") || undefined,
  });
}

function toRow(data: z.infer<typeof ScenarioSchema>) {
  return {
    name: data.name,
    household_member_id: data.household_member_id,
    employer_name: data.employer_name || null,
    years_of_service: data.years_of_service ?? null,
    employment_start_date: data.employment_start_date || null,
    monthly_base_salary: data.monthly_base_salary ?? null,
    holiday_pay_pct: data.holiday_pay_pct ?? null,
    annual_bonus: data.annual_bonus,
    annual_car_benefit: data.annual_car_benefit,
    monthly_pension_contribution: data.monthly_pension_contribution,
    severance_multiplier: data.severance_multiplier,
    include_bonus_in_calc: data.include_bonus_in_calc,
    include_car_in_calc: data.include_car_in_calc,
    include_garden_leave: data.include_garden_leave,
    notice_period_months: data.notice_period_months ?? null,
    gross_severance_override: data.gross_severance_override ?? null,
    severance_start_date: data.severance_start_date,
    starting_balance: data.starting_balance,
    notes: data.notes || null,
  };
}

export async function createScenario(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseScenarioForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: scenario, error } = await supabase
    .from("severance_scenarios")
    .insert({ ...toRow(validated.data), user_id: user.id })
    .select("id")
    .single();

  if (error || !scenario) return { error: error?.message ?? "Could not create scenario." };

  // Every scenario starts with one phase — the baseline Living Profile,
  // active from day one — so simple scenarios never need to think about
  // phases at all (DESIGN §10 Phase 4/5).
  const baselineProfileId = await getBaselineProfileId(supabase);
  await supabase.from("severance_scenario_phases").insert({
    user_id: user.id,
    scenario_id: scenario.id,
    profile_id: baselineProfileId,
    start_date: validated.data.severance_start_date,
    label: null,
  });

  revalidatePath("/severance-scenarios");
  redirect(`/severance-scenarios/${scenario.id}`);
}

export async function updateScenario(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parseScenarioForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("severance_scenarios")
    .update(toRow(validated.data))
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/severance-scenarios");
  revalidatePath(`/severance-scenarios/${id}`);
  redirect(`/severance-scenarios/${id}`);
}

export async function deleteScenario(id: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenarios").delete().eq("id", id);
  revalidatePath("/severance-scenarios");
}
