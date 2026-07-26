import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentTaxYear, calculateSocialContributions, taxableWageIncome, calculateNetIncome } from "@/lib/tax";
import { calculateSeveranceNet } from "@/lib/tax/fuenftelregelung";
import { calculateSeverancePackage } from "@/lib/severance";
import {
  activeCommitments,
  activeIncome,
  totalMonthlyCommitments,
  totalMonthlyNetIncome,
} from "@/lib/finance/dashboard";
import type { ResolvedSeveranceScenario } from "@/lib/runway";
import type { Commitment, Income, SeveranceScenario, TaxProfile } from "@/lib/types";

/**
 * Steady-state monthly burn under a scenario's first (baseline) phase, at
 * the moment severance starts — commitments minus net income. Used for the
 * comparison table's "monthly burn" column; deliberately not derived from
 * the projected series (which includes one-time lump-sum/garden-leave
 * jumps that would distort a simple month-over-month difference).
 */
export function computeMonthlyBurn(runwayScenario: ResolvedSeveranceScenario): number {
  const firstPhase = runwayScenario.phases[0];
  if (!firstPhase) return 0;

  const onDate = runwayScenario.severanceStartDate;
  const commitments = activeCommitments(firstPhase.profile.commitments, onDate);
  const income = activeIncome(firstPhase.profile.income, onDate);

  const monthlyCommitments = totalMonthlyCommitments(commitments);
  const { netMonthly } = totalMonthlyNetIncome(
    income,
    runwayScenario.taxProfileByMember,
    runwayScenario.taxYear
  );

  return monthlyCommitments - netMonthly;
}

export type ScenarioPackageSummary = {
  severanceGross: number;
  isOverridden: boolean;
  noticePayGross: number;
  netSeverance: number | null; // null when the member has no tax profile yet
  taxOnSeverance: number | null;
  taxSaving: number | null;
  gardenLeaveNetMonthly: number | null;
  hasTaxProfile: boolean;
};

/**
 * Resolves everything a severance scenario needs, in one place: the package
 * calculator + net severance figures, and the fully-hydrated phases/events
 * `projectRunway` (lib/runway) expects. Shared by the scenario list (for a
 * quick depletion-date preview) and the detail page.
 */
export async function resolveScenario(
  supabase: SupabaseClient,
  scenario: SeveranceScenario
): Promise<{
  runwayScenario: ResolvedSeveranceScenario | null;
  packageSummary: ScenarioPackageSummary;
  taxYear: number;
}> {
  const taxYear = getCurrentTaxYear();

  const [{ data: phaseRows }, { data: eventRows }, { data: taxProfiles }] = await Promise.all([
    supabase
      .from("severance_scenario_phases")
      .select("id, profile_id, start_date, label")
      .eq("scenario_id", scenario.id)
      .order("start_date"),
    supabase.from("severance_scenario_events").select("*").eq("scenario_id", scenario.id),
    supabase
      .from("tax_profiles")
      .select(
        "id, household_member_id, tax_class, church_tax, church_tax_state, has_children, statutory_health_insurance, health_insurance_addon_rate"
      ),
  ]);

  const allTaxProfiles = (taxProfiles ?? []) as TaxProfile[];
  const taxProfileByMember = new Map(allTaxProfiles.map((p) => [p.household_member_id, p]));
  const taxProfileById = new Map(allTaxProfiles.map((p) => [p.id, p]));
  const memberTaxProfile = taxProfileByMember.get(scenario.household_member_id);

  // ── Package + net severance ──────────────────────────────────────────
  const packageResult = calculateSeverancePackage(scenario);
  let netSeverance: number | null = null;
  let taxOnSeverance: number | null = null;
  let taxSaving: number | null = null;
  let gardenLeaveNetMonthly: number | null = null;

  if (memberTaxProfile) {
    const grossAnnual = (scenario.monthly_base_salary ?? 0) * 12 + scenario.annual_bonus;
    const socialContribsAnnual =
      calculateSocialContributions(scenario.monthly_base_salary ?? 0, memberTaxProfile, taxYear).total * 12;
    const regularTaxableIncome = taxableWageIncome(
      grossAnnual,
      socialContribsAnnual,
      memberTaxProfile,
      taxYear
    );
    const severanceResult = calculateSeveranceNet(
      packageResult.severanceGross,
      regularTaxableIncome,
      memberTaxProfile,
      taxYear
    );
    netSeverance = severanceResult.netSeverance;
    taxOnSeverance = severanceResult.totalTaxOnSeverance;
    taxSaving = severanceResult.taxSaving;

    if (scenario.include_garden_leave) {
      gardenLeaveNetMonthly = calculateNetIncome(
        scenario.monthly_base_salary ?? 0,
        "monthly",
        memberTaxProfile,
        taxYear
      ).netMonthly;
    }
  }

  const packageSummary: ScenarioPackageSummary = {
    severanceGross: packageResult.severanceGross,
    isOverridden: packageResult.isOverridden,
    noticePayGross: packageResult.noticePay,
    netSeverance,
    taxOnSeverance,
    taxSaving,
    gardenLeaveNetMonthly,
    hasTaxProfile: !!memberTaxProfile,
  };

  // ── Runway inputs ────────────────────────────────────────────────────
  const phases = phaseRows ?? [];
  if (phases.length === 0 || !scenario.severance_start_date) {
    return { runwayScenario: null, packageSummary, taxYear };
  }

  const profileIds = Array.from(new Set(phases.map((p) => p.profile_id)));
  const [{ data: allCommitments }, { data: allIncome }] = await Promise.all([
    supabase
      .from("commitments")
      .select(
        "id, profile_id, name, category, amount, frequency, essential, ownership, household_member_id, start_date, end_date"
      )
      .in("profile_id", profileIds),
    supabase
      .from("income")
      .select(
        "id, profile_id, household_member_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost"
      )
      .in("profile_id", profileIds),
  ]);

  const commitmentsByProfile = new Map<string, Commitment[]>();
  const incomeByProfile = new Map<string, Income[]>();
  for (const pid of profileIds) {
    commitmentsByProfile.set(
      pid,
      ((allCommitments ?? []) as Commitment[]).filter((c) => c.profile_id === pid)
    );
    incomeByProfile.set(pid, ((allIncome ?? []) as Income[]).filter((i) => i.profile_id === pid));
  }

  const runwayScenario: ResolvedSeveranceScenario = {
    severanceStartDate: scenario.severance_start_date,
    includeGardenLeave: scenario.include_garden_leave,
    noticePeriodMonths: scenario.notice_period_months ?? 0,
    gardenLeaveNetMonthly: gardenLeaveNetMonthly ?? scenario.monthly_base_salary ?? 0,
    netSeveranceLumpSum: (netSeverance ?? packageResult.severanceGross) + scenario.starting_balance,
    phases: phases.map((p) => ({
      startDate: p.start_date,
      profile: {
        commitments: commitmentsByProfile.get(p.profile_id) ?? [],
        income: incomeByProfile.get(p.profile_id) ?? [],
      },
    })),
    events: (eventRows ?? []).map((e) => ({
      date: e.date,
      eventType: e.event_type,
      amount: e.amount,
      recurringGrossAmount: e.recurring_gross_amount,
      recurringFrequency: e.recurring_frequency,
      recurringTaxProfile: e.recurring_tax_profile_id
        ? taxProfileById.get(e.recurring_tax_profile_id) ?? null
        : null,
      recurringEndDate: e.recurring_end_date,
    })),
    taxProfileByMember,
    taxYear,
  };

  return { runwayScenario, packageSummary, taxYear };
}
