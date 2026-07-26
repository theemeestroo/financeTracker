import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/components/delete-button";
import { toMonthlyEquivalent, formatEUR } from "@/lib/finance/frequency";
import { incomeGrossBreakdown } from "@/lib/finance/income-gross";
import { totalMonthlyNetIncome } from "@/lib/finance/dashboard";
import { getCurrentTaxYear } from "@/lib/tax";
import type { Split } from "@/lib/finance/splits";
import type { Commitment, Income, IncomeSplit, LivingProfile, TaxProfile } from "@/lib/types";
import { deleteLivingProfile } from "./actions";
import { NewProfileForm } from "./new-profile-form";

export default async function ProfilesPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("living_profiles")
    .select("id, name, description, is_baseline")
    .order("is_baseline", { ascending: false })
    .order("name");

  const rows = (profiles ?? []) as LivingProfile[];

  const [{ data: commitments }, { data: income }, { data: taxProfiles }] = await Promise.all([
    supabase
      .from("commitments")
      .select(
        "id, profile_id, name, category, amount, frequency, essential, start_date, end_date, property_id"
      )
      .in("profile_id", rows.map((p) => p.id)),
    supabase
      .from("income")
      .select(
        "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
      )
      .in("profile_id", rows.map((p) => p.id)),
    supabase
      .from("tax_profiles")
      .select(
        "id, household_member_id, tax_class, church_tax, church_tax_state, has_children, statutory_health_insurance, health_insurance_addon_rate"
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
  const taxProfileByMember = new Map(
    ((taxProfiles ?? []) as TaxProfile[]).map((p) => [p.household_member_id, p])
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Living Profiles</h1>
        <p className="text-sm text-muted-foreground">
          Alternate cost-of-living setups (e.g. moving abroad, downsizing) you can attach to a
          severance scenario as a phase.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => {
          const profileCommitments = commitmentsByProfile.get(p.id) ?? [];
          const profileIncome = incomeByProfile.get(p.id) ?? [];
          const monthlyCommitments = profileCommitments.reduce(
            (sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency),
            0
          );
          const monthlyIncome = profileIncome.reduce(
            (sum, i) => sum + incomeGrossBreakdown(i).recurringMonthlyGross,
            0
          );
          const { netMonthly: netMonthlyIncome } = totalMonthlyNetIncome(
            profileIncome,
            splitsByIncome,
            taxProfileByMember,
            taxYear
          );
          return (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <Link href={`/profiles/${p.id}`} className="hover:underline underline-offset-2">
                    <CardTitle className="text-base font-semibold tracking-tight">
                      {p.name}
                    </CardTitle>
                  </Link>
                  {p.description && (
                    <span className="text-xs text-muted-foreground">{p.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {p.is_baseline && (
                    <Badge variant="outline" className="text-xs font-normal">
                      Baseline
                    </Badge>
                  )}
                  {!p.is_baseline && (
                    <DeleteButton
                      action={deleteLivingProfile.bind(null, p.id)}
                      confirmMessage={`Delete profile "${p.name}"? Any scenario phase using it will need a replacement.`}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="flex flex-col gap-1 border-t pt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Commitments ({profileCommitments.length})</span>
                    <span className="tabular-nums">{formatEUR(monthlyCommitments)}/mo</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Income, gross ({profileIncome.length})</span>
                    <span className="tabular-nums">{formatEUR(monthlyIncome)}/mo</span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                  <span>Net (net income − commitments)</span>
                  <span className="tabular-nums">
                    {formatEUR(netMonthlyIncome - monthlyCommitments)}/mo
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            New profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NewProfileForm profiles={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
