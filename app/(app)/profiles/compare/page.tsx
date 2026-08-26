import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toMonthlyEquivalent, formatEUR } from "@/lib/finance/frequency";
import { incomeGrossBreakdown } from "@/lib/finance/income-gross";
import { totalMonthlyNetIncome, categoryBreakdown } from "@/lib/finance/dashboard";
import { getCurrentTaxYear } from "@/lib/tax";
import { toTaxProfile } from "@/lib/finance/tax-profile-context";
import type { Split } from "@/lib/finance/splits";
import { COMMITMENT_CATEGORIES } from "@/lib/types";
import type {
  Commitment,
  CommitmentCategory,
  HouseholdMember,
  Income,
  IncomeSplit,
  LivingProfile,
  TaxProfileRow,
} from "@/lib/types";
import { ProfilePicker } from "./profile-picker";

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export default async function CompareProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const supabase = await createClient();

  const { data: allProfiles } = await supabase
    .from("living_profiles")
    .select("id, name, description, is_baseline, current_liquid_savings")
    .order("is_baseline", { ascending: false })
    .order("name");
  const profiles = (allProfiles ?? []) as LivingProfile[];

  const selectedIds = ids ? ids.split(",").filter(Boolean) : [];
  const selected = profiles.filter((p) => selectedIds.includes(p.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compare Living Profiles</h1>
          <p className="text-sm text-muted-foreground">
            Hold multiple cost-of-living setups side by side.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/profiles" />}>
          Back to profiles
        </Button>
      </div>

      {profiles.length < 2 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You need at least two Living Profiles to compare.
          </CardContent>
        </Card>
      ) : selected.length < 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Choose profiles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProfilePicker profiles={profiles} />
          </CardContent>
        </Card>
      ) : (
        <ComparisonResults profiles={selected} />
      )}
    </div>
  );
}

async function ComparisonResults({ profiles }: { profiles: LivingProfile[] }) {
  const supabase = await createClient();
  const profileIds = profiles.map((p) => p.id);

  const [{ data: commitments }, { data: income }, { data: taxProfiles }, { data: members }] =
    await Promise.all([
      supabase
        .from("commitments")
        .select("id, profile_id, name, category, amount, frequency, essential, start_date, end_date")
        .in("profile_id", profileIds),
      supabase
        .from("income")
        .select(
          "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
        )
        .in("profile_id", profileIds),
      supabase
        .from("tax_profiles")
        .select("id, household_member_id, tax_class, church_tax, church_tax_state, has_children"),
      supabase
        .from("household_members")
        .select(
          "id, name, created_at, date_of_birth, statutory_health_insurance, health_insurance_addon_rate, private_health_insurance_monthly_premium"
        ),
    ]);

  const commitmentsByProfile = new Map<string, Commitment[]>();
  for (const c of (commitments ?? []) as Commitment[]) {
    commitmentsByProfile.set(c.profile_id, [...(commitmentsByProfile.get(c.profile_id) ?? []), c]);
  }
  const incomeRows = (income ?? []) as Income[];
  const incomeByProfile = new Map<string, Income[]>();
  for (const i of incomeRows) {
    incomeByProfile.set(i.profile_id, [...(incomeByProfile.get(i.profile_id) ?? []), i]);
  }
  const memberRecordById = new Map(((members ?? []) as HouseholdMember[]).map((m) => [m.id, m]));
  const taxProfileByMember = new Map(
    ((taxProfiles ?? []) as TaxProfileRow[]).map((row) => [
      row.household_member_id,
      toTaxProfile(row, memberRecordById.get(row.household_member_id)),
    ])
  );
  const taxYear = getCurrentTaxYear();

  const { data: incomeSplitRows } = await supabase
    .from("income_splits")
    .select("id, income_id, household_member_id, percentage")
    .in("income_id", incomeRows.map((i) => i.id));
  const splitsByIncome = new Map<string, Split[]>();
  for (const s of (incomeSplitRows ?? []) as IncomeSplit[]) {
    splitsByIncome.set(s.income_id, [...(splitsByIncome.get(s.income_id) ?? []), s]);
  }

  const resolved = profiles.map((profile) => {
    const profileCommitments = commitmentsByProfile.get(profile.id) ?? [];
    const profileIncome = incomeByProfile.get(profile.id) ?? [];
    const monthlyCommitments = profileCommitments.reduce(
      (sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency),
      0
    );
    const monthlyIncomeGross = profileIncome.reduce(
      (sum, i) => sum + incomeGrossBreakdown(i).recurringMonthlyGross,
      0
    );
    const { netMonthly: monthlyIncomeNet } = totalMonthlyNetIncome(
      profileIncome,
      splitsByIncome,
      taxProfileByMember,
      taxYear
    );
    const categoryTotals = new Map<CommitmentCategory, number>(
      categoryBreakdown(profileCommitments).map((entry) => [entry.category, entry.monthly])
    );

    return { profile, monthlyCommitments, monthlyIncomeGross, monthlyIncomeNet, categoryTotals };
  });

  type Resolved = (typeof resolved)[number];

  // Every category with a nonzero total in *any* selected profile, in the
  // app's canonical category order (not sorted-by-size — that would put
  // categories in a different row order per profile, which defeats the
  // point of a shared column layout).
  const categoriesInUse = COMMITMENT_CATEGORIES.filter((cat) =>
    resolved.some((r) => (r.categoryTotals.get(cat.value) ?? 0) > 0)
  );

  const rows: { label: string; sub?: boolean; strong?: boolean; render: (r: Resolved) => ReactNode }[] = [
    { label: "Commitments (monthly-equiv.)", render: (r) => formatEUR(r.monthlyCommitments) },
    ...categoriesInUse.map((cat) => ({
      label: cat.label,
      sub: true,
      render: (r: Resolved) => {
        const amount = r.categoryTotals.get(cat.value) ?? 0;
        return amount > 0 ? formatEUR(amount) : "—";
      },
    })),
    { label: "Income (gross, monthly-equiv.)", render: (r) => formatEUR(r.monthlyIncomeGross) },
    { label: "Income (net, monthly-equiv.)", render: (r) => formatEUR(r.monthlyIncomeNet) },
    {
      label: "Net (net income − commitments)",
      strong: true,
      render: (r) => formatEUR(r.monthlyIncomeNet - r.monthlyCommitments),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table aria-label="Living Profile comparison">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Metric</TableHead>
              {resolved.map(({ profile }, i) => (
                <TableHead key={profile.id} scope="col" className="text-right">
                  <span className="flex items-center justify-end gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                      aria-hidden
                    />
                    <Link href={`/profiles/${profile.id}`} className="underline underline-offset-2">
                      {profile.name}
                    </Link>
                    {profile.is_baseline && (
                      <Badge variant="outline" className="text-xs font-normal">
                        Baseline
                      </Badge>
                    )}
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
                    row.sub
                      ? "pl-8 text-xs text-muted-foreground"
                      : row.strong
                        ? "font-semibold"
                        : "font-medium text-muted-foreground"
                  }
                >
                  {row.label}
                </TableCell>
                {resolved.map((r) => (
                  <TableCell
                    key={r.profile.id}
                    className={`text-right tabular-nums ${row.strong ? "font-semibold" : ""}`}
                  >
                    {row.render(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
