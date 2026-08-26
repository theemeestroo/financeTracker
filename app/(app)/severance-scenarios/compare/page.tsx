import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveScenario, computeMonthlyBurn, scenarioTotals } from "../resolve-scenario";
import { projectRunway, projectDoNothingBaseline } from "@/lib/runway";
import { getBaselineRunwayInputs } from "@/lib/finance/baseline-profile";
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
import { ComparisonChart, type ComparisonSeries } from "@/components/charts/comparison-chart";
import { formatEUR } from "@/lib/finance/frequency";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import type { HouseholdMember, SeveranceScenario } from "@/lib/types";
import { ScenarioPicker } from "./scenario-picker";

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export default async function CompareScenariosPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const supabase = await createClient();

  const { data: allScenarios } = await supabase
    .from("severance_scenarios")
    .select("*")
    .order("name");
  const scenarios = (allScenarios ?? []) as SeveranceScenario[];

  const selectedIds = ids ? ids.split(",").filter(Boolean) : [];
  const selected = scenarios.filter((s) => selectedIds.includes(s.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compare scenarios</h1>
          <p className="text-sm text-muted-foreground">
            Hold multiple severance scenarios side by side.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/severance-scenarios" />}>
          Back to scenarios
        </Button>
      </div>

      {scenarios.length < 2 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You need at least two severance scenarios to compare.
          </CardContent>
        </Card>
      ) : selected.length < 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Choose scenarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScenarioPicker scenarios={scenarios} />
          </CardContent>
        </Card>
      ) : (
        <ComparisonResults scenarios={selected} />
      )}
    </div>
  );
}

