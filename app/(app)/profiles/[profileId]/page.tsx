import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
import { CurrencyAmount } from "@/components/currency-amount";
import { toMonthlyEquivalent, formatEUR, sortCommitmentsByCost } from "@/lib/finance/frequency";
import { incomeGrossBreakdown } from "@/lib/finance/income-gross";
import { splitLabel } from "@/lib/finance/splits";
import { propertiesWithSplits } from "@/lib/finance/property-splits";
import { COMMITMENT_CATEGORIES, COMMITMENT_FREQUENCIES } from "@/lib/types";
import type { Commitment, CommitmentSplit, HouseholdMember, Income, IncomeSplit } from "@/lib/types";
import { updateLivingProfile } from "../actions";
import { CommitmentForm } from "../../commitments/commitment-form";
import { createCommitment, deleteCommitment } from "../../commitments/actions";
import { IncomeForm } from "../../income/income-form";
import { createIncome, deleteIncome } from "../../income/actions";
import { RenameProfileForm } from "./rename-profile-form";

const categoryLabel = (v: string) =>
  COMMITMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  COMMITMENT_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

export default async function LivingProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: commitments }, { data: income }, { data: members }] =
    await Promise.all([
      supabase
        .from("living_profiles")
        .select("id, name, description, is_baseline")
        .eq("id", profileId)
        .single(),
      supabase
        .from("commitments")
        .select(
          "id, profile_id, name, category, amount, frequency, essential, start_date, end_date"
        )
        .eq("profile_id", profileId)
        .order("name"),
      supabase
        .from("income")
        .select(
          "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
        )
        .eq("profile_id", profileId)
        .order("name"),
      supabase.from("household_members").select("id, name, created_at"),
    ]);

  if (!profile) notFound();

  const { properties, splitsByProperty } = await propertiesWithSplits(supabase, profileId);

  const commitmentRows = (commitments ?? []) as Commitment[];
  const incomeRows = (income ?? []) as Income[];
  const householdMembers = (members ?? []) as HouseholdMember[];
  const memberById = new Map(householdMembers.map((m) => [m.id, m.name]));
  const redirectTo = `/profiles/${profileId}`;

  const { data: splitRows } = await supabase
    .from("commitment_splits")
    .select("id, commitment_id, household_member_id, percentage")
    .in("commitment_id", commitmentRows.map((c) => c.id));
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
    .in("income_id", incomeRows.map((i) => i.id));
  const splitsByIncome = new Map<string, IncomeSplit[]>();
  for (const s of (incomeSplitRows ?? []) as IncomeSplit[]) {
    splitsByIncome.set(s.income_id, [...(splitsByIncome.get(s.income_id) ?? []), s]);
  }

  const totalMonthlyCommitments = commitmentRows.reduce(
    (sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency),
    0
  );
  const totalMonthlyIncome = incomeRows.reduce(
    (sum, i) => sum + incomeGrossBreakdown(i).recurringMonthlyGross,
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{profile.name}</h1>
            {profile.is_baseline && <Badge variant="outline">Baseline</Badge>}
          </div>
          {profile.description && (
            <p className="text-sm text-muted-foreground">{profile.description}</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Rename / describe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RenameProfileForm
            action={updateLivingProfile.bind(null, profileId)}
            defaultName={profile.name}
            defaultDescription={profile.description ?? ""}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Commitments (monthly-equiv.)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-extrabold tabular-nums tracking-tight">
              {formatEUR(totalMonthlyCommitments)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">/mo</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Income (monthly-equiv., gross)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-extrabold tabular-nums tracking-tight">
              {formatEUR(totalMonthlyIncome)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">/mo</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Commitments
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {commitmentRows.length > 0 && (
            <Table aria-label="Profile commitments">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Category</TableHead>
                  <TableHead scope="col">Linked to</TableHead>
                  <TableHead scope="col" className="text-right">
                    Amount
                  </TableHead>
                  <TableHead scope="col">Frequency</TableHead>
                  <TableHead scope="col" className="w-12 text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortCommitmentsByCost(commitmentRows).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{categoryLabel(c.category)}</TableCell>
                    <TableCell>{splitLabel(splitsByCommitment.get(c.id) ?? [], memberById)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEUR(c.amount)}
                    </TableCell>
                    <TableCell>{frequencyLabel(c.frequency)}</TableCell>
                    <TableCell className="text-right">
                      <DeleteButton
                        action={deleteCommitment.bind(null, c.id, redirectTo)}
                        confirmMessage={`Delete "${c.name}"?`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add commitment</summary>
            <div className="mt-4">
              <CommitmentForm
                action={createCommitment}
                members={householdMembers}
                properties={properties}
                propertySplitsByProperty={splitsByProperty}
                profileId={profileId}
                redirectTo={redirectTo}
              />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Income</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {incomeRows.length > 0 && (
            <Table aria-label="Profile income">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Linked to</TableHead>
                  <TableHead scope="col" className="text-right">
                    Gross amount
                  </TableHead>
                  <TableHead scope="col">Frequency</TableHead>
                  <TableHead scope="col" className="w-12 text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomeRows.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{splitLabel(splitsByIncome.get(i.id) ?? [], memberById)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <CurrencyAmount
                        amount={i.gross_amount}
                        currency={i.currency}
                        exchangeRateToEur={i.exchange_rate_to_eur}
                      />
                    </TableCell>
                    <TableCell>{frequencyLabel(i.frequency)}</TableCell>
                    <TableCell className="text-right">
                      <DeleteButton
                        action={deleteIncome.bind(null, i.id, redirectTo)}
                        confirmMessage={`Delete "${i.name}"?`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add income</summary>
            <div className="mt-4">
              <IncomeForm
                action={createIncome}
                members={householdMembers}
                profileId={profileId}
                redirectTo={redirectTo}
              />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
