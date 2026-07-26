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
import { addDays } from "@/lib/finance/date-utils";
import type { Split } from "@/lib/finance/splits";
import type { ResolvedIncome, ResolvedSeveranceScenario, SeveranceStream } from "@/lib/runway";
import type {
  Commitment,
  Income,
  IncomeSplit,
  SeveranceScenario,
  SeveranceScenarioPackage,
  TaxProfile,
} from "@/lib/types";

/**
 * Steady-state monthly burn under a scenario's first (baseline) phase, at
 * the moment the earliest severance package starts — commitments minus net
 * income. Used for the comparison table's "monthly burn" column; deliberately
 * not derived from the projected series (which includes one-time
 * lump-sum/garden-leave jumps that would distort a simple month-over-month
 * difference).
 */
export function computeMonthlyBurn(runwayScenario: ResolvedSeveranceScenario): number {
  const firstPhase = runwayScenario.phases[0];
  if (!firstPhase || runwayScenario.severances.length === 0) return 0;

  const onDate = runwayScenario.severances.reduce(
    (earliest, s) => (s.severanceStartDate < earliest ? s.severanceStartDate : earliest),
    runwayScenario.severances[0].severanceStartDate
  );
  const commitments = activeCommitments(firstPhase.profile.commitments, onDate);
  const income = activeIncome(firstPhase.profile.income, onDate);
  const splitsByIncome = new Map(firstPhase.profile.income.map((i) => [i.id, i.splits]));

  const monthlyCommitments = totalMonthlyCommitments(commitments);
  const { netMonthly } = totalMonthlyNetIncome(
    income,
    splitsByIncome,
    runwayScenario.taxProfileByMember,
    runwayScenario.taxYear
  );

  return monthlyCommitments - netMonthly;
}

