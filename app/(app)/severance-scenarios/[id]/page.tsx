import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveScenario } from "../resolve-scenario";
import { projectRunway } from "@/lib/runway";
import { pensionWartezeitTimeline } from "@/lib/severance";
import { addScenarioEvent, deleteScenarioEvent } from "../event-actions";
import { addScenarioPhase, deleteScenarioPhase } from "../phase-actions";
import { addScenarioPackage, deleteScenarioPackage } from "../package-actions";
import { addScenarioPropertyEnd, deleteScenarioPropertyEnd } from "../property-end-actions";
import { EventForm } from "../event-form";
import { PhaseForm } from "../phase-form";
import { PackageForm } from "../package-form";
import { PropertyEndForm } from "../property-end-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { DepletionChart } from "@/components/charts/depletion-chart";
import { formatEUR } from "@/lib/finance/frequency";
import { todayISO } from "@/lib/finance/dashboard";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import { SCENARIO_EVENT_TYPES } from "@/lib/types";
import type {
  HouseholdMember,
  LivingProfile,
  Property,
  SeveranceScenario,
  SeveranceScenarioPackage,
  SeveranceScenarioPropertyEnd,
} from "@/lib/types";

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

  const { runwayScenario, packageSummaries } = await resolveScenario(supabase, typedScenario);
  const runway = runwayScenario ? projectRunway(runwayScenario) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{typedScenario.name}</h1>
          {packages.length > 0 ? (
            <div className="flex flex-col text-sm text-muted-foreground">
              {packages.map((pkg) => (
                <span key={pkg.id}>
                  {memberById.get(pkg.household_member_id) ?? "—"} · starts{" "}
                  {formatDateDisplay(pkg.severance_start_date)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No severance packages yet.</p>
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

      {/* Severance packages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Severance packages
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {packages.length > 0 && (
            <Table aria-label="Severance packages">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Person</TableHead>
                  <TableHead scope="col">Employer</TableHead>
                  <TableHead scope="col" className="text-right">
                    Gross severance
                  </TableHead>
                  <TableHead scope="col">Starts</TableHead>
                  <TableHead scope="col" className="w-20 text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => {
                  const summary = packageSummaries.find((s) => s.package.id === pkg.id);
                  return (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">
                        {memberById.get(pkg.household_member_id) ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {pkg.employer_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(summary?.severanceGross ?? 0)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDateDisplay(pkg.severance_start_date)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
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
                            confirmMessage={`Remove ${memberById.get(pkg.household_member_id) ?? "this"}'s package?`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <details className="rounded-lg border p-3" open={packages.length === 0}>
            <summary className="cursor-pointer text-sm font-medium">Add package</summary>
            <div className="mt-4">
              <PackageForm
                action={addScenarioPackage.bind(null, id)}
                members={(members ?? []) as HouseholdMember[]}
              />
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Package breakdown, per person (includes Pension Wartezeit) */}
      {packageSummaries.map((packageSummary) => {
        const wartezeitTimeline = pensionWartezeitTimeline(
          packageSummary.package.employment_start_date,
          packageSummary.package.severance_start_date ?? todayISO()
        );
        return (
          <Card key={packageSummary.package.id}>
            <CardHeader>
              <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {memberById.get(packageSummary.package.household_member_id) ?? "—"} — package breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Gross severance</div>
                  <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                    {formatEUR(packageSummary.severanceGross)}
                  </div>
                  {packageSummary.isOverridden && (
                    <Badge variant="outline" className="mt-1 text-xs font-normal">
                      Override
                    </Badge>
                  )}
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
                    {packageSummary.package.include_garden_leave
                      ? formatEUR(packageSummary.noticePayGross)
                      : "—"}
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
              {!packageSummary.hasTaxProfile && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {memberById.get(packageSummary.package.household_member_id)} has no tax profile
                  yet, so net figures aren&apos;t available.{" "}
                  <Link href="/household" className="underline underline-offset-2">
                    Set one up
                  </Link>
                  .
                </p>
              )}
              {wartezeitTimeline.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
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

      {/* Runway */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Projected balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!runway || runway.series.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Add a severance package to see the projection.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-6">
                <div>
                  <div className="text-xs text-muted-foreground">Depletion date</div>
                  <div
                    className="text-2xl font-extrabold tracking-tight"
                    style={{
                      color: runway.depletionDate ? "var(--status-critical)" : "var(--status-good)",
                    }}
                  >
                    {runway.depletionDate ? formatDateDisplay(runway.depletionDate) : "Sustainable (10yr horizon)"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Lowest balance</div>
                  <div className="text-2xl font-extrabold tabular-nums tracking-tight">
                    {formatEUR(runway.lowestBalance)}
                  </div>
                </div>
              </div>
              <DepletionChart series={runway.series} depletionDate={runway.depletionDate} />
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[var(--chart-5)]" aria-hidden />
                  Balance (right axis)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[var(--chart-3)]" aria-hidden />
                  Monthly cost (left axis)
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cost phases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
                    <TableCell className="tabular-nums">{formatDateDisplay(phase.start_date)}</TableCell>
                    <TableCell>
                      <Link href={`/profiles/${phase.profile_id}`} className="underline underline-offset-2">
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
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add phase</summary>
            <div className="mt-4">
              <PhaseForm
                action={addScenarioPhase.bind(null, id)}
                profiles={(profiles ?? []) as LivingProfile[]}
              />
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Property changes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">End a property</summary>
              <div className="mt-4">
                <PropertyEndForm
                  action={addScenarioPropertyEnd.bind(null, id)}
                  properties={propertyRows}
                />
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add event</summary>
            <div className="mt-4">
              <EventForm action={addScenarioEvent.bind(null, id)} />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
