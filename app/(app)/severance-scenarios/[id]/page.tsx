import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CalendarRange,
  Copy,
  CopyPlus,
  Home,
  Landmark,
  LayoutGrid,
  LineChart,
  ListChecks,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  RotateCcw,
  Route,
  Scissors,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveScenario, buildAnnualTaxSummaries } from "../resolve-scenario";
import { deleteScenario } from "../actions";
import { duplicateScenario } from "../duplicate-actions";
import {
  projectRunway,
  projectDoNothingBaseline,
  sensitivityAnalysis,
  precedingMonthsSeries,
  resolveSavingsPrincipal,
} from "@/lib/runway";
import { getBaselineRunwayInputs } from "@/lib/finance/baseline-profile";
import { pensionWartezeitTimeline, mergeScenarioEvents, mergeScenarioSavingsRules } from "@/lib/severance";
import {
  addScenarioEvent,
  deleteScenarioEvent,
  setEventOverride,
  clearEventOverride,
  duplicateGlobalEventIntoScenario,
} from "../event-actions";
import { addScenarioPhase, deleteScenarioPhase } from "../phase-actions";
import { addScenarioPackage, deleteScenarioPackage } from "../package-actions";
import { addScenarioPropertyEnd, deleteScenarioPropertyEnd } from "../property-end-actions";
import { generateScenarioVariants } from "../variant-actions";
import { addChecklistItem, deleteChecklistItem, toggleChecklistItem } from "../checklist-actions";
import {
  addSavingsRule,
  deleteSavingsRule,
  setSavingsRuleOverride,
  clearSavingsRuleOverride,
  duplicateGlobalSavingsRuleIntoScenario,
} from "../savings-rule-actions";
import { EventForm } from "../event-form";
import { PhaseForm } from "../phase-form";
import { PackageForm } from "../package-form";
import { PropertyEndForm } from "../property-end-form";
import { VariantGeneratorForm } from "../variant-generator-form";
import { ChecklistItemForm } from "../checklist-item-form";
import { SensitivityEntryRow } from "../sensitivity-entry";
import { SavingsRuleForm, type PackageAllocationOption } from "../savings-rule-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { AddDisclosure } from "@/components/add-disclosure";
import { TitleIcon } from "@/components/title-icon";
import { OverridePopover } from "@/components/override-popover";
import { ChecklistItemCheckbox } from "@/components/checklist-item-checkbox";
import { RunwayProjection } from "@/components/charts/runway-projection";
import { TaxBracketBar } from "@/components/charts/tax-bracket-bar";
import { formatEUR } from "@/lib/finance/frequency";
import { todayISO } from "@/lib/finance/dashboard";
import { formatDateDisplay, firstOfMonth } from "@/lib/finance/date-utils";
import { ACCRUAL_FREQUENCIES, SCENARIO_EVENT_TYPES } from "@/lib/types";
import type {
  HouseholdMember,
  LivingProfile,
  Property,
  ScenarioChecklistItem,
  SeveranceGlobalEventOverride,
  SeveranceGlobalSavingsRuleOverride,
  SeveranceScenario,
  SeveranceScenarioEvent,
  SeveranceScenarioPackage,
  SeveranceScenarioPropertyEnd,
  SeveranceScenarioSavingsRule,
} from "@/lib/types";

