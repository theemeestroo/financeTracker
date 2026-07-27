import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Banknote,
  CalendarClock,
  CalendarRange,
  Home,
  LayoutGrid,
  LineChart,
  ListChecks,
  Pencil,
  Plus,
  Receipt,
  Route,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveScenario } from "../resolve-scenario";
import { projectRunway } from "@/lib/runway";
import { pensionWartezeitTimeline } from "@/lib/severance";
import { addScenarioEvent, deleteScenarioEvent } from "../event-actions";
import { addScenarioPhase, deleteScenarioPhase } from "../phase-actions";
import { addScenarioPackage, deleteScenarioPackage } from "../package-actions";
import { addScenarioPropertyEnd, deleteScenarioPropertyEnd } from "../property-end-actions";
import { generateScenarioVariants } from "../variant-actions";
import { addChecklistItem, deleteChecklistItem, toggleChecklistItem } from "../checklist-actions";
import { EventForm } from "../event-form";
import { PhaseForm } from "../phase-form";
import { PackageForm } from "../package-form";
import { PropertyEndForm } from "../property-end-form";
import { VariantGeneratorForm } from "../variant-generator-form";
import { ChecklistItemForm } from "../checklist-item-form";
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
import { ChecklistItemCheckbox } from "@/components/checklist-item-checkbox";
import { RunwayProjection } from "@/components/charts/runway-projection";
import { formatEUR } from "@/lib/finance/frequency";
import { todayISO } from "@/lib/finance/dashboard";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import { SCENARIO_EVENT_TYPES } from "@/lib/types";
import type {
  HouseholdMember,
  LivingProfile,
  Property,
  ScenarioChecklistItem,
  SeveranceScenario,
  SeveranceScenarioPackage,
  SeveranceScenarioPropertyEnd,
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

/** Small icon chip used before a CardTitle's uppercase label — the same
 *  accent language as StatTile, at section-header scale. */
function TitleIcon({ icon: Icon, accent }: { icon: LucideIcon; accent: string }) {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: `color-mix(in oklch, ${accent} 20%, transparent)`, color: accent }}
    >
      <Icon className="size-3" />
    </span>
  );
}

/** A "+ Add X" disclosure — the plus rotates into a close glyph when open. */
function AddDisclosure({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-dashed border-border p-4 open:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden group-open:text-foreground">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-foreground transition-transform duration-200 group-open:rotate-45">
          <Icon className="size-3.5" />
        </span>
        {label}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
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
    { data: properties },
    { data: propertyEndRows },
    { data: packageRows },
    { data: checklistRows },
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

  const totalPackageGross = packageSummaries.reduce(
    (sum, s) => sum + s.severanceGross + s.noticePayGross,
    0
  );
  const combinedAlgMonthly = packageSummaries.reduce((sum, s) => sum + s.algMonthlyNet, 0);

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
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/severance-scenarios/${id}/edit`} />}
        >
          <Pencil className="size-4" />
          Edit
        </Button>
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              label="Lowest balance"
              value={runway ? formatEUR(runway.lowestBalance) : "—"}
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
                          <div className="text-xs text-muted-foreground">Return to work</div>
                          <div className="text-lg font-bold tabular-nums tracking-tight">
                            {pkg.new_job_start_date ? formatDateDisplay(pkg.new_job_start_date) : "—"}
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
                  {!runway || runway.series.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Add a severance package to see the projection.
                    </p>
                  ) : (
                    <RunwayProjection runway={runway} />
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
                  {(eventRows ?? []).length > 0 && (
                    <Table aria-label="Scenario events">
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Name</TableHead>
                          <TableHead scope="col">Type</TableHead>
                          <TableHead scope="col">Date</TableHead>
                          <TableHead scope="col" className="text-right">
                            Amount
                          </TableHead>
                          <TableHead scope="col" className="w-12 text-right">
                            &nbsp;
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(eventRows ?? []).map((event) => (
                          <TableRow key={event.id}>
                            <TableCell className="font-medium">{event.name}</TableCell>
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
                              <DeleteButton
                                action={deleteScenarioEvent.bind(null, event.id, id)}
                                confirmMessage={`Delete "${event.name}"?`}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <AddDisclosure label="Add event" icon={Plus}>
                    <EventForm action={addScenarioEvent.bind(null, id)} />
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
