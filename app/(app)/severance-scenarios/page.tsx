import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveScenario } from "./resolve-scenario";
import { projectRunway } from "@/lib/runway";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR } from "@/lib/finance/frequency";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import type { HouseholdMember, SeveranceScenario, SeveranceScenarioPackage } from "@/lib/types";

/**
 * Compact tags summarizing what's actually baked into a scenario's
 * package(s) — multiplier (or "Override" if a manual figure replaced the
 * formula), which pay components are folded into the calc base, and
 * garden leave — so the list page reads as more than just a name and a
 * total. Multiple packages (one per severed household member) collapse to
 * a single tag set via "any package has this" rather than one row per
 * person, since scenarios almost always size everyone the same way.
 */
function summarizeScope(packages: SeveranceScenarioPackage[]): string[] {
  const formulaMultipliers = packages
    .filter((p) => p.gross_severance_override == null)
    .map((p) => p.severance_multiplier);
  const anyOverridden = packages.some((p) => p.gross_severance_override != null);
  const multiplierTag =
    formulaMultipliers.length === 0
      ? null
      : Math.min(...formulaMultipliers) === Math.max(...formulaMultipliers)
        ? `${formulaMultipliers[0]}×`
        : `${Math.min(...formulaMultipliers)}×–${Math.max(...formulaMultipliers)}×`;

  const gardenLeavePackages = packages.filter((p) => p.include_garden_leave);
  const noticeMonths = gardenLeavePackages.map((p) => p.notice_period_months ?? 0);
  const gardenLeaveTag =
    gardenLeavePackages.length === 0
      ? null
      : noticeMonths.every((m) => m === noticeMonths[0])
        ? `Garden leave (${noticeMonths[0]}mo)`
        : "Garden leave";

  return [
    ...(multiplierTag ? [multiplierTag] : []),
    ...(anyOverridden ? ["Override"] : []),
    ...(packages.some((p) => p.include_bonus_in_calc) ? ["+ Bonus"] : []),
    ...(packages.some((p) => p.include_christmas_bonus_in_calc) ? ["+ Xmas money"] : []),
    ...(packages.some((p) => p.include_car_in_calc) ? ["+ Car"] : []),
    ...(gardenLeaveTag ? [gardenLeaveTag] : []),
  ];
}

export default async function SeveranceScenariosPage() {
  const supabase = await createClient();
  const [{ data: scenarios }, { data: members }] = await Promise.all([
    supabase.from("severance_scenarios").select("*").order("name"),
    supabase.from("household_members").select("id, name, created_at"),
  ]);

  const rows = (scenarios ?? []) as SeveranceScenario[];
  const memberById = new Map(
    ((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name])
  );

  const previews = await Promise.all(
    rows.map(async (scenario) => {
      const { runwayScenario, packageSummaries } = await resolveScenario(supabase, scenario);
      const runway = runwayScenario ? projectRunway(runwayScenario) : null;
      const earliestStart = packageSummaries.reduce(
        (earliest: string | null, s) =>
          !earliest || s.package.severance_start_date < earliest
            ? s.package.severance_start_date
            : earliest,
        null as string | null
      );
      const totalGross = packageSummaries.reduce((sum, s) => sum + s.severanceGross, 0);
      const totalNet = packageSummaries.every((s) => s.netSeverance != null)
        ? packageSummaries.reduce((sum, s) => sum + (s.netSeverance ?? 0), 0)
        : null;
      const memberNames = packageSummaries
        .map((s) => memberById.get(s.package.household_member_id) ?? "—")
        .join(", ");
      const scopeTags = summarizeScope(packageSummaries.map((s) => s.package));
      return { scenario, packageSummaries, runway, earliestStart, totalGross, totalNet, memberNames, scopeTags };
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Severance Scenarios</h1>
          <p className="text-sm text-muted-foreground">
            Size a package, project the runway, model a different life on top of it.
          </p>
        </div>
        <div className="flex gap-2">
          {rows.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/severance-scenarios/compare" />}
            >
              Compare
            </Button>
          )}
          <Button size="sm" render={<Link href="/severance-scenarios/new" />}>
            <Plus className="size-4" />
            New scenario
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">No severance scenarios yet.</p>
            <Button size="sm" variant="outline" render={<Link href="/severance-scenarios/new" />}>
              Create your first scenario
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {previews.map(({ scenario, runway, earliestStart, totalGross, totalNet, memberNames, scopeTags }) => (
            <Link key={scenario.id} href={`/severance-scenarios/${scenario.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base font-semibold tracking-tight">{scenario.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <div className="text-muted-foreground">
                    {memberNames || "No packages yet"} · starts{" "}
                    {earliestStart ? formatDateDisplay(earliestStart) : "—"}
                  </div>
                  {scopeTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {scopeTags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Net severance</span>
                    <span className="font-semibold tabular-nums">
                      {totalNet != null ? formatEUR(totalNet) : `${formatEUR(totalGross)} gross`}
                    </span>
                  </div>
                  {runway && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Runway</span>
                      {runway.depletionDate ? (
                        <Badge variant="outline" style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}>
                          Depletes {formatDateDisplay(runway.depletionDate)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}>
                          Sustainable (10yr horizon)
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