/** Hero metric tile — value stays neutral ink (per the dataviz skill: text
 *  wears text tokens, never the series color); only the icon chip and the
 *  optional `valueColor` (genuine status, e.g. depletion good/critical)
 *  carry an accent. */
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  valueColor,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <span
        className="flex size-9 items-center justify-center rounded-full"
        style={{ backgroundColor: `color-mix(in oklch, ${accent} 20%, transparent)`, color: accent }}
      >
        <Icon className="size-4.5" />
      </span>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className="text-2xl font-extrabold tabular-nums tracking-tight"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: scenario },
    { data: members },
    { data: profiles },
    { data: phaseRows },
    { data: eventRows },
    { data: globalEventRows },
    { data: eventOverrideRows },
    { data: properties },
    { data: propertyEndRows },
    { data: packageRows },
    { data: checklistRows },
    { data: savingsRuleRows },
    { data: globalSavingsRuleRows },
    { data: savingsRuleOverrideRows },
  ] = await Promise.all([
    supabase.from("severance_scenarios").select("*").eq("id", id).single(),
    supabase.from("household_members").select("id, name, created_at"),
    supabase.from("living_profiles").select("id, name, description, is_baseline").order("name"),
    supabase
      .from("severance_scenario_phases")
      .select("id, profile_id, start_date, label")
      .eq("scenario_id", id)
      .order("start_date"),
    supabase.from("severance_scenario_events").select("*").eq("scenario_id", id).order("date"),
    supabase.from("severance_scenario_events").select("*").eq("scope", "global").order("date"),
    supabase.from("severance_global_event_overrides").select("*").eq("scenario_id", id),
    supabase.from("properties").select("id, profile_id, name, address, notes, end_date").order("name"),
    supabase
      .from("severance_scenario_property_ends")
      .select("id, scenario_id, property_id, end_date")
      .eq("scenario_id", id)
      .order("end_date"),
    supabase
      .from("severance_scenario_packages")
      .select("*")
      .eq("scenario_id", id)
      .order("severance_start_date"),
    supabase
      .from("scenario_checklist_items")
      .select("id, scenario_id, template_key, label, due_date, completed, completed_at")
      .eq("scenario_id", id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("severance_scenario_savings_rules")
      .select("*")
      .eq("scenario_id", id)
      .order("created_at"),
    supabase.from("severance_scenario_savings_rules").select("*").eq("scope", "global").order("created_at"),
    supabase.from("severance_global_savings_rule_overrides").select("*").eq("scenario_id", id),
  ]);

  if (!scenario) notFound();

  const typedScenario = scenario as SeveranceScenario;
  const memberById = new Map(
    ((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name])
  );
  const profileById = new Map(
    ((profiles ?? []) as LivingProfile[]).map((p) => [p.id, p.name])
  );
  const propertyRows = (properties ?? []) as Property[];
  const propertyById = new Map(propertyRows.map((p) => [p.id, p.name]));
  const packages = (packageRows ?? []) as SeveranceScenarioPackage[];
  const checklistItems = (checklistRows ?? []) as ScenarioChecklistItem[];
  const onDate = todayISO();
  const openChecklistCount = checklistItems.filter((i) => !i.completed).length;

  const { runwayScenario, packageSummaries } = await resolveScenario(supabase, typedScenario);
  const runway = runwayScenario ? projectRunway(runwayScenario) : null;

  // Cash Flow tab display only — prepends the calendar months before a
  // mid-year severance start (Jan–Mar if it starts in April) so the chart
  // and month-breakdown table show the household's whole year. Doesn't
  // touch depletionDate/lowestBalance/lowestBalanceDate, which stay
  // anchored to the real projection — those measure the scenario's own
  // impact from the severance event onward, not the calendar year as a whole.
  const displayRunway =
    runway && runwayScenario
      ? { ...runway, series: [...precedingMonthsSeries(runwayScenario), ...runway.series] }
      : runway;

  // "Do-nothing" baseline overlay (DESIGN v2 §2.5) — the household's own
  // current situation, independent of this (or any) scenario; only shown
  // once current_liquid_savings is set on the baseline living profile.
  // Spans the same (possibly backfilled) dates as displayRunway so the two
  // lines overlay point-for-point rather than the baseline starting mid-chart.
  const baselineInputs = await getBaselineRunwayInputs(supabase);
  const baselineSeries =
    displayRunway && baselineInputs.currentLiquidSavings != null
      ? projectDoNothingBaseline(
          displayRunway.series.map((p) => p.date),
          baselineInputs.currentLiquidSavings,
          baselineInputs.monthlySurplus
        )
      : undefined;

  // Runway sensitivity panel (DESIGN v2 §2.6) — [] when the scenario is
  // already sustainable within the horizon, same "nothing to add" reasoning
  // sensitivityAnalysis documents itself.
  const sensitivity = runwayScenario ? sensitivityAnalysis(runwayScenario) : [];

  // Tax tab — per person, per calendar year, built from the same projected
  // runway the Cash Flow tab shows (see buildAnnualTaxSummaries's own
  // comment for why it's derived rather than recomputed independently).
  const annualTaxSummaries =
    runway && runwayScenario ? buildAnnualTaxSummaries(runwayScenario, runway, packageSummaries) : [];
  const taxYearsAvailable = Array.from(new Set(annualTaxSummaries.map((s) => s.year))).sort();
  // Default to the first year a severance lump sum actually lands — the
  // most interesting year tax-wise — falling back to the earliest year.
  const defaultTaxYear =
    annualTaxSummaries.find((s) => s.severance.gross > 0)?.year ?? taxYearsAvailable[0];

  // One-off events — this scenario's own rows merged with every applicable
  // global event (override-aware, "duplicate into this scenario" excluded)
  // — see global-items.ts. Shared with resolve-scenario.ts's own merge so
  // the Timeline tab can never disagree with what actually fed the projection.
  const mergedEvents = mergeScenarioEvents(
    (eventRows ?? []) as SeveranceScenarioEvent[],
    (globalEventRows ?? []) as SeveranceScenarioEvent[],
    (eventOverrideRows ?? []) as SeveranceGlobalEventOverride[]
  );

  // Savings/investment rules — this scenario's own rows merged with every
  // applicable global rule (resolved against this scenario's own package
  // for that rule's household member), then each resolved against its
  // package's net severance base (net ?? gross, same fallback used
  // throughout this page) for display — the same headroom the server
  // action itself re-validates.
  const packageIdByMember = new Map(packages.map((p) => [p.household_member_id, p.id]));
  const mergedSavingsRules = mergeScenarioSavingsRules(
    (savingsRuleRows ?? []) as SeveranceScenarioSavingsRule[],
    (globalSavingsRuleRows ?? []) as SeveranceScenarioSavingsRule[],
    (savingsRuleOverrideRows ?? []) as SeveranceGlobalSavingsRuleOverride[],
    packageIdByMember
  );
  const severanceBaseByPackage = new Map(
    packageSummaries.map((s) => [s.package.id, s.netSeverance ?? s.severanceGross])
  );
  const resolvedAmountByRule = new Map(
    mergedSavingsRules.map((rule) => [
      rule.id,
      resolveSavingsPrincipal(rule, severanceBaseByPackage.get(rule.packageId) ?? 0),
    ])
  );
  const packageOptions: PackageAllocationOption[] = packageSummaries.map((s) => ({
    id: s.package.id,
    memberName: memberById.get(s.package.household_member_id) ?? "—",
    severanceBase: s.netSeverance ?? s.severanceGross,
    alreadyAllocated: mergedSavingsRules
      .filter((r) => r.packageId === s.package.id)
      .reduce((sum, r) => sum + (resolvedAmountByRule.get(r.id) ?? 0), 0),
  }));

  const totalPackageGross = packageSummaries.reduce(
    (sum, s) => sum + s.severanceGross + s.noticePayGross,
    0
  );
  const combinedAlgMonthly = packageSummaries.reduce((sum, s) => sum + s.algMonthlyNet, 0);

  // Net severance, combined — the direct net counterpart to "Total package"
  // above (falls back to gross for a package whose member has no tax
  // profile yet, same convention the Savings tab's own headroom figures
  // already use). Per-person split only shown once there's more than one
  // package — a single person's split would just repeat the headline number.
  const totalNetSeverance = packageSummaries.reduce(
    (sum, s) => sum + (s.netSeverance ?? s.severanceGross),
    0
  );
  const netSeveranceByPerson = packageSummaries
    .map((s) => ({
      name: memberById.get(s.package.household_member_id) ?? "—",
      net: s.netSeverance ?? s.severanceGross,
    }))
    .map((p) => `${p.name} ${formatEUR(p.net)}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{typedScenario.name}</h1>
          {packages.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {packages.map((pkg) => (
                <Badge key={pkg.id} variant="outline" className="font-normal">
                  <User className="size-3" />
                  {memberById.get(pkg.household_member_id) ?? "—"} · starts{" "}
                  {formatDateDisplay(pkg.severance_start_date)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No severance packages yet.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/severance-scenarios/${id}/edit`} />}
          >
            <Pencil className="size-4" />
            Edit
          </Button>
          <form action={duplicateScenario.bind(null, id)}>
            <Button type="submit" variant="outline" size="sm">
              <Copy className="size-4" />
              Duplicate
            </Button>
          </form>
          <DeleteButton
            action={deleteScenario.bind(null, id, true)}
            confirmMessage={`Delete "${typedScenario.name}"? This removes its packages, phases, events, and everything else in it. This can't be undone.`}
          />
        </div>
      </div>

      {packages.length === 0 ? (
        <AddDisclosure label="Add package" icon={Plus}>
          <PackageForm
            action={addScenarioPackage.bind(null, id)}
            members={(members ?? []) as HouseholdMember[]}
          />
        </AddDisclosure>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile
              icon={CalendarClock}
              label="Runway status"
              value={
                runway
                  ? runway.depletionDate
                    ? formatDateDisplay(runway.depletionDate)
                    : "Sustainable"
                  : "—"
              }
              sub={runway && !runway.depletionDate ? "10yr horizon" : undefined}
              accent={runway?.depletionDate ? "var(--status-critical)" : "var(--status-good)"}
              valueColor={runway ? (runway.depletionDate ? "var(--status-critical)" : "var(--status-good)") : undefined}
            />
            <StatTile
              icon={Banknote}
              label="Net total"
              value={formatEUR(totalNetSeverance)}
              sub={
                packageSummaries.length > 1
                  ? netSeveranceByPerson
                  : `net · ${packageSummaries.length} ${packageSummaries.length === 1 ? "person" : "people"}`
              }
              accent="var(--series-2)"
            />
            <StatTile
              icon={ShieldCheck}
              label="Total package"
              value={formatEUR(totalPackageGross)}
              sub={`gross · ${packageSummaries.length} ${packageSummaries.length === 1 ? "person" : "people"}`}
              accent="var(--series-3)"
            />
            <StatTile
              icon={Sparkles}
              label="ALG I, combined"
              value={combinedAlgMonthly > 0 ? `${formatEUR(combinedAlgMonthly)}/mo` : "—"}
              accent="var(--series-4)"
            />
          </div>

          <Tabs defaultValue="overview">
            <div className="overflow-x-auto">
              <TabsList>
                <TabsIndicator />
                <TabsTab value="overview">
                  <LayoutGrid className="size-4" />
                  Overview
                </TabsTab>
                <TabsTab value="cashflow">
                  <LineChart className="size-4" />
                  Cash Flow
                </TabsTab>
                <TabsTab value="spendanalysis">
                  <Scissors className="size-4" />
                  Spend Analysis
                </TabsTab>
                <TabsTab value="savings">
                  <PiggyBank className="size-4" />
                  Savings &amp; Investment
                </TabsTab>
                <TabsTab value="tax">
                  <Landmark className="size-4" />
                  Tax
                </TabsTab>
                <TabsTab value="timeline">
                  <Route className="size-4" />
                  Timeline
                </TabsTab>
                <TabsTab value="checklist">
                  <ListChecks className="size-4" />
                  Checklist
                  {openChecklistCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-background/25 px-1 text-[10px] tabular-nums">
                      {openChecklistCount}
                    </span>
                  )}
                </TabsTab>
              </TabsList>
            </div>

            {/* Overview — each person's negotiated package, in full. */}
            <TabsPanel value="overview">
              {packageSummaries.map((packageSummary) => {
                const pkg = packageSummary.package;
                const wartezeitTimeline = pensionWartezeitTimeline(
                  pkg.employment_start_date,
                  pkg.severance_start_date ?? todayISO()
                );
                const memberName = memberById.get(pkg.household_member_id) ?? "—";
                // This person's own net severance, carried forward by the
                // household's *actual* projected cash-flow change from the
                // month it landed to the month their ALG I runs out — "if
                // you haven't found work by then, here's what's left of
                // your payout" is a more actionable checkpoint than the
                // re-employment date alone, and anchoring to their own net
                // severance (rather than the household's combined balance,
                // which could include another person's much larger package)
                // keeps it a genuinely per-person figure.
                const lumpSumMonth = firstOfMonth(packageSummary.gardenLeaveEndDate);
                const algEndMonth = firstOfMonth(packageSummary.algEndDate);
                const lumpSumBalance = runway?.series.find((p) => p.date === lumpSumMonth)?.balance ?? null;
                const algEndBalance = runway?.series.find((p) => p.date === algEndMonth)?.balance ?? null;
                const householdChangeSinceLumpSum =
                  lumpSumBalance != null && algEndBalance != null ? algEndBalance - lumpSumBalance : null;
                const severanceRemainingAfterAlg =
                  packageSummary.netSeverance != null && householdChangeSinceLumpSum != null
                    ? packageSummary.netSeverance + householdChangeSinceLumpSum
                    : null;
                return (
                  <Card key={pkg.id}>
                    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                      <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        <TitleIcon icon={User} accent="var(--series-1)" />
                        {memberName} — package breakdown
                        {pkg.employer_name ? ` · ${pkg.employer_name}` : ""} · starts{" "}
                        {formatDateDisplay(pkg.severance_start_date)}
                      </CardTitle>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          render={<Link href={`/severance-scenarios/${id}/packages/${pkg.id}/edit`} />}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteButton
                          action={deleteScenarioPackage.bind(null, pkg.id, id)}
                          confirmMessage={`Remove ${memberName}'s package?`}
                        />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                        <div>
                          <div className="text-xs text-muted-foreground">Gross severance</div>
                          <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                            {formatEUR(packageSummary.severanceGross)}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {packageSummary.isOverridden && (
                              <Badge variant="outline" className="text-xs font-normal">
                                Override
                              </Badge>
                            )}
                            {pkg.include_christmas_bonus_in_calc && (
                              <Badge variant="outline" className="text-xs font-normal">
                                + Xmas money
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Net (Fünftelregelung)</div>
                          <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                            {packageSummary.netSeverance != null
                              ? formatEUR(packageSummary.netSeverance)
                              : "—"}
                          </div>
                          {packageSummary.taxSaving != null && (
                            <div className="text-xs text-muted-foreground">
                              saves {formatEUR(packageSummary.taxSaving)} vs. marginal
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Garden leave (gross)</div>
                          <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                            {pkg.include_garden_leave ? formatEUR(packageSummary.noticePayGross) : "—"}
                          </div>
                          {packageSummary.gardenLeaveNetMonthly != null && (
                            <div className="text-xs text-muted-foreground">
                              {formatEUR(packageSummary.gardenLeaveNetMonthly)}/mo net
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Total package</div>
                          <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                            {formatEUR(packageSummary.severanceGross + packageSummary.noticePayGross)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-6 border-t border-border pt-4 sm:grid-cols-4">
                        <div>
                          <div className="text-xs text-muted-foreground">ALG I (net)</div>
                          <div className="text-lg font-bold tabular-nums tracking-tight">
                            {packageSummary.algMonthlyNet > 0
                              ? `${formatEUR(packageSummary.algMonthlyNet)}/mo`
                              : "—"}
                          </div>
                          {packageSummary.algMonthlyNet > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {formatDateDisplay(packageSummary.algStartDate)} –{" "}
                              {formatDateDisplay(packageSummary.algEndDate)}
                              {pkg.unemployment_benefit_defer_months > 0
                                ? ` (paused ${pkg.unemployment_benefit_defer_months}mo)`
                                : ""}
                              {packageSummary.sperrzeitAtRisk ? " (+ Sperrzeit shift)" : ""}
                            </div>
                          )}
                          {packageSummary.sperrzeitOverridden && (
                            <Badge
                              variant="outline"
                              className="mt-1 text-xs font-normal"
                              style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}
                            >
                              Sperrzeit waived
                            </Badge>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Health insurance, gap</div>
                          <div className="text-lg font-bold tabular-nums tracking-tight">
                            {packageSummary.healthGapMonthly > 0
                              ? `${formatEUR(packageSummary.healthGapMonthly)}/mo`
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Health insurance, on ALG I</div>
                          <div className="text-lg font-bold tabular-nums tracking-tight">
                            {packageSummary.healthAlgMonthly > 0
                              ? `${formatEUR(packageSummary.healthAlgMonthly)}/mo`
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Severance remaining after ALG I</div>
                          <div
                            className="text-lg font-bold tabular-nums tracking-tight"
                            style={
                              severanceRemainingAfterAlg != null && severanceRemainingAfterAlg < 0
                                ? { color: "var(--status-critical)" }
                                : undefined
                            }
                          >
                            {severanceRemainingAfterAlg != null ? formatEUR(severanceRemainingAfterAlg) : "—"}
                          </div>
                          {householdChangeSinceLumpSum != null && (
                            <div
                              className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium"
                              style={{
                                color:
                                  householdChangeSinceLumpSum >= 0
                                    ? "var(--status-good)"
                                    : "var(--status-critical)",
                              }}
                            >
                              {householdChangeSinceLumpSum >= 0 ? (
                                <ArrowUpRight className="size-3" />
                              ) : (
                                <ArrowDownRight className="size-3" />
                              )}
                              {formatEUR(Math.abs(householdChangeSinceLumpSum))}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {formatDateDisplay(packageSummary.algEndDate)}
                          </div>
                        </div>
                      </div>

                      {packageSummary.sperrzeitAtRisk && packageSummary.sperrzeitReason && (
                        <div
                          className="mt-4 rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}
                        >
                          <span className="font-semibold">Sperrzeit risk — </span>
                          {packageSummary.sperrzeitReason}
                        </div>
                      )}

                      {packageSummary.sperrzeitOverridden && packageSummary.sperrzeitReason && (
                        <div
                          className="mt-4 rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}
                        >
                          <span className="font-semibold">Sperrzeit waived — </span>
                          {packageSummary.sperrzeitReason}
                        </div>
                      )}

                      {!packageSummary.hasTaxProfile && (
                        <p className="mt-4 text-sm text-muted-foreground">
                          {memberName} has no tax profile yet, so net figures aren&apos;t available.{" "}
                          <Link href="/household" className="underline underline-offset-2">
                            Set one up
                          </Link>
                          .
                        </p>
                      )}
                      {wartezeitTimeline.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                          <span className="text-xs text-muted-foreground">Pension Wartezeit (5yr):</span>
                          {wartezeitTimeline.map((row) => (
                            <Badge
                              key={row.date}
                              variant="outline"
                              style={{
                                borderColor: row.eligible ? "var(--status-good)" : "var(--status-critical)",
                                color: row.eligible ? "var(--status-good)" : "var(--status-critical)",
                              }}
                            >
                              {formatDateDisplay(row.date)} (+{row.monthsFromNow}mo)
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              <AddDisclosure label="Add package" icon={Plus}>
                <PackageForm
                  action={addScenarioPackage.bind(null, id)}
                  members={(members ?? []) as HouseholdMember[]}
                />
              </AddDisclosure>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={Sparkles} accent="var(--series-4)" />
                    Generate variants (job-search timing)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <VariantGeneratorForm action={generateScenarioVariants.bind(null, id)} />
                </CardContent>
              </Card>
            </TabsPanel>

            {/* Cash Flow — assumptions feeding the projection, then the projection itself. */}
            <TabsPanel value="cashflow">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={TrendingUp} accent="var(--series-1)" />
                    Projected balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!displayRunway || displayRunway.series.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Add a severance package to see the projection.
                    </p>
                  ) : (
                    <>
                      <RunwayProjection runway={displayRunway} baselineSeries={baselineSeries} />
                      {!baselineSeries && (
                        <p className="mt-4 text-xs text-muted-foreground">
                          <Link href="/profiles" className="underline underline-offset-2">
                            Set your current liquid savings
                          </Link>{" "}
                          on the baseline profile to overlay a &quot;do-nothing&quot; reference line.
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={Receipt} accent="var(--series-3)" />
                    Assumed income &amp; costs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table aria-label="Assumed income and costs">
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Person</TableHead>
                        <TableHead scope="col">Item</TableHead>
                        <TableHead scope="col" className="text-right">
                          Amount
                        </TableHead>
                        <TableHead scope="col">From</TableHead>
                        <TableHead scope="col">To</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packageSummaries.flatMap((s) => {
                        const pkg = s.package;
                        const memberName = memberById.get(pkg.household_member_id) ?? "—";
                        const gardenLeaveEnd = pkg.include_garden_leave ? s.gardenLeaveEndDate : null;
                        const rows: { item: string; amount: string; from: string; to: string }[] = [];

                        if (pkg.include_garden_leave && s.gardenLeaveNetMonthly != null) {
                          rows.push({
                            item: "Garden leave (net)",
                            amount: `${formatEUR(s.gardenLeaveNetMonthly)}/mo`,
                            from: formatDateDisplay(pkg.severance_start_date),
                            to: gardenLeaveEnd ? formatDateDisplay(gardenLeaveEnd) : "—",
                          });
                        }
                        rows.push({
                          item: "Severance lump sum (net)",
                          amount:
                            s.netSeverance != null
                              ? formatEUR(s.netSeverance)
                              : `${formatEUR(s.severanceGross)} gross`,
                          from: formatDateDisplay(gardenLeaveEnd ?? pkg.severance_start_date),
                          to: "—",
                        });
                        if (s.algMonthlyNet > 0) {
                          rows.push({
                            item: `ALG I (net)${pkg.unemployment_benefit_defer_months > 0 ? ` — paused ${pkg.unemployment_benefit_defer_months}mo` : ""}${s.sperrzeitAtRisk ? " — Sperrzeit shift" : ""}${s.sperrzeitOverridden ? " — Sperrzeit waived" : ""}`,
                            amount: `${formatEUR(s.algMonthlyNet)}/mo`,
                            from: formatDateDisplay(s.algStartDate),
                            to: formatDateDisplay(s.algEndDate),
                          });
                        }
                        if (s.healthGapMonthly > 0) {
                          rows.push({
                            item: "Health insurance, self-funded gap",
                            amount: `-${formatEUR(s.healthGapMonthly)}/mo`,
                            from: formatDateDisplay(gardenLeaveEnd ?? pkg.severance_start_date),
                            to: s.algMonthlyNet > 0 ? formatDateDisplay(s.algStartDate) : "—",
                          });
                        }
                        if (s.healthAlgMonthly > 0 && s.algMonthlyNet > 0) {
                          rows.push({
                            item: "Health insurance, on ALG I",
                            amount: `-${formatEUR(s.healthAlgMonthly)}/mo`,
                            from: formatDateDisplay(s.algStartDate),
                            to: formatDateDisplay(s.algEndDate),
                          });
                        }

                        return rows.map((r, i) => (
                          <TableRow key={`${pkg.id}-${i}`}>
                            <TableCell className="font-medium">{memberName}</TableCell>
                            <TableCell className="text-muted-foreground">{r.item}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.amount}</TableCell>
                            <TableCell className="tabular-nums">{r.from}</TableCell>
                            <TableCell className="tabular-nums">{r.to}</TableCell>
                          </TableRow>
                        ));
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsPanel>

            {/* Spend Analysis — "if you cut X, how much longer does this last?" */}
            <TabsPanel value="spendanalysis">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={Sparkles} accent="var(--series-4)" />
                    Runway sensitivity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sensitivity.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {runway
                        ? "This scenario is already sustainable within the projection horizon — nothing to cut."
                        : "Add a severance package to see the projection."}
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 text-sm text-muted-foreground">
                        If you cut a discretionary category entirely, starting now — expand a row for the
                        individual commitments and the effect on the depletion date:
                      </p>
                      {sensitivity.map((entry) => (
                        <SensitivityEntryRow key={entry.category} entry={entry} />
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsPanel>

            {/* Savings & Investment — set aside part of a severance lump sum
                into its own segregated pot; the accrued return (never the
                principal, already counted once via the lump sum) shows up
                as income in the projection. Unrelated cash flows never
                inflate it, but it isn't fully walled off either — if
                overall spending draws the household's real balance below
                what's invested, the pot is drawn down to match. */}
            <TabsPanel value="savings">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={PiggyBank} accent="var(--series-2)" />
                    Savings &amp; investment rules
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {packageOptions.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Add a severance package first — a savings rule needs one to allocate from.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Each rule sets aside a fixed amount (or a % of that person&apos;s own severance) into
                        its own pot, which compounds on its own return from there — ordinary income never
                        inflates it. It&apos;s not fully walled off, though: if overall spending draws the
                        household&apos;s real balance below what&apos;s invested, the pot is drawn down to
                        match, since that money was never in a separate untouchable account.
                      </p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        {packageOptions.map((p) => (
                          <div key={p.id} className="rounded-2xl border border-border px-4 py-3">
                            <div className="font-medium">{p.memberName}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatEUR(p.alreadyAllocated)} allocated of {formatEUR(p.severanceBase)} net
                              severance — {formatEUR(Math.max(0, p.severanceBase - p.alreadyAllocated))}{" "}
                              available
                            </div>
                          </div>
                        ))}
                      </div>

                      {mergedSavingsRules.length > 0 && (
                        <Table aria-label="Savings and investment rules">
                          <TableHeader>
                            <TableRow>
                              <TableHead scope="col">Person</TableHead>
                              <TableHead scope="col">Name</TableHead>
                              <TableHead scope="col" className="text-right">
                                Allocation
                              </TableHead>
                              <TableHead scope="col" className="text-right">
                                Return
                              </TableHead>
                              <TableHead scope="col" className="text-right">
                                Example, /mo
                              </TableHead>
                              <TableHead scope="col">Accrued</TableHead>
                              <TableHead scope="col" className="w-56 text-right">
                                &nbsp;
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mergedSavingsRules.map((rule) => {
                              const option = packageOptions.find((p) => p.id === rule.packageId);
                              const resolved = resolvedAmountByRule.get(rule.id) ?? 0;
                              const exampleMonthly = (resolved * rule.annual_return_pct) / 100 / 12;
                              const currentOverrideValue =
                                rule.allocation_type === "percentage" ? rule.percentage : rule.amount;
                              return (
                                <TableRow key={rule.id}>
                                  <TableCell className="font-medium">{option?.memberName ?? "—"}</TableCell>
                                  <TableCell className="text-muted-foreground">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {rule.scope === "global" ? (
                                        <Link
                                          href={`/global-rules/savings-rules/${rule.id}/edit`}
                                          className="underline underline-offset-2"
                                        >
                                          {rule.name}
                                        </Link>
                                      ) : (
                                        rule.name
                                      )}
                                      <Badge variant="outline" className="text-xs font-normal">
                                        {rule.scope === "global" ? "Global" : "Scenario"}
                                      </Badge>
                                      {rule.isOverridden && (
                                        <Badge variant="outline" className="text-xs font-normal">
                                          Overridden here
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {rule.allocation_type === "percentage"
                                      ? `${rule.percentage}% (${formatEUR(resolved)})`
                                      : formatEUR(resolved)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {rule.annual_return_pct}%/yr
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">
                                    {formatEUR(exampleMonthly)}/mo
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {ACCRUAL_FREQUENCIES.find((f) => f.value === rule.accrual_frequency)?.label ??
                                      rule.accrual_frequency}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {rule.scope === "global" ? (
                                      <div className="flex justify-end gap-1.5">
                                        {rule.isOverridden && (
                                          <form
                                            action={clearSavingsRuleOverride.bind(null, rule.id, id)}
                                          >
                                            <Button
                                              type="submit"
                                              variant="ghost"
                                              size="icon"
                                              aria-label="Clear override"
                                            >
                                              <RotateCcw className="size-4" />
                                            </Button>
                                          </form>
                                        )}
                                        <OverridePopover
                                          action={setSavingsRuleOverride.bind(null, rule.id, id)}
                                          currentValue={currentOverrideValue}
                                        />
                                        <form
                                          action={duplicateGlobalSavingsRuleIntoScenario.bind(null, rule.id, id)}
                                        >
                                          <Button
                                            type="submit"
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Duplicate into this scenario"
                                          >
                                            <CopyPlus className="size-4" />
                                          </Button>
                                        </form>
                                      </div>
                                    ) : (
                                      <DeleteButton
                                        action={deleteSavingsRule.bind(null, rule.id, id)}
                                        confirmMessage={`Delete "${rule.name}"?`}
                                      />
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                      {mergedSavingsRules.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Example, /mo is the pot&apos;s starting gross return spread evenly across the year
                          (allocation × annual return ÷ 12) — a steady-state estimate before tax, not the
                          exact figure any single accrual period pays (that depends on the accrual frequency
                          above, grows over time as the pot compounds, and falls if the household&apos;s own
                          spending ever draws the pot down — see the Cash Flow tab for the actual month-by-month
                          figure).
                        </p>
                      )}

                      <AddDisclosure label="Add savings rule" icon={Plus}>
                        <SavingsRuleForm
                          action={addSavingsRule.bind(null, id)}
                          packages={packageOptions}
                          householdMembers={(members ?? []) as HouseholdMember[]}
                          showScopeToggle
                        />
                      </AddDisclosure>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsPanel>

            {/* Tax — per person, per year: the full annual tax position,
                folding in any severance lump sum landing that year
                (Fünftelregelung) and how much of taxable income falls in
                each progressive bracket. Net income everywhere else in
                this app stays netted at the point of calculation (gross
                now shown alongside it in the Cash Flow breakdown panel)
                rather than introducing a second, competing "tax as a
                separate outgoing" convention — this tab is where the full
                tax detail lives instead. */}
            <TabsPanel value="tax">
              {annualTaxSummaries.length === 0 ? (
                <Card>
                  <CardContent>
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {runway
                        ? "No taxed household member has income in this projection yet."
                        : "Add a severance package to see the projection."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Tabs defaultValue={String(defaultTaxYear)}>
                    <div className="overflow-x-auto">
                      <TabsList>
                        <TabsIndicator />
                        {taxYearsAvailable.map((year) => (
                          <TabsTab key={year} value={String(year)}>
                            {year}
                          </TabsTab>
                        ))}
                      </TabsList>
                    </div>

                    {taxYearsAvailable.map((year) => (
                      <TabsPanel key={year} value={String(year)}>
                        {annualTaxSummaries
                          .filter((s) => s.year === year)
                          .map((summary) => {
                            const memberName = memberById.get(summary.householdMemberId) ?? "—";
                            const effectiveRate =
                              summary.totalGrossAll > 0
                                ? (summary.totalTaxAll / summary.totalGrossAll) * 100
                                : 0;
                            return (
                              <Card key={summary.householdMemberId}>
                                <CardHeader>
                                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    <TitleIcon icon={User} accent="var(--series-1)" />
                                    {memberName} — {year}
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-5">
                                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                                    <div>
                                      <div className="text-xs text-muted-foreground">Gross income</div>
                                      <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                                        {formatEUR(summary.totalGrossAll)}
                                      </div>
                                      {summary.taxFreeIncome > 0 && (
                                        <div className="text-xs text-muted-foreground">
                                          incl. {formatEUR(summary.taxFreeIncome)} tax-free (ALG I)
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground">Taxable income</div>
                                      <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                                        {formatEUR(summary.taxableIncome)}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground">Total tax</div>
                                      <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                                        {formatEUR(summary.totalTaxAll)}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {effectiveRate.toFixed(1)}% effective
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground">Net income</div>
                                      <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                                        {formatEUR(summary.totalNetAll)}
                                      </div>
                                    </div>
                                  </div>

                                  {summary.incomeSources.length > 0 && (
                                    <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-4 text-sm">
                                      {summary.incomeSources.map((source) => (
                                        <div key={source.label} className="text-muted-foreground">
                                          {source.label}{" "}
                                          <span className="font-medium text-foreground">
                                            {formatEUR(source.grossAnnual)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="border-t border-border pt-4">
                                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                                      Income by tax bracket
                                    </div>
                                    <TaxBracketBar
                                      steps={summary.bracketSteps}
                                      severanceGross={summary.severance.gross}
                                      severanceTax={summary.severance.totalTax}
                                    />
                                  </div>

                                  {summary.investmentIncomeGross !== 0 && (
                                    <div className="border-t border-border pt-4">
                                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                                        Investment &amp; savings income{" "}
                                        <span className="font-normal text-muted-foreground/70">
                                          — flat Abgeltungsteuer, not part of the bracket above
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-6">
                                        <div>
                                          <div className="text-xs text-muted-foreground">Gross</div>
                                          <div className="text-lg font-bold tabular-nums tracking-tight">
                                            {formatEUR(summary.investmentIncomeGross)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-muted-foreground">Tax</div>
                                          <div className="text-lg font-bold tabular-nums tracking-tight">
                                            {formatEUR(summary.investmentIncomeTax)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-muted-foreground">Net</div>
                                          <div className="text-lg font-bold tabular-nums tracking-tight">
                                            {formatEUR(summary.investmentIncomeNet)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                                    <span>
                                      Income tax{" "}
                                      <span className="font-medium text-foreground">
                                        {formatEUR(summary.incomeTax)}
                                      </span>
                                    </span>
                                    {summary.soli > 0 && (
                                      <span>
                                        Soli{" "}
                                        <span className="font-medium text-foreground">
                                          {formatEUR(summary.soli)}
                                        </span>
                                      </span>
                                    )}
                                    {summary.churchTax > 0 && (
                                      <span>
                                        Church tax{" "}
                                        <span className="font-medium text-foreground">
                                          {formatEUR(summary.churchTax)}
                                        </span>
                                      </span>
                                    )}
                                    <span>
                                      Social contributions{" "}
                                      <span className="font-medium text-foreground">
                                        {formatEUR(summary.socialContributions)}
                                      </span>
                                    </span>
                                    {summary.severance.gross > 0 && (
                                      <span>
                                        Severance tax{" "}
                                        <span className="font-medium text-foreground">
                                          {formatEUR(summary.severance.totalTax)}
                                        </span>
                                      </span>
                                    )}
                                    {summary.investmentIncomeGross !== 0 && (
                                      <span>
                                        Investment tax{" "}
                                        <span className="font-medium text-foreground">
                                          {formatEUR(summary.investmentIncomeTax)}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                      </TabsPanel>
                    ))}
                  </Tabs>

                  <p className="text-xs text-muted-foreground">
                    Investment/savings returns (Savings &amp; Investment tab) are taxed separately
                    under the flat Abgeltungsteuer (~26.4% after the annual Sparerpauschbetrag
                    allowance) rather than the progressive bands shown above, but are included in the
                    gross/tax/net totals. ALG I is tax-free but can nudge the tax rate on other income
                    in the same year (Progressionsvorbehalt) — that effect isn&apos;t modeled.
                  </p>
                </>
              )}
            </TabsPanel>

            {/* Timeline — everything else that changes the projection over time. */}
            <TabsPanel value="timeline">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={CalendarRange} accent="var(--series-1)" />
                    Cost phases (Living Profile timeline)
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {(phaseRows ?? []).length > 0 && (
                    <Table aria-label="Scenario phases">
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">From</TableHead>
                          <TableHead scope="col">Profile</TableHead>
                          <TableHead scope="col">Label</TableHead>
                          <TableHead scope="col" className="w-12 text-right">
                            &nbsp;
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(phaseRows ?? []).map((phase) => (
                          <TableRow key={phase.id}>
                            <TableCell className="tabular-nums">
                              {formatDateDisplay(phase.start_date)}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/profiles/${phase.profile_id}`}
                                className="underline underline-offset-2"
                              >
                                {profileById.get(phase.profile_id) ?? "—"}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{phase.label ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              <DeleteButton
                                action={deleteScenarioPhase.bind(null, phase.id, id)}
                                confirmMessage="Remove this phase?"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <AddDisclosure label="Add phase" icon={Plus}>
                    <PhaseForm
                      action={addScenarioPhase.bind(null, id)}
                      profiles={(profiles ?? []) as LivingProfile[]}
                    />
                  </AddDisclosure>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={Home} accent="var(--series-2)" />
                    Property changes
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {((propertyEndRows ?? []) as SeveranceScenarioPropertyEnd[]).length > 0 && (
                    <Table aria-label="Scenario property changes">
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Property</TableHead>
                          <TableHead scope="col">Ends from</TableHead>
                          <TableHead scope="col" className="w-12 text-right">
                            &nbsp;
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {((propertyEndRows ?? []) as SeveranceScenarioPropertyEnd[]).map((pe) => (
                          <TableRow key={pe.id}>
                            <TableCell className="font-medium">
                              {propertyById.get(pe.property_id) ?? "—"}
                            </TableCell>
                            <TableCell className="tabular-nums">{formatDateDisplay(pe.end_date)}</TableCell>
                            <TableCell className="text-right">
                              <DeleteButton
                                action={deleteScenarioPropertyEnd.bind(null, pe.id, id)}
                                confirmMessage="Remove this property change?"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {propertyRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No properties yet —{" "}
                      <Link href="/properties" className="underline underline-offset-2">
                        add one
                      </Link>{" "}
                      to end it in this scenario.
                    </p>
                  ) : (
                    <AddDisclosure label="End a property" icon={Plus}>
                      <PropertyEndForm
                        action={addScenarioPropertyEnd.bind(null, id)}
                        properties={propertyRows}
                      />
                    </AddDisclosure>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={Sparkles} accent="var(--series-4)" />
                    One-off events &amp; new income
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {mergedEvents.length > 0 && (
                    <Table aria-label="Scenario events">
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Name</TableHead>
                          <TableHead scope="col">Type</TableHead>
                          <TableHead scope="col">Date</TableHead>
                          <TableHead scope="col" className="text-right">
                            Amount
                          </TableHead>
                          <TableHead scope="col" className="w-56 text-right">
                            &nbsp;
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mergedEvents.map((event) => {
                          const currentOverrideValue =
                            event.event_type === "recurring_income_start"
                              ? event.recurring_gross_amount
                              : event.amount;
                          return (
                            <TableRow key={event.id}>
                              <TableCell className="font-medium">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {event.scope === "global" ? (
                                    <Link
                                      href={`/global-rules/events/${event.id}/edit`}
                                      className="underline underline-offset-2"
                                    >
                                      {event.name}
                                    </Link>
                                  ) : (
                                    event.name
                                  )}
                                  <Badge variant="outline" className="text-xs font-normal">
                                    {event.scope === "global" ? "Global" : "Scenario"}
                                  </Badge>
                                  {event.isOverridden && (
                                    <Badge variant="outline" className="text-xs font-normal">
                                      Overridden here
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {SCENARIO_EVENT_TYPES.find((t) => t.value === event.event_type)?.label ??
                                  event.event_type}
                              </TableCell>
                              <TableCell className="tabular-nums">{formatDateDisplay(event.date)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {event.event_type === "recurring_income_start"
                                  ? `${formatEUR(event.recurring_gross_amount ?? 0)}/${event.recurring_frequency}`
                                  : formatEUR(event.amount ?? 0)}
                              </TableCell>
                              <TableCell className="text-right">
                                {event.scope === "global" ? (
                                  <div className="flex justify-end gap-1.5">
                                    {event.isOverridden && (
                                      <form action={clearEventOverride.bind(null, event.id, id)}>
                                        <Button
                                          type="submit"
                                          variant="ghost"
                                          size="icon"
                                          aria-label="Clear override"
                                        >
                                          <RotateCcw className="size-4" />
                                        </Button>
                                      </form>
                                    )}
                                    <OverridePopover
                                      action={setEventOverride.bind(null, event.id, id)}
                                      currentValue={currentOverrideValue}
                                    />
                                    <form action={duplicateGlobalEventIntoScenario.bind(null, event.id, id)}>
                                      <Button
                                        type="submit"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Duplicate into this scenario"
                                      >
                                        <CopyPlus className="size-4" />
                                      </Button>
                                    </form>
                                  </div>
                                ) : (
                                  <DeleteButton
                                    action={deleteScenarioEvent.bind(null, event.id, id)}
                                    confirmMessage={`Delete "${event.name}"?`}
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                  <AddDisclosure label="Add event" icon={Plus}>
                    <EventForm action={addScenarioEvent.bind(null, id)} showScopeToggle />
                  </AddDisclosure>
                </CardContent>
              </Card>
            </TabsPanel>

            {/* Checklist — auto-seeded from a static template once the first
                package gives it a date to anchor due dates from (§2.7). */}
            <TabsPanel value="checklist">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <TitleIcon icon={ListChecks} accent="var(--series-1)" />
                    Redundancy checklist
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {checklistItems.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {checklistItems.map((item) => {
                        const overdue = !item.completed && !!item.due_date && item.due_date < onDate;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <ChecklistItemCheckbox
                              action={toggleChecklistItem.bind(null, item.id, id, !item.completed)}
                              defaultChecked={item.completed}
                            />
                            <span
                              className={`flex-1 ${item.completed ? "text-muted-foreground line-through" : ""}`}
                            >
                              {item.label}
                            </span>
                            <span
                              className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
                              style={overdue ? { color: "var(--status-critical)" } : undefined}
                            >
                              <span
                                className={`size-1.5 shrink-0 rounded-full ${
                                  item.completed ? "bg-[var(--status-good)]" : "bg-foreground/30"
                                }`}
                                style={overdue ? { backgroundColor: "var(--status-critical)" } : undefined}
                                aria-hidden
                              />
                              {item.completed
                                ? "Done"
                                : item.due_date
                                  ? `${overdue ? "Overdue" : "Due"} ${formatDateDisplay(item.due_date)}`
                                  : "No due date"}
                            </span>
                            <DeleteButton
                              action={deleteChecklistItem.bind(null, item.id, id)}
                              confirmMessage={`Remove "${item.label}"?`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No checklist items yet.</p>
                  )}
                  <AddDisclosure label="Add item" icon={Plus}>
                    <ChecklistItemForm action={addChecklistItem.bind(null, id)} />
                  </AddDisclosure>
                </CardContent>
              </Card>
            </TabsPanel>
          </Tabs>
        </>
      )}
    </div>
  );
}
