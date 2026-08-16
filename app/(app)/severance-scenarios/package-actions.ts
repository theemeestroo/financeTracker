"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateChecklistItems } from "@/lib/severance";

export type FormState = { error?: string } | undefined;

const PackageSchema = z.object({
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
  severance_start_date: z.string().min(1, { message: "Work end date is required." }),
  severance_payment_date: z.string().optional(),
  christmas_bonus_pct: z.coerce.number().min(0).optional(),
  include_christmas_bonus_in_calc: z.boolean().default(false),
  claim_unemployment_benefit: z.boolean().default(true),
  unemployment_benefit_defer_months: z.coerce.number().min(0).default(0),
  months_insured_override: z.coerce.number().min(0).optional(),
  new_job_start_date: z.string().optional(),
  sperrzeit_safe_confirmed: z.boolean().default(false),
});

function parsePackageForm(formData: FormData) {
  return PackageSchema.safeParse({
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
    severance_payment_date: formData.get("severance_payment_date") || undefined,
    christmas_bonus_pct: formData.get("christmas_bonus_pct") || undefined,
    include_christmas_bonus_in_calc: formData.get("include_christmas_bonus_in_calc") === "on",
    claim_unemployment_benefit: formData.get("claim_unemployment_benefit") === "on",
    unemployment_benefit_defer_months: formData.get("unemployment_benefit_defer_months") || 0,
    months_insured_override: formData.get("months_insured_override") || undefined,
    new_job_start_date: formData.get("new_job_start_date") || undefined,
    sperrzeit_safe_confirmed: formData.get("sperrzeit_safe_confirmed") === "on",
  });
}

function toRow(data: z.infer<typeof PackageSchema>) {
  return {
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
    severance_payment_date: data.severance_payment_date || null,
    christmas_bonus_pct: data.christmas_bonus_pct ?? null,
    include_christmas_bonus_in_calc: data.include_christmas_bonus_in_calc,
    claim_unemployment_benefit: data.claim_unemployment_benefit,
    unemployment_benefit_defer_months: data.unemployment_benefit_defer_months,
    months_insured_override: data.months_insured_override ?? null,
    new_job_start_date: data.new_job_start_date || null,
    sperrzeit_safe_confirmed: data.sperrzeit_safe_confirmed,
  };
}

export async function addScenarioPackage(
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parsePackageForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("severance_scenario_packages").insert({
    ...toRow(validated.data),
    user_id: user.id,
    scenario_id: scenarioId,
  });

  if (error) {
    return {
      error: error.code === "23505" ? "That person already has a package in this scenario." : error.message,
    };
  }

  // Auto-populate the redundancy checklist the first time this scenario has
  // a severance_start_date to anchor due dates from (scenario creation
  // itself has none yet) — guarded so a second/third package added later
  // doesn't reseed the template on top of items the user may have already
  // checked off or deleted.
  const { count } = await supabase
    .from("scenario_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("scenario_id", scenarioId);

  if (!count) {
    const { data: allPackages } = await supabase
      .from("severance_scenario_packages")
      .select("severance_start_date")
      .eq("scenario_id", scenarioId);
    const anchorDate = (allPackages ?? []).reduce(
      (earliest, p) => (p.severance_start_date < earliest ? p.severance_start_date : earliest),
      validated.data.severance_start_date
    );
    await supabase.from("scenario_checklist_items").insert(
      generateChecklistItems(anchorDate).map((item) => ({
        user_id: user.id,
        scenario_id: scenarioId,
        ...item,
        completed: false,
      }))
    );
  }

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  revalidatePath("/severance-scenarios");
  return undefined;
}

export async function updateScenarioPackage(
  packageId: string,
  scenarioId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = parsePackageForm(formData);
  if (!validated.success) return { error: validated.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("severance_scenario_packages")
    .update(toRow(validated.data))
    .eq("id", packageId);

  if (error) return { error: error.message };

  revalidatePath(`/severance-scenarios/${scenarioId}`);
  revalidatePath("/severance-scenarios");
  redirect(`/severance-scenarios/${scenarioId}`);
}

export async function deleteScenarioPackage(packageId: string, scenarioId: string) {
  const supabase = await createClient();
  await supabase.from("severance_scenario_packages").delete().eq("id", packageId);
  revalidatePath(`/severance-scenarios/${scenarioId}`);
  revalidatePath("/severance-scenarios");
}
