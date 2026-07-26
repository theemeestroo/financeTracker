import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SurplusTile } from "@/components/charts/surplus-tile";
import { CategoryBreakdownChart } from "@/components/charts/category-breakdown-chart";
import { DepletionChart } from "@/components/charts/depletion-chart";
import { OwnerFilter } from "./owner-filter";
import {
  activeCommitments,
  activeIncome,
  categoryBreakdown,
  todayISO,
  totalMonthlyCommitments,
  totalMonthlyNetIncome,
} from "@/lib/finance/dashboard";
import { computeHistoricalTrend, trendMonthsAvailable } from "@/lib/finance/trend";
import { getCurrentTaxYear } from "@/lib/tax";
import { getBaselineProfile } from "@/lib/finance/baseline-profile";
import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { memberShareOfAmount, type Split } from "@/lib/finance/splits";
import type {
  Commitment,
  CommitmentSplit,
  HouseholdMember,
  Income,
  IncomeSplit,
  TaxProfile,
} from "@/lib/types";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const { owner } = await searchParams;
  const supabase = await createClient();
  const onDate = todayISO();
  const baselineProfile = await getBaselineProfile(supabase);
  const baselineProfileId = baselineProfile.id;

  const [{ data: commitments }, { data: income }, { data: members }, { data: taxProfiles }] =
    await Promise.all([
      supabase
        .from("commitments")
        .select(
          "id, profile_id, name, category, amount, frequency, essential, start_date, end_date"
        )
        .eq("profile_id", baselineProfileId),
      supabase
        .from("income")
        .select(
          "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
        )
        .eq("profile_id", baselineProfileId),
      supabase.from("household_members").select("id, name, created_at"),
      supabase
        .from("tax_profiles")
        .select(
          "id, household_member_id, tax_class, church_tax, church_tax_state, has_children, statutory_health_insurance, health_insurance_addon_rate"
        ),
    ]);

  const allCommitments = (commitments ?? []) as Commitment[];
  const allIncome = (income ?? []) as Income[];
  const householdMembers = (members ?? []) as HouseholdMember[];
  const taxProfileByMember = new Map(
    ((taxProfiles ?? []) as TaxProfile[]).map((p) => [p.household_member_id, p])
  );

  const { data: splitRows } = await supabase
    .from("commitment_splits")
    .select("id, commitment_id, household_member_id, percentage")
    .in("commitment_id", allCommitments.map((c) => c.id));
  const splitsByCommitment = new Map<string, CommitmentSplit[]>();
  for (const s of (splitRows ?? []) as CommitmentSplit[]) {
    splitsByCommitment.set(s.commitment_id, [
      ...(splitsByCommitment.get(s.commitment_id) ?? []),
      s,
    ]);
  }

  const { data: incomeSplitRows } = await supabase
    .from("income_splits")
    .select("id, income_id, household_member_id, percentage")
    .in("income_id", allIncome.map((i) => i.id));
  const splitsByIncome = new Map<string, Split[]>();
  for (const s of (incomeSplitRows ?? []) as IncomeSplit[]) {
    splitsByIncome.set(s.income_id, [...(splitsByIncome.get(s.income_id) ?? []), s]);
  }

  if (allCommitments.length === 0 && allIncome.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
            <Link href="/profiles">
              <Badge variant="outline">Baseline: {baselineProfile.name}</Badge>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Add your commitments and income to see the household&apos;s monthly picture.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Get started
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" render={<Link href="/commitments" />}>
              Add commitments
            </Button>
            <Button variant="outline" render={<Link href="/income" />}>
              Add income
            </Button>
            <Button variant="outline" render={<Link href="/household" />}>
              Manage household
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const active = activeCommitments(allCommitments, onDate);
  const activeInc = activeIncome(allIncome, onDate);
  const monthlyCommitments = totalMonthlyCommitments(active);
  const year = getCurrentTaxYear();
  const { netMonthly: monthlyNetIncome, missingProfileCount } = totalMonthlyNetIncome(
    activeInc,
    splitsByIncome,
    taxProfileByMember,
    year
  );

  const isMemberScoped = !!owner && owner !== "all" && owner !== "household";
  const scopedCommitments =
    !owner || owner === "all"
      ? active
      : owner === "household"
        ? active.filter((c) => (splitsByCommitment.get(c.id) ?? []).length === 0)
        : active.filter((c) =>
            (splitsByCommitment.get(c.id) ?? []).some((s) => s.household_member_id === owner)
          );

  const breakdown = categoryBreakdown(
    scopedCommitments,
    isMemberScoped
      ? (c) =>
          memberShareOfAmount(
            toMonthlyEquivalent(c.amount, c.frequency),
            splitsByCommitment.get(c.id) ?? [],
            owner!
          )
      : undefined
  );

  const trendMonths = trendMonthsAvailable(allCommitments, allIncome);
  const trend =
    trendMonths >= 2
      ? computeHistoricalTrend(allCommitments, allIncome, splitsByIncome, taxProfileByMember, year, trendMonths)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <Link href="/profiles">
            <Badge variant="outline">Baseline: {baselineProfile.name}</Badge>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Income shown net of tax ({year} rates); commitments are already cash outflows.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SurplusTile
          label="Monthly surplus / deficit (net)"
          monthlyIncome={monthlyNetIncome}
          monthlyCommitments={monthlyCommitments}
        />
      </div>

      {missingProfileCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {missingProfileCount} income {missingProfileCount === 1 ? "share isn't" : "shares aren't"}{" "}
          linked to a taxed person yet, so {missingProfileCount === 1 ? "it's" : "they're"} excluded
          from the net total above.{" "}
          <Link href="/household" className="underline underline-offset-2">
            Set up tax profiles
          </Link>
          .
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Spending by category (monthly-equivalent)
          </CardTitle>
          <OwnerFilter members={householdMembers} />
        </CardHeader>
        <CardContent>
          {breakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No recurring commitments in this scope.
            </p>
          ) : (
            <CategoryBreakdownChart data={breakdown} />
          )}
        </CardContent>
      </Card>

      {trend && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Surplus / deficit trend — last {trendMonths} months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DepletionChart series={trend} depletionDate={null} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