export type ScenarioPackageSummary = {
  package: SeveranceScenarioPackage;
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
 * calculator + net severance figures for every person's package, and the
 * fully-hydrated phases/events `projectRunway` (lib/runway) expects. Shared
 * by the scenario list (for a quick depletion-date preview) and the detail
 * page.
 */
export async function resolveScenario(
  supabase: SupabaseClient,
  scenario: SeveranceScenario
): Promise<{
  runwayScenario: ResolvedSeveranceScenario | null;
  packageSummaries: ScenarioPackageSummary[];
  taxYear: number;
}> {
  const taxYear = getCurrentTaxYear();

  const [{ data: packageRows }, { data: phaseRows }, { data: eventRows }, { data: taxProfiles }] =
    await Promise.all([
      supabase
        .from("severance_scenario_packages")
        .select("*")
        .eq("scenario_id", scenario.id)
        .order("severance_start_date"),
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

  const packages = (packageRows ?? []) as SeveranceScenarioPackage[];
  const allTaxProfiles = (taxProfiles ?? []) as TaxProfile[];
  const taxProfileByMember = new Map(allTaxProfiles.map((p) => [p.household_member_id, p]));
  const taxProfileById = new Map(allTaxProfiles.map((p) => [p.id, p]));

  // ── Package + net severance, one per person ────────────────────────────
  const packageSummaries: ScenarioPackageSummary[] = packages.map((pkg) => {
    const memberTaxProfile = taxProfileByMember.get(pkg.household_member_id);
    const packageResult = calculateSeverancePackage(pkg);
    let netSeverance: number | null = null;
    let taxOnSeverance: number | null = null;
    let taxSaving: number | null = null;
    let gardenLeaveNetMonthly: number | null = null;

    if (memberTaxProfile) {
      const grossAnnual = (pkg.monthly_base_salary ?? 0) * 12 + pkg.annual_bonus;
      const socialContribsAnnual =
        calculateSocialContributions(pkg.monthly_base_salary ?? 0, memberTaxProfile, taxYear).total *
        12;
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

      if (pkg.include_garden_leave) {
        gardenLeaveNetMonthly = calculateNetIncome(
          pkg.monthly_base_salary ?? 0,
          "monthly",
          memberTaxProfile,
          taxYear
        ).netMonthly;
      }
    }

    return {
      package: pkg,
      severanceGross: packageResult.severanceGross,
      isOverridden: packageResult.isOverridden,
      noticePayGross: packageResult.noticePay,
      netSeverance,
      taxOnSeverance,
      taxSaving,
      gardenLeaveNetMonthly,
      hasTaxProfile: !!memberTaxProfile,
    };
  });

  // ── Runway inputs ────────────────────────────────────────────────────
  const phases = phaseRows ?? [];
  if (phases.length === 0 || packages.length === 0) {
    return { runwayScenario: null, packageSummaries, taxYear };
  }

  const profileIds = Array.from(new Set(phases.map((p) => p.profile_id)));
  const [{ data: allCommitments }, { data: allIncome }, { data: propertyEndRows }] = await Promise.all([
    supabase
      .from("commitments")
      .select(
        "id, profile_id, name, category, amount, frequency, essential, start_date, end_date, property_id"
      )
      .in("profile_id", profileIds),
    supabase
      .from("income")
      .select(
        "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
      )
      .in("profile_id", profileIds),
    supabase
      .from("severance_scenario_property_ends")
      .select("property_id, end_date")
      .eq("scenario_id", scenario.id),
  ]);

  const incomeRows = (allIncome ?? []) as Income[];
  const { data: incomeSplitRows } = await supabase
    .from("income_splits")
    .select("id, income_id, household_member_id, percentage")
    .in("income_id", incomeRows.map((i) => i.id));
  const splitsByIncome = new Map<string, Split[]>();
  for (const s of (incomeSplitRows ?? []) as IncomeSplit[]) {
    splitsByIncome.set(s.income_id, [...(splitsByIncome.get(s.income_id) ?? []), s]);
  }

  // A scenario-scoped "end this property" override: cap the effective
  // end_date of every commitment linked to that property, without touching
  // the property or its commitments outside this scenario.
  const propertyEndByPropertyId = new Map(
    (propertyEndRows ?? []).map((r) => [r.property_id as string, r.end_date as string])
  );
  const commitmentsWithPropertyEnds = ((allCommitments ?? []) as Commitment[]).map((c) => {
    const override = c.property_id ? propertyEndByPropertyId.get(c.property_id) : undefined;
    if (!override) return c;
    const end_date = !c.end_date || override < c.end_date ? override : c.end_date;
    return { ...c, end_date };
  });

  // Each package's own household member's ordinary salary is replaced by
  // their own garden-leave pay (during notice) and then their own net
  // severance lump sum — both computed above — so their salary income row
  // must stop being counted from their own severance_start_date, regardless
  // of what end_date it was left with. Other income (their own non-salary
  // income, or anyone else's) is untouched.
  //
  // Only auto-applies when the salary row is single-owned by that member
  // (0 or 2+ splits are left uncapped) — a salary split across multiple
  // people is a genuine edge case this can't correctly cut off just one
  // person's share of via a single end_date without also zeroing out
  // their co-owner's share.
  const salaryCutoffByMember = new Map(
    packages.map((pkg) => [pkg.household_member_id, addDays(pkg.severance_start_date, -1)])
  );
  const incomeWithSeveranceCap = incomeRows.map((i) => {
    const splits = splitsByIncome.get(i.id) ?? [];
    const cutoff =
      i.type === "salary" && splits.length === 1
        ? salaryCutoffByMember.get(splits[0].household_member_id)
        : undefined;
    if (!cutoff) return i;
    const end_date = !i.end_date || cutoff < i.end_date ? cutoff : i.end_date;
    return { ...i, end_date };
  });

  const commitmentsByProfile = new Map<string, Commitment[]>();
  const incomeByProfile = new Map<string, ResolvedIncome[]>();
  for (const pid of profileIds) {
    commitmentsByProfile.set(
      pid,
      commitmentsWithPropertyEnds.filter((c) => c.profile_id === pid)
    );
    incomeByProfile.set(
      pid,
      incomeWithSeveranceCap
        .filter((i) => i.profile_id === pid)
        .map((i) => ({ ...i, splits: splitsByIncome.get(i.id) ?? [] }))
    );
  }

  const severances: SeveranceStream[] = packageSummaries.map((s) => ({
    householdMemberId: s.package.household_member_id,
    severanceStartDate: s.package.severance_start_date,
    includeGardenLeave: s.package.include_garden_leave,
    noticePeriodMonths: s.package.notice_period_months ?? 0,
    gardenLeaveNetMonthly: s.gardenLeaveNetMonthly ?? s.package.monthly_base_salary ?? 0,
    netSeveranceLumpSum: s.netSeverance ?? s.severanceGross,
  }));

  const runwayScenario: ResolvedSeveranceScenario = {
    startingBalance: scenario.starting_balance,
    severances,
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

  return { runwayScenario, packageSummaries, taxYear };
}