async function ComparisonResults({ scenarios }: { scenarios: SeveranceScenario[] }) {
  const supabase = await createClient();
  const { data: members } = await supabase.from("household_members").select("id, name, created_at");
  const memberById = new Map(((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name]));

  const resolved = await Promise.all(
    scenarios.map(async (scenario) => {
      const { runwayScenario, packageSummaries } = await resolveScenario(supabase, scenario);
      const runway = runwayScenario ? projectRunway(runwayScenario) : null;
      const monthlyBurn = runwayScenario ? computeMonthlyBurn(runwayScenario) : null;
      const totals = scenarioTotals(packageSummaries);
      const memberNames = packageSummaries
        .map((s) => memberById.get(s.package.household_member_id) ?? "—")
        .join(", ");

      // Extra comparison-table-only aggregates — not shared via
      // scenarioTotals since nothing else in the app needs them.
      const totalTaxOnSeverance = packageSummaries.every((s) => s.taxOnSeverance != null)
        ? packageSummaries.reduce((sum, s) => sum + (s.taxOnSeverance ?? 0), 0)
        : null;
      const totalTaxSaving = packageSummaries.every((s) => s.taxSaving != null)
        ? packageSummaries.reduce((sum, s) => sum + (s.taxSaving ?? 0), 0)
        : null;
      const totalNoticePayGross = packageSummaries.reduce((sum, s) => sum + s.noticePayGross, 0);
      const totalPackageGross = totals.totalGrossSeverance + totalNoticePayGross;
      const algDurations = packageSummaries.map((s) => s.algDurationMonths).filter((d) => d > 0);
      const algDurationLabel =
        algDurations.length === 0
          ? null
          : Math.min(...algDurations) === Math.max(...algDurations)
            ? `${algDurations[0]}mo`
            : `${Math.min(...algDurations)}–${Math.max(...algDurations)}mo`;
      const totalHealthGapMonthly = packageSummaries.reduce((sum, s) => sum + s.healthGapMonthly, 0);
      const totalHealthAlgMonthly = packageSummaries.reduce((sum, s) => sum + s.healthAlgMonthly, 0);
      const anySperrzeitRisk = packageSummaries.some((s) => s.sperrzeitAtRisk);
      const startingBalance = runwayScenario?.startingBalance ?? scenario.starting_balance;

      return {
        scenario,
        runway,
        monthlyBurn,
        totals,
        memberNames,
        startingBalance,
        totalTaxOnSeverance,
        totalTaxSaving,
        totalNoticePayGross,
        totalPackageGross,
        algDurationLabel,
        totalHealthGapMonthly,
        totalHealthAlgMonthly,
        anySperrzeitRisk,
      };
    })
  );

  type Resolved = (typeof resolved)[number];

  const series: ComparisonSeries[] = resolved.map(({ scenario }, i) => ({
    id: scenario.id,
    name: scenario.name,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  // Merge each scenario's {date, balance} series into one date-indexed array Recharts can plot.
  const byDate = new Map<string, Record<string, string | number | null>>();
  for (const { scenario, runway } of resolved) {
    if (!runway) continue;
    for (const point of runway.series) {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[scenario.id] = point.balance;
      byDate.set(point.date, row);
    }
  }
  const chartData = Array.from(byDate.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );

  // "Do-nothing" baseline overlay (DESIGN v2 §2.5) — one reference series
  // across every scenario's own date range, same household situation
  // regardless of which scenarios are being compared.
  const baselineInputs = await getBaselineRunwayInputs(supabase);
  if (baselineInputs.currentLiquidSavings != null && chartData.length > 0) {
    const dates = chartData.map((row) => row.date as string);
    const baselinePoints = projectDoNothingBaseline(
      dates,
      baselineInputs.currentLiquidSavings,
      baselineInputs.monthlySurplus
    );
    const baselineByDate = new Map(baselinePoints.map((p) => [p.date, p.balance]));
    for (const row of chartData) {
      row["do-nothing"] = baselineByDate.get(row.date as string) ?? null;
    }
    series.push({ id: "do-nothing", name: "Do-nothing", color: "var(--muted-foreground)", dashed: true });
  }

  // Every distinct household member covered by *any* selected scenario, in
  // first-appearance order — the fixed set of possible per-person rows
  // under Gross/Net severance below. A scenario that doesn't cover a given
  // person just shows "—" in their row.
  const allMemberIds = Array.from(
    new Set(resolved.flatMap((r) => r.totals.severanceByMember.map((p) => p.householdMemberId)))
  );
  const severanceValueFor = (r: Resolved, memberId: string, field: "gross" | "net") => {
    const share = r.totals.severanceByMember.find((p) => p.householdMemberId === memberId);
    if (!share) return "—";
    const value = field === "gross" ? share.gross : share.net;
    return value != null ? formatEUR(value) : "—";
  };
  // Each person's own depletion date (RunwayResult.perMember) — shown even
  // when the scenario's household total is sustainable, since one person's
  // sub-balance can still go negative while another's surplus covers it.
  const depletionValueFor = (r: Resolved, memberId: string) => {
    if (!r.runway?.perMember) return "—";
    const pm = r.runway.perMember.find((p) => p.householdMemberId === memberId);
    if (!pm) return "—";
    return (
      <span style={{ color: pm.depletionDate ? "var(--status-critical)" : "var(--status-good)" }}>
        {pm.depletionDate ? formatDateDisplay(pm.depletionDate) : "Sustainable"}
      </span>
    );
  };

  // Scenarios as columns, metrics as rows — reads more like a comparison
  // matrix than the other way round once there's this many values, since
  // it's usually one metric at a time ("who has the higher net severance?")
  // that the household is scanning for, not one scenario's full profile.
  // Every value column is right-aligned (including badges/text, not just
  // money) so the columns stay visually in line with each other.
  const rows: { label: string; sub?: boolean; render: (r: Resolved) => ReactNode }[] = [
    { label: "People", render: (r) => r.memberNames || "—" },
    { label: "Starts", render: (r) => (r.totals.earliestStart ? formatDateDisplay(r.totals.earliestStart) : "—") },
    { label: "Starting balance", render: (r) => formatEUR(r.startingBalance) },
    { label: "Gross severance", render: (r) => formatEUR(r.totals.totalGrossSeverance) },
    ...allMemberIds.map((id) => ({
      label: memberById.get(id) ?? "—",
      sub: true,
      render: (r: Resolved) => severanceValueFor(r, id, "gross"),
    })),
    { label: "Tax on severance", render: (r) => (r.totalTaxOnSeverance != null ? formatEUR(r.totalTaxOnSeverance) : "—") },
    { label: "Net severance", render: (r) => (r.totals.totalNetSeverance != null ? formatEUR(r.totals.totalNetSeverance) : "—") },
    ...allMemberIds.map((id) => ({
      label: memberById.get(id) ?? "—",
      sub: true,
      render: (r: Resolved) => severanceValueFor(r, id, "net"),
    })),
    { label: "Tax saved (5th rule)", render: (r) => (r.totalTaxSaving != null ? formatEUR(r.totalTaxSaving) : "—") },
    { label: "Garden leave pay (gross)", render: (r) => (r.totalNoticePayGross > 0 ? formatEUR(r.totalNoticePayGross) : "—") },
    { label: "Total package (gross)", render: (r) => formatEUR(r.totalPackageGross) },
    { label: "ALG I, combined", render: (r) => (r.totals.algMonthlyNetTotal > 0 ? `${formatEUR(r.totals.algMonthlyNetTotal)}/mo` : "—") },
    { label: "ALG I duration", render: (r) => r.algDurationLabel ?? "—" },
    { label: "Health insurance, gap", render: (r) => (r.totalHealthGapMonthly > 0 ? `${formatEUR(r.totalHealthGapMonthly)}/mo` : "—") },
    { label: "Health insurance, on ALG I", render: (r) => (r.totalHealthAlgMonthly > 0 ? `${formatEUR(r.totalHealthAlgMonthly)}/mo` : "—") },
    {
      label: "Sperrzeit risk",
      render: (r) =>
        r.anySperrzeitRisk ? (
          <Badge variant="outline" style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}>
            At risk
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { label: "Monthly burn", render: (r) => (r.monthlyBurn != null ? `${formatEUR(r.monthlyBurn)}/mo` : "—") },
    { label: "Lowest balance", render: (r) => (r.runway ? formatEUR(r.runway.lowestBalance) : "—") },
    {
      label: "Lowest balance date",
      render: (r) => (r.runway?.lowestBalanceDate ? formatDateDisplay(r.runway.lowestBalanceDate) : "—"),
    },
    {
      label: "Depletion",
      render: (r) =>
        !r.runway ? (
          "—"
        ) : r.runway.depletionDate ? (
          <Badge variant="outline" style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}>
            {formatDateDisplay(r.runway.depletionDate)}
          </Badge>
        ) : (
          <Badge variant="outline" style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}>
            Sustainable
          </Badge>
        ),
    },
    ...allMemberIds.map((id) => ({
      label: memberById.get(id) ?? "—",
      sub: true,
      render: (r: Resolved) => depletionValueFor(r, id),
    })),
  ];

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              None of the selected scenarios have a projection yet — add a severance start date.
            </p>
          ) : (
            <ComparisonChart data={chartData} series={series} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table aria-label="Scenario comparison">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Metric</TableHead>
                {resolved.map(({ scenario }, i) => (
                  <TableHead key={scenario.id} scope="col" className="text-right">
                    <span className="flex items-center justify-end gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                        aria-hidden
                      />
                      <Link
                        href={`/severance-scenarios/${scenario.id}`}
                        className="underline underline-offset-2"
                      >
                        {scenario.name}
                      </Link>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={`${row.label}-${i}`}>
                  <TableCell
                    className={
                      row.sub ? "pl-8 text-xs text-muted-foreground" : "font-medium text-muted-foreground"
                    }
                  >
                    {row.label}
                  </TableCell>
                  {resolved.map((r) => (
                    <TableCell key={r.scenario.id} className="text-right tabular-nums">
                      {row.render(r)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
