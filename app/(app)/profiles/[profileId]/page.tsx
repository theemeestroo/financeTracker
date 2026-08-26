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
import { OverridePopover } from "@/components/override-popover";
import { BaselineDeltaBadge } from "@/components/baseline-delta-badge";
import { CollapsibleTableGroup } from "@/components/collapsible-table-group";
import { toMonthlyEquivalent, formatEUR, sortCommitmentsByCost } from "@/lib/finance/frequency";
import { incomeGrossBreakdown, combinedNetBreakdownByRow } from "@/lib/finance/income-gross";
import { totalMonthlyNetIncome } from "@/lib/finance/dashboard";
import { getCurrentTaxYear } from "@/lib/tax";
import { toTaxProfile } from "@/lib/finance/tax-profile-context";
import { splitLabel } from "@/lib/finance/splits";
import { propertiesWithSplits } from "@/lib/finance/property-splits";
import { COMMITMENT_CATEGORIES, COMMITMENT_FREQUENCIES } from "@/lib/types";
import type {
  Commitment,
  CommitmentCategory,
  CommitmentSplit,
  HouseholdMember,
  Income,
  IncomeSplit,
  TaxProfileRow,
} from "@/lib/types";
import { updateLivingProfile, updateCurrentLiquidSavings } from "../actions";
import { CommitmentForm } from "../../commitments/commitment-form";
import {
  createCommitment,
  deleteCommitment,
  adjustCommitmentAmount,
  deleteCommitmentsByProperty,
} from "../../commitments/actions";
import { IncomeForm } from "../../income/income-form";
import { createIncome, deleteIncome, adjustIncomeAmount } from "../../income/actions";
import { RenameProfileForm } from "./rename-profile-form";
import { BaselineSavingsForm } from "./baseline-savings-form";

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

  const [{ data: profile }, { data: commitments }, { data: income }, { data: members }, { data: taxProfiles }] =
    await Promise.all([
      supabase
        .from("living_profiles")
        .select("id, name, description, is_baseline, current_liquid_savings")
        .eq("id", profileId)
        .single(),
      supabase
        .from("commitments")
        .select(
          "id, profile_id, name, category, amount, frequency, essential, start_date, end_date, baseline_amount, property_id"
        )
        .eq("profile_id", profileId)
        .order("name"),
      supabase
        .from("income")
        .select(
          "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur, baseline_gross_amount"
        )
        .eq("profile_id", profileId)
        .order("name"),
      supabase
        .from("household_members")
        .select(
          "id, name, created_at, date_of_birth, statutory_health_insurance, health_insurance_addon_rate, private_health_insurance_monthly_premium"
        ),
      supabase
        .from("tax_profiles")
        .select("id, household_member_id, tax_class, church_tax, church_tax_state, has_children"),
    ]);

  if (!profile) notFound();

  const { properties, splitsByProperty } = await propertiesWithSplits(supabase, profileId);

  const commitmentRows = (commitments ?? []) as Commitment[];
  const incomeRows = (income ?? []) as Income[];
  const householdMembers = (members ?? []) as HouseholdMember[];
  const memberById = new Map(householdMembers.map((m) => [m.id, m.name]));
  const memberRecordById = new Map(householdMembers.map((m) => [m.id, m]));
  const taxProfileByMember = new Map(
    ((taxProfiles ?? []) as TaxProfileRow[]).map((row) => [
      row.household_member_id,
      toTaxProfile(row, memberRecordById.get(row.household_member_id)),
    ])
  );
  const taxYear = getCurrentTaxYear();
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
  const { netMonthly: totalMonthlyNetIncomeValue, missingProfileCount } = totalMonthlyNetIncome(
    incomeRows,
    splitsByIncome,
    taxProfileByMember,
    taxYear
  );
  const netByIncomeRow = combinedNetBreakdownByRow(
    incomeRows,
    (id) => splitsByIncome.get(id) ?? [],
    taxProfileByMember,
    taxYear
  );

  // Grouped by property (alphabetical), then every property-less commitment
  // sub-grouped by category instead of one flat "No property" bucket — same
  // idiom as app/(app)/commitments/page.tsx.
  const commitmentsByProperty = new Map<string, Commitment[]>();
  const unassignedCommitments: Commitment[] = [];
  for (const c of commitmentRows) {
    if (c.property_id) {
      commitmentsByProperty.set(c.property_id, [
        ...(commitmentsByProperty.get(c.property_id) ?? []),
        c,
      ]);
    } else {
      unassignedCommitments.push(c);
    }
  }
  const unassignedByCategory = new Map<CommitmentCategory, Commitment[]>();
  for (const c of unassignedCommitments) {
    unassignedByCategory.set(c.category, [...(unassignedByCategory.get(c.category) ?? []), c]);
  }
  const commitmentGroups = [
    ...properties
      .filter((p) => commitmentsByProperty.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        key: p.id,
        label: p.name,
        type: "property" as const,
        commitments: sortCommitmentsByCost(commitmentsByProperty.get(p.id)!),
      })),
    ...COMMITMENT_CATEGORIES.map((cat) => ({
      key: `category-${cat.value}`,
      label: cat.label,
      type: "category" as const,
      commitments: sortCommitmentsByCost(unassignedByCategory.get(cat.value) ?? []),
    })),
  ].filter((g) => g.commitments.length > 0);

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

      {profile.is_baseline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Current liquid savings
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Feeds the &quot;do-nothing&quot; reference line on severance scenario charts — today&apos;s
              savings, held flat at this household&apos;s current monthly surplus/deficit, so you can see
              at a glance whether taking a package ever puts you behind where you&apos;d be otherwise.
            </p>
            <BaselineSavingsForm
              action={updateCurrentLiquidSavings.bind(null, profileId)}
              defaultValue={profile.current_liquid_savings}
            />
          </CardContent>
        </Card>
      )}

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
              Income (monthly-equiv.)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-extrabold tabular-nums tracking-tight">
              {formatEUR(totalMonthlyNetIncomeValue)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">/mo net</span>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatEUR(totalMonthlyIncome)}/mo gross
            </p>
            {missingProfileCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {missingProfileCount} income {missingProfileCount === 1 ? "share isn't" : "shares aren't"}{" "}
                linked to a taxed person yet, so {missingProfileCount === 1 ? "it's" : "they're"} excluded
                from net.
              </p>
            )}
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
              {commitmentGroups.map((group) => {
                const groupMonthly = group.commitments.reduce(
                  (sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency),
                  0
                );
                return (
                  <CollapsibleTableGroup
                    key={group.key}
                    label={group.label}
                    href={group.type === "property" ? `/properties/${group.key}` : undefined}
                    total={formatEUR(groupMonthly)}
                    colSpan={4}
                    actions={
                      group.type === "property" && (
                        <DeleteButton
                          action={deleteCommitmentsByProperty.bind(null, group.key, profileId, redirectTo)}
                          confirmMessage={`Delete all ${group.commitments.length} commitment${
                            group.commitments.length === 1 ? "" : "s"
                          } linked to "${group.label}"? This can't be undone.`}
                        />
                      )
                    }
                  >
                    {group.commitments.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{categoryLabel(c.category)}</TableCell>
                        <TableCell>{splitLabel(splitsByCommitment.get(c.id) ?? [], memberById)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className="flex flex-col items-end gap-1">
                            {formatEUR(c.amount)}
                            {c.baseline_amount != null && (
                              <BaselineDeltaBadge deltaEur={c.amount - c.baseline_amount} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{frequencyLabel(c.frequency)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {c.baseline_amount != null && (
                              <OverridePopover
                                action={adjustCommitmentAmount.bind(null, c.id, redirectTo)}
                                currentValue={c.amount}
                                field="amount"
                                label={`Amount (baseline ${formatEUR(c.baseline_amount)})`}
                                triggerLabel="Adjust"
                              />
                            )}
                            <DeleteButton
                              action={deleteCommitment.bind(null, c.id, redirectTo)}
                              confirmMessage={`Delete "${c.name}"?`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </CollapsibleTableGroup>
                );
              })}
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
                  <TableHead scope="col" className="text-right">
                    Net/mo
                  </TableHead>
                  <TableHead scope="col" className="w-12 text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomeRows.map((i) => {
                  const netEntry = netByIncomeRow.get(i.id);
                  const splits = splitsByIncome.get(i.id) ?? [];
                  const hasResolvedShare = (netEntry?.missingShares ?? Math.max(splits.length, 1)) < Math.max(splits.length, 1);
                  return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{splitLabel(splits, memberById)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex flex-col items-end gap-1">
                        <CurrencyAmount
                          amount={i.gross_amount}
                          currency={i.currency}
                          exchangeRateToEur={i.exchange_rate_to_eur}
                        />
                        {i.baseline_gross_amount != null && (
                          <BaselineDeltaBadge
                            deltaEur={(i.gross_amount - i.baseline_gross_amount) * i.exchange_rate_to_eur}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{frequencyLabel(i.frequency)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {hasResolvedShare ? (
                        formatEUR(netEntry?.net.recurringMonthlyNet ?? 0)
                      ) : (
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                          no tax profile
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {i.baseline_gross_amount != null && (
                          <OverridePopover
                            action={adjustIncomeAmount.bind(null, i.id, redirectTo)}
                            currentValue={i.gross_amount}
                            field="gross_amount"
                            label={`Gross amount (baseline ${formatEUR(
                              i.baseline_gross_amount * i.exchange_rate_to_eur
                            )})`}
                            triggerLabel="Adjust"
                          />
                        )}
                        <DeleteButton
                          action={deleteIncome.bind(null, i.id, redirectTo)}
                          confirmMessage={`Delete "${i.name}"?`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
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
