import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveScenario, computeMonthlyBurn } from "../resolve-scenario";
import { projectRunway } from "@/lib/runway";
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
import type { SeveranceScenario } from "@/lib/types";
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

  const resolved = await Promise.all(
    scenarios.map(async (scenario) => {
      const { runwayScenario } = await resolveScenario(supabase, scenario);
      const runway = runwayScenario ? projectRunway(runwayScenario) : null;
      const monthlyBurn = runwayScenario ? computeMonthlyBurn(runwayScenario) : null;
      return { scenario, runway, monthlyBurn };
    })
  );

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
                <TableHead scope="col">Scenario</TableHead>
                <TableHead scope="col">Depletion date</TableHead>
                <TableHead scope="col" className="text-right">
                  Lowest balance
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Monthly burn
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resolved.map(({ scenario, runway, monthlyBurn }, i) => (
                <TableRow key={scenario.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
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
                  </TableCell>
                  <TableCell>
                    {!runway ? (
                      "—"
                    ) : runway.depletionDate ? (
                      <Badge
                        variant="outline"
                        style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}
                      >
                        {formatDateDisplay(runway.depletionDate)}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}
                      >
                        Sustainable
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {runway ? formatEUR(runway.lowestBalance) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {monthlyBurn != null ? `${formatEUR(monthlyBurn)}/mo` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
