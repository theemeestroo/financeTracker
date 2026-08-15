import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurrentTaxYear,
  calculateSocialContributions,
  taxableWageIncome,
  calculateNetIncome,
  annualPersonTaxSummary,
  clampToAvailableTaxYear,
} from "@/lib/tax";
import { calculateSeveranceNet } from "@/lib/tax/fuenftelregelung";
import type { AnnualPersonTaxSummary, AnnualSeveranceTax } from "@/lib/tax";
import {
  calculateSeverancePackage,
  mergeScenarioEvents,
  mergeScenarioPropertyEnds,
  mergeScenarioSavingsRules,
} from "@/lib/severance";
import {
  alg1DurationMonths,
  alg1MonthlyNet,
  assessSperrzeitRisk,
  monthlyHealthInsuranceCost,
  SPERRZEIT_WEEKS,
} from "@/lib/unemployment";
import {
  activeCommitments,
  activeIncome,
  totalMonthlyCommitments,
  totalMonthlyNetIncome,
} from "@/lib/finance/dashboard";
import { addDays, addMonths, ageInYears } from "@/lib/finance/date-utils";
import type { Split } from "@/lib/finance/splits";
import { toTaxProfile } from "@/lib/finance/tax-profile-context";
import { healthInsuranceOutgoings } from "@/lib/finance/health-insurance-outgoing";
import { aggregateAnnualIncomeByMember, precedingMonthsSeries, resolveSavingsPrincipal } from "@/lib/runway";
import { combinedIncomeBreakdown } from "@/lib/finance/income-gross";
import type {
  ResolvedIncome,
  ResolvedSavingsRule,
  ResolvedSeveranceScenario,
  RunwayResult,
  SeveranceStream,
} from "@/lib/runway";
import type {
  Commitment,
  HouseholdMember,
  Income,
  IncomeSplit,
  SeveranceGlobalEventOverride,
  SeveranceGlobalPropertyEndOverride,
  SeveranceGlobalSavingsRuleOverride,
  SeveranceScenario,
  SeveranceScenarioEvent,
  SeveranceScenarioPackage,
  SeveranceScenarioPropertyEnd,
  SeveranceScenarioSavingsRule,
  TaxProfileRow,
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

export type ScenarioTotals = {
  earliestStart: string | null;
  /** Sum of each package's own severanceGross — deliberately excludes
   *  noticePayGross (garden-leave wage continuation, not the severance
   *  lump itself), so this is comparable across scenarios regardless of
   *  whether garden leave is included. */
  totalGrossSeverance: number;
  /** Sum of net severance across packages — null when *any* package's
   *  member has no tax profile yet, since a partial total (mixing real net
   *  figures with an implicit gross-as-net for the rest) would be silently
   *  wrong in a way that isn't visible. */
  totalNetSeverance: number | null;
  algMonthlyNetTotal: number;
  /** Gross and net attributed to each package's own household member, for
   *  a per-person breakdown display — `net` is null (not gross-substituted)
   *  when that member has no tax profile yet, since callers showing gross
   *  alongside it don't need net silently standing in for it. */
  severanceByMember: { householdMemberId: string; gross: number; net: number | null }[];
};

/** Shared by the scenario list and compare pages — the small set of
 *  headline totals every scenario tile/row shows, derived once from
 *  `resolveScenario`'s `packageSummaries` rather than duplicated per page. */
export function scenarioTotals(packageSummaries: ScenarioPackageSummary[]): ScenarioTotals {
  const earliestStart = packageSummaries.reduce<string | null>(
    (earliest, s) =>
      !earliest || s.package.severance_start_date < earliest ? s.package.severance_start_date : earliest,
    null
  );
  const totalGrossSeverance = packageSummaries.reduce((sum, s) => sum + s.severanceGross, 0);
  const totalNetSeverance = packageSummaries.every((s) => s.netSeverance != null)
    ? packageSummaries.reduce((sum, s) => sum + (s.netSeverance ?? 0), 0)
    : null;
  const algMonthlyNetTotal = packageSummaries.reduce((sum, s) => sum + s.algMonthlyNet, 0);
  const severanceByMember = packageSummaries.map((s) => ({
    householdMemberId: s.package.household_member_id,
    gross: s.severanceGross,
    net: s.netSeverance,
  }));

  return { earliestStart, totalGrossSeverance, totalNetSeverance, algMonthlyNetTotal, severanceByMember };
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
  /** Notice period's actual end (severance start + notice_period_months) —
   *  when garden leave/the lump sum land, per lib/runway/project-runway.ts.
   *  Distinct from algStartDate below, which is this plus any deferral/Sperrzeit. */
  gardenLeaveEndDate: string;
  // ALG I + post-severance health insurance (§2.1-2.2) — all 0/dates-equal
  // when claim_unemployment_benefit is off or eligibility isn't met.
  algDurationMonths: number;
  algMonthlyNet: number;
  algStartDate: string;
  algEndDate: string;
  healthGapMonthly: number;
  healthAlgMonthly: number;
  // Sperrzeit risk (§2.3) — atRisk shifts algStartDate/algEndDate below.
  sperrzeitAtRisk: boolean;
  sperrzeitReason: string | null;
  /** True when the package's own sperrzeit_safe_confirmed flag bypassed the
   *  risk heuristic — a user assertion, not something this app verified. */
  sperrzeitOverridden: boolean;
};

// The runway engine steps month-by-month, so the legally-precise 12-week
// Sperrzeit gets rounded to whole months here, same as notice_period_months/
// unemployment_benefit_defer_months already are before feeding addMonths.
const SPERRZEIT_MONTHS = Math.round((SPERRZEIT_WEEKS * 7) / 30);

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

  const [
    { data: packageRows },
    { data: phaseRows },
    { data: eventRows },
    { data: globalEventRows },
    { data: eventOverrideRows },
    { data: taxProfiles },
    { data: memberRows },
    { data: savingsRuleRows },
    { data: globalSavingsRuleRows },
    { data: savingsRuleOverrideRows },
    { data: allIncomeRows },
  ] = await Promise.all([
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
      // scope="global" rows have scenario_id=null, so this already excludes
      // them — global events are fetched separately below and merged in.
      supabase.from("severance_scenario_events").select("*").eq("scenario_id", scenario.id),
      supabase.from("severance_scenario_events").select("*").eq("scope", "global"),
      supabase.from("severance_global_event_overrides").select("*").eq("scenario_id", scenario.id),
      supabase
        .from("tax_profiles")
        .select("id, household_member_id, tax_class, church_tax, church_tax_state, has_children"),
      supabase
        .from("household_members")
        .select(
          "id, name, created_at, date_of_birth, statutory_health_insurance, health_insurance_addon_rate, private_health_insurance_monthly_premium, count_private_health_insurance_as_outgoing"
        ),
      // Same scope="global" exclusion as events above.
      supabase.from("severance_scenario_savings_rules").select("*").eq("scenario_id", scenario.id),
      supabase.from("severance_scenario_savings_rules").select("*").eq("scope", "global"),
      supabase.from("severance_global_savings_rule_overrides").select("*").eq("scenario_id", scenario.id),
      // Fetched unscoped by profile (RLS already limits this to the
      // household's own rows) — needed below to fold non-salary income into
      // the severance's own Fünftelregelung base *before* profileIds (which
      // depends on phases) would otherwise be known, and reused again later
      // for the runway's per-profile income instead of a second query.
      supabase
        .from("income")
        .select(
          "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
        ),
    ]);

  const packages = (packageRows ?? []) as SeveranceScenarioPackage[];
  const allTaxProfileRows = (taxProfiles ?? []) as TaxProfileRow[];
  const householdMembers = (memberRows ?? []) as HouseholdMember[];
  const memberById = new Map(householdMembers.map((m) => [m.id, m]));
  const allTaxProfiles = allTaxProfileRows.map((row) => toTaxProfile(row, memberById.get(row.household_member_id)));
  const taxProfileByMember = new Map(allTaxProfiles.map((p) => [p.household_member_id, p]));
  const taxProfileById = new Map(allTaxProfiles.map((p) => [p.id, p]));

  const incomeRows = (allIncomeRows ?? []) as Income[];
  const { data: incomeSplitRows } = await supabase
    .from("income_splits")
    .select("id, income_id, household_member_id, percentage")
    .in("income_id", incomeRows.map((i) => i.id));
  const splitsByIncome = new Map<string, Split[]>();
  for (const s of (incomeSplitRows ?? []) as IncomeSplit[]) {
    splitsByIncome.set(s.income_id, [...(splitsByIncome.get(s.income_id) ?? []), s]);
  }

  // Non-salary income (rental/part-time/other) a severed member also has,
  // attributed to them via their split share, annualized — folded into the
  // severance's own Fünftelregelung base below. It's genuine additional
  // taxable income for the same person in the same tax year and isn't
  // otherwise represented there (unlike salary, which the package's own
  // `monthly_base_salary` already stands in for — excluded here so it isn't
  // double-counted). Without this, a person with meaningful rental income
  // alongside their severance had that severance's own progressive-bracket
  // push computed against too small a base, understating its real tax.
  const nonSalaryAnnualGrossByMember = new Map<string, number>();
  for (const share of combinedIncomeBreakdown(
    incomeRows.filter((i) => i.type !== "salary"),
    (id) => splitsByIncome.get(id) ?? [],
    taxProfileByMember,
    taxYear
  )) {
    if (!share.householdMemberId) continue;
    const annual = share.gross.recurringMonthlyGross * 12;
    nonSalaryAnnualGrossByMember.set(
      share.householdMemberId,
      (nonSalaryAnnualGrossByMember.get(share.householdMemberId) ?? 0) + annual
    );
  }

  // ── Package + net severance, one per person ────────────────────────────
  const packageSummaries: ScenarioPackageSummary[] = packages.map((pkg) => {
    const memberTaxProfile = taxProfileByMember.get(pkg.household_member_id);
    const packageResult = calculateSeverancePackage(pkg);
    let netSeverance: number | null = null;
    let taxOnSeverance: number | null = null;
    let taxSaving: number | null = null;
    let gardenLeaveNetMonthly: number | null = null;

    if (memberTaxProfile) {
      const grossAnnual =
        (pkg.monthly_base_salary ?? 0) * 12 +
        pkg.annual_bonus +
        (nonSalaryAnnualGrossByMember.get(pkg.household_member_id) ?? 0);
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

    // ── ALG I eligibility/amount + post-severance health insurance ───────
    const member = memberById.get(pkg.household_member_id);
    const age = member?.date_of_birth ? ageInYears(member.date_of_birth, pkg.severance_start_date) : null;
    const insuredMonths = pkg.months_insured_override ?? (pkg.years_of_service ?? 0) * 12;
    const algDurationMonths = pkg.claim_unemployment_benefit
      ? alg1DurationMonths(insuredMonths, age, taxYear)
      : 0;
    const algMonthlyNet =
      algDurationMonths > 0
        ? alg1MonthlyNet(pkg.monthly_base_salary ?? 0, memberTaxProfile?.has_children ?? false, taxYear)
        : 0;

    const sperrzeit = assessSperrzeitRisk(pkg, packageResult.severanceGross);

    const naturalAlgStart = pkg.include_garden_leave
      ? addMonths(pkg.severance_start_date, Math.round(pkg.notice_period_months ?? 0))
      : pkg.severance_start_date;
    const deferredAlgStart = addMonths(naturalAlgStart, Math.round(pkg.unemployment_benefit_defer_months));
    // Sperrzeit shifts the claim start additively on top of any manual
    // deferral (deliberately conservative — see DESIGN v2 §7 for why this
    // likely overstates rather than understates the delay).
    const algStartDate = sperrzeit.atRisk
      ? addMonths(deferredAlgStart, SPERRZEIT_MONTHS)
      : deferredAlgStart;
    const algEndDate = algDurationMonths > 0 ? addMonths(algStartDate, algDurationMonths) : algStartDate;

    const healthGapMonthly = memberTaxProfile
      ? monthlyHealthInsuranceCost(memberTaxProfile, "gap", taxYear)
      : 0;
    const healthAlgMonthly = memberTaxProfile
      ? monthlyHealthInsuranceCost(memberTaxProfile, "alg1", taxYear)
      : 0;

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
      gardenLeaveEndDate: naturalAlgStart,
      algDurationMonths,
      algMonthlyNet,
      algStartDate,
      algEndDate,
      healthGapMonthly,
      healthAlgMonthly,
      sperrzeitAtRisk: sperrzeit.atRisk,
      sperrzeitReason: sperrzeit.reason,
      sperrzeitOverridden: sperrzeit.overridden,
    };
  });

  // ── Runway inputs ────────────────────────────────────────────────────
  const phases = phaseRows ?? [];
  if (phases.length === 0 || packages.length === 0) {
    return { runwayScenario: null, packageSummaries, taxYear };
  }

  // incomeRows/splitsByIncome were already fetched above (unscoped by
  // profile, for the Fünftelregelung base) — the per-profile filtering
  // below (incomeByProfile) is enough to scope them to this scenario.
  const profileIds = Array.from(new Set(phases.map((p) => p.profile_id)));
  const [{ data: allCommitments }, { data: propertyEndRows }, { data: globalPropertyEndRows }, { data: propertyEndOverrideRows }] =
    await Promise.all([
      supabase
        .from("commitments")
        .select(
          "id, profile_id, name, category, amount, frequency, essential, start_date, end_date, property_id"
        )
        .in("profile_id", profileIds),
      // scope="global" rows have scenario_id=null, so this already excludes
      // them — global property-ends are fetched separately below and merged in.
      supabase.from("severance_scenario_property_ends").select("*").eq("scenario_id", scenario.id),
      supabase.from("severance_scenario_property_ends").select("*").eq("scope", "global"),
      supabase.from("severance_global_property_end_overrides").select("*").eq("scenario_id", scenario.id),
    ]);

  // This scenario's own "end this property" rows plus every applicable
  // global one (override-aware) — caps the effective end_date of every
  // commitment linked to that property, without touching the property or
  // its commitments outside where this applies. When both a scenario-scoped
  // and a global row target the same property (not the normal case outside
  // a stale duplicate — see `mergeScenarioPropertyEnds`'s own comment), the
  // scenario-scoped one wins as the more specific choice.
  const mergedPropertyEnds = mergeScenarioPropertyEnds(
    (propertyEndRows ?? []) as SeveranceScenarioPropertyEnd[],
    (globalPropertyEndRows ?? []) as SeveranceScenarioPropertyEnd[],
    (propertyEndOverrideRows ?? []) as SeveranceGlobalPropertyEndOverride[]
  );
  // mergeScenarioPropertyEnds always returns scenario-scoped rows before
  // global ones, so the first entry seen per property here is the
  // scenario-scoped one whenever both exist.
  const propertyEndByPropertyId = new Map<string, string>();
  for (const pe of mergedPropertyEnds) {
    if (!propertyEndByPropertyId.has(pe.property_id)) propertyEndByPropertyId.set(pe.property_id, pe.end_date);
  }
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

  // Same reasoning as the salary cutoff above, but for the synthesized PKV
  // "private health insurance" outgoing (lib/finance/health-insurance-outgoing.ts):
  // a severed member's own premium stops being counted as an ordinary
  // outgoing once their post-employment health-insurance regime
  // (healthGapMonthly/healthAlgMonthly below) takes over — at
  // gardenLeaveEndDate, not severance_start_date, since garden leave is
  // still "employed" for this purpose. Other household members (not
  // severed in this scenario) get no cutoff — the cost is simply ongoing.
  const healthInsuranceCutoffByMember = new Map(
    packageSummaries.map((s) => [s.package.household_member_id, addDays(s.gardenLeaveEndDate, -1)])
  );
  const healthInsuranceCommitments = healthInsuranceOutgoings(
    householdMembers,
    "virtual",
    healthInsuranceCutoffByMember
  );

  const commitmentsByProfile = new Map<string, Commitment[]>();
  const incomeByProfile = new Map<string, ResolvedIncome[]>();
  for (const pid of profileIds) {
    commitmentsByProfile.set(
      pid,
      commitmentsWithPropertyEnds.filter((c) => c.profile_id === pid).concat(healthInsuranceCommitments)
    );
    incomeByProfile.set(
      pid,
      incomeWithSeveranceCap
        .filter((i) => i.profile_id === pid)
        .map((i) => ({ ...i, splits: splitsByIncome.get(i.id) ?? [] }))
    );
  }

  // Savings/investment rules — resolve amount-vs-percentage against that
  // package's own severance base (net, same net-first/gross-fallback
  // convention as netSeveranceLumpSum below) into a flat EUR principal,
  // which then compounds forward as its own segregated pot independent of
  // the household's running balance (see lib/runway/savings.ts), anchored
  // to the same gardenLeaveEndDate the health-insurance cutoff above uses —
  // the month the lump sum actually lands. Scenario-scoped rows validate
  // against their own package directly; global rows (see global-items.ts)
  // resolve against *this scenario's* package for the rule's household
  // member, with any scenario-local override already folded in.
  const packageSummaryById = new Map(packageSummaries.map((s) => [s.package.id, s]));
  const packageIdByMember = new Map(packageSummaries.map((s) => [s.package.household_member_id, s.package.id]));
  const mergedSavingsRules = mergeScenarioSavingsRules(
    (savingsRuleRows ?? []) as SeveranceScenarioSavingsRule[],
    (globalSavingsRuleRows ?? []) as SeveranceScenarioSavingsRule[],
    (savingsRuleOverrideRows ?? []) as SeveranceGlobalSavingsRuleOverride[],
    packageIdByMember
  );
  const savingsRules: ResolvedSavingsRule[] = mergedSavingsRules
    .map((rule) => {
      const summary = packageSummaryById.get(rule.packageId);
      if (!summary) return null; // package deleted out from under an orphaned rule
      const severanceBase = summary.netSeverance ?? summary.severanceGross;
      const principal = resolveSavingsPrincipal(rule, severanceBase);
      const memberName = memberById.get(summary.package.household_member_id)?.name ?? "—";
      return {
        id: rule.id,
        householdMemberId: summary.package.household_member_id,
        label: `${memberName} — ${rule.name}`,
        principal,
        annualReturnPct: rule.annual_return_pct,
        accrualFrequency: rule.accrual_frequency,
        startMonth: summary.gardenLeaveEndDate,
      } satisfies ResolvedSavingsRule;
    })
    .filter((r): r is ResolvedSavingsRule => r !== null);

  const severances: SeveranceStream[] = packageSummaries.map((s) => ({
    householdMemberId: s.package.household_member_id,
    householdMemberName: memberById.get(s.package.household_member_id)?.name ?? "—",
    severanceStartDate: s.package.severance_start_date,
    includeGardenLeave: s.package.include_garden_leave,
    noticePeriodMonths: s.package.notice_period_months ?? 0,
    gardenLeaveNetMonthly: s.gardenLeaveNetMonthly ?? s.package.monthly_base_salary ?? 0,
    gardenLeaveGrossMonthly: s.package.monthly_base_salary ?? 0,
    netSeveranceLumpSum: s.netSeverance ?? s.severanceGross,
    algMonthlyNet: s.algMonthlyNet,
    algStartDate: s.algStartDate,
    algEndDate: s.algEndDate,
    newJobStartDate: s.package.new_job_start_date,
    healthGapMonthly: s.healthGapMonthly,
    healthAlgMonthly: s.healthAlgMonthly,
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
    events: mergeScenarioEvents(
      (eventRows ?? []) as SeveranceScenarioEvent[],
      (globalEventRows ?? []) as SeveranceScenarioEvent[],
      (eventOverrideRows ?? []) as SeveranceGlobalEventOverride[]
    ).map((e) => ({
      name: e.name,
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
    savingsRules,
    taxProfileByMember,
    taxYear,
  };

  return { runwayScenario, packageSummaries, taxYear };
}

/**
 * Per-person, per-calendar-year tax summaries (DESIGN-agnostic "Tax" tab
 * data) — built from the *projected* runway rather than recomputed from
 * scratch, so it always agrees with what the Cash Flow tab already shows:
 * regular income (salary/rental/garden leave/…) via
 * `aggregateAnnualIncomeByMember`, one severance lump sum segment per
 * (person, year) reused as-is from `packageSummaries` (its own
 * Fünftelregelung figures, not retaxed here). Takes the already-projected
 * `runway` rather than a scenario, since the page computes that once via
 * `projectRunway` and both the Cash Flow chart and this need the same run.
 *
 * A mid-year severance start means the runway's own series only covers
 * from that month onward — correct for the balance projection, but it
 * would understate the transition year's tax position by missing the
 * months actually earned before the severance began. `precedingMonthsSeries`
 * backfills January through the month before the runway's start (same
 * per-phase income/commitment logic as the real projection); only its
 * `inflows` matter here (the aggregation below never reads outflows or
 * balance), so it's the same source used for the Cash Flow tab's own
 * "show me the whole year" extension.
 */
export function buildAnnualTaxSummaries(
  runwayScenario: ResolvedSeveranceScenario,
  runway: RunwayResult,
  packageSummaries: ScenarioPackageSummary[]
): AnnualPersonTaxSummary[] {
  const taxProfileByMember = runwayScenario.taxProfileByMember;
  const allIncomePoints = [...precedingMonthsSeries(runwayScenario), ...runway.series];

  const severanceByKey = new Map<string, AnnualSeveranceTax>();
  for (const s of packageSummaries) {
    if (s.netSeverance == null) continue; // no tax profile — nothing to attribute yet
    const year = Number(s.gardenLeaveEndDate.slice(0, 4));
    const key = `${s.package.household_member_id}::${year}`;
    const existing = severanceByKey.get(key) ?? { gross: 0, totalTax: 0, net: 0 };
    severanceByKey.set(key, {
      gross: existing.gross + s.severanceGross,
      totalTax: existing.totalTax + (s.taxOnSeverance ?? 0),
      net: existing.net + s.netSeverance,
    });
  }

  const seenKeys = new Set<string>();
  const summaries: AnnualPersonTaxSummary[] = [];

  for (const entry of aggregateAnnualIncomeByMember(allIncomePoints)) {
    const profile = taxProfileByMember.get(entry.householdMemberId);
    if (!profile) continue;
    const key = `${entry.householdMemberId}::${entry.year}`;
    seenKeys.add(key);
    // A 10-year horizon routinely reaches calendar years with no published
    // tax formula yet — compute at the latest known year's rates (same
    // assumption the runway projection itself already makes) but keep the
    // real calendar year for display/grouping.
    const summary = annualPersonTaxSummary(
      entry.householdMemberId,
      clampToAvailableTaxYear(entry.year),
      entry.sources,
      entry.taxFreeGross,
      profile,
      severanceByKey.get(key),
      entry.investmentGross
    );
    summaries.push({ ...summary, year: entry.year });
  }

  // A severance lump sum can land in a year with no *other* attributed
  // income (e.g. it lands in January with no garden leave beforehand) —
  // the aggregation above wouldn't have produced an entry for that year,
  // so add one covering just the severance.
  for (const [key, severance] of severanceByKey) {
    if (seenKeys.has(key)) continue;
    const [householdMemberId, yearStr] = key.split("::");
    const profile = taxProfileByMember.get(householdMemberId);
    if (!profile) continue;
    const year = Number(yearStr);
    const summary = annualPersonTaxSummary(
      householdMemberId,
      clampToAvailableTaxYear(year),
      [],
      0,
      profile,
      severance
    );
    summaries.push({ ...summary, year });
  }

  return summaries.sort((a, b) => a.year - b.year || a.householdMemberId.localeCompare(b.householdMemberId));
}
