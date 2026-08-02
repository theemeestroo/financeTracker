import Link from "next/link";
import { Plus, Pencil, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteIncome } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { CurrencyAmount } from "@/components/currency-amount";
import { CollapsibleTableGroup } from "@/components/collapsible-table-group";
import { formatEUR } from "@/lib/finance/frequency";
import {
  combinedIncomeBreakdown,
  combinedNetBreakdownByRow,
  incomeGrossBreakdownForRow,
  type IncomeGrossBreakdown,
  type IncomeNetBreakdown,
} from "@/lib/finance/income-gross";
import { splitLabel, type Split } from "@/lib/finance/splits";
import { getCurrentTaxYear } from "@/lib/tax";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";
import { todayISO } from "@/lib/finance/dashboard";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import { INCOME_FREQUENCIES, INCOME_TYPES } from "@/lib/types";
import { toTaxProfile } from "@/lib/finance/tax-profile-context";
import type { HouseholdMember, Income, IncomeSplit, TaxProfileRow } from "@/lib/types";

const typeLabel = (v: string) => INCOME_TYPES.find((t) => t.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  INCOME_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

/** "Alice €1,200 · Bob €800" (or "Salary €1,200 · Rental €800") — omitted
 *  entirely when only one key contributes to a total, since it would just
 *  repeat the number above it. */
function breakdownLabel(amountsByKey: Map<string, number>, labelFor: (key: string) => string): string | null {
  const entries = [...amountsByKey.entries()].filter(([, amount]) => amount > 0);
  if (entries.length < 2) return null;
  return entries.map(([key, amount]) => `${labelFor(key)} ${formatEUR(amount)}`).join(" · ");
}

/** Small notes shown next to a row's gross amount — a row can have more
 *  than one adjustment at once (e.g. a rental with an overhead reserve),
 *  so this builds a list rather than picking just one. The currency
 *  conversion itself is already shown in the amount cell, not here. */
function adjustmentNotes(i: Income, gross: IncomeGrossBreakdown | undefined): string[] {
  const notes: string[] = [];
  if (i.type === "rental" && i.rental_overhead_pct > 0) {
    notes.push(`-${i.rental_overhead_pct}% overhead`);
  }
  if (i.type === "salary" && gross && gross.bonusAnnualTotal > 0) {
    notes.push(
      i.bonus_distribution === "spread"
        ? `Spread, +${formatEUR(gross.bonusAnnualTotal / 12)}/mo`
        : `${formatEUR(gross.bonusAnnualTotal)}/yr, one-time`
    );
  }
  return notes;
}

const ENDING_SOON_DAYS = 60;

/** Presentational only — derives a real tri-state from start/end dates already on the row. */
function incomeStatus(i: Income, onDate: string): { label: string; dotClassName: string } {
  if (!i.end_date) return { label: "Ongoing", dotClassName: "bg-foreground/30" };
  if (i.end_date < onDate) return { label: "Ended", dotClassName: "bg-muted-foreground/40" };
  const daysUntil = Math.round(
    (new Date(i.end_date).getTime() - new Date(onDate).getTime()) / 86_400_000
  );
  if (daysUntil <= ENDING_SOON_DAYS) {
    return { label: "Ending soon", dotClassName: "bg-[var(--status-warning)]" };
  }
  return { label: `Ends ${formatDateDisplay(i.end_date)}`, dotClassName: "bg-foreground/30" };
}

export default async function IncomePage() {
  const supabase = await createClient();
  const baselineProfileId = await getBaselineProfileId(supabase);

  const [{ data: income }, { data: members }, { data: taxProfiles }] = await Promise.all([
    supabase
      .from("income")
      .select(
        "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
      )
      .eq("profile_id", baselineProfileId)
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

  const rows = (income ?? []) as Income[];
  const householdMembers = (members ?? []) as HouseholdMember[];
  const memberById = new Map(householdMembers.map((m) => [m.id, m.name]));
  const memberRecordById = new Map(householdMembers.map((m) => [m.id, m]));
  const taxProfileByMember = new Map(
    ((taxProfiles ?? []) as TaxProfileRow[]).map((row) => [
      row.household_member_id,
      toTaxProfile(row, memberRecordById.get(row.household_member_id)),
    ])
  );

  const { data: splitRows } = await supabase
    .from("income_splits")
    .select("id, income_id, household_member_id, percentage")
    .in("income_id", rows.map((i) => i.id));
  const splitsByIncome = new Map<string, Split[]>();
  for (const s of (splitRows ?? []) as IncomeSplit[]) {
    splitsByIncome.set(s.income_id, [...(splitsByIncome.get(s.income_id) ?? []), s]);
  }

  const year = getCurrentTaxYear();
  const grossByRow = new Map<string, IncomeGrossBreakdown>();
  const netByRow = new Map<string, IncomeNetBreakdown>();
  const hasResolvedShareByRow = new Map<string, boolean>();
  let missingProfileCount = 0;

  const netBreakdownByRow = combinedNetBreakdownByRow(
    rows,
    (id) => splitsByIncome.get(id) ?? [],
    taxProfileByMember,
    year
  );
  for (const i of rows) {
    const splits = splitsByIncome.get(i.id) ?? [];
    grossByRow.set(i.id, incomeGrossBreakdownForRow(i, splits));
    const { net, missingShares } = netBreakdownByRow.get(i.id) ?? {
      net: { recurringMonthlyNet: 0, oneTimeAnnualNet: 0 },
      missingShares: Math.max(splits.length, 1),
    };
    netByRow.set(i.id, net);
    missingProfileCount += missingShares;
    hasResolvedShareByRow.set(i.id, missingShares < Math.max(splits.length, 1));
  }

  const totalMonthlyGross = rows.reduce(
    (sum, i) => sum + (grossByRow.get(i.id)?.recurringMonthlyGross ?? 0),
    0
  );
  const totalMonthlyNet = rows.reduce(
    (sum, i) => sum + (netByRow.get(i.id)?.recurringMonthlyNet ?? 0),
    0
  );
  const totalOneTimeGross = rows.reduce(
    (sum, i) => sum + (grossByRow.get(i.id)?.oneTimeAnnualGross ?? 0),
    0
  );
  const totalOneTimeNet = rows.reduce(
    (sum, i) => sum + (netByRow.get(i.id)?.oneTimeAnnualNet ?? 0),
    0
  );
  const totalAnnualCarAllowance = rows.reduce(
    (sum, i) => sum + (grossByRow.get(i.id)?.annualCarAllowance ?? 0),
    0
  );
  const totalAnnualPensionContribution = rows.reduce(
    (sum, i) => sum + (grossByRow.get(i.id)?.annualPensionContribution ?? 0),
    0
  );
  const totalMonthlyCompanyCarCost = rows.reduce(
    (sum, i) => sum + (grossByRow.get(i.id)?.monthlyCompanyCarCost ?? 0),
    0
  );
  const hasOneTimeBonus = totalOneTimeGross > 0;
  const hasReferenceFigures = totalAnnualCarAllowance > 0 || totalAnnualPensionContribution > 0;

  // Per-person breakdown — attributes each row's *share* (not the whole
  // row) to the person it actually belongs to, so a split row is correctly
  // divided between its people instead of double-counted.
  const netMonthlyByMember = new Map<string, number>();
  const grossMonthlyByMember = new Map<string, number>();
  const oneTimeNetByMember = new Map<string, number>();
  const oneTimeGrossByMember = new Map<string, number>();
  const pensionByMember = new Map<string, number>();
  const carByMember = new Map<string, number>();
  for (const share of combinedIncomeBreakdown(rows, (id) => splitsByIncome.get(id) ?? [], taxProfileByMember, year)) {
    if (!share.householdMemberId) continue; // unattributed — no one to attribute the share to
    const id = share.householdMemberId;
    netMonthlyByMember.set(
      id,
      (netMonthlyByMember.get(id) ?? 0) + (share.net?.recurringMonthlyNet ?? 0)
    );
    grossMonthlyByMember.set(
      id,
      (grossMonthlyByMember.get(id) ?? 0) + share.gross.recurringMonthlyGross
    );
    oneTimeNetByMember.set(id, (oneTimeNetByMember.get(id) ?? 0) + (share.net?.oneTimeAnnualNet ?? 0));
    oneTimeGrossByMember.set(id, (oneTimeGrossByMember.get(id) ?? 0) + share.gross.oneTimeAnnualGross);
    pensionByMember.set(id, (pensionByMember.get(id) ?? 0) + share.gross.annualPensionContribution);
    carByMember.set(id, (carByMember.get(id) ?? 0) + share.gross.annualCarAllowance);
  }
  const memberLabel = (id: string) => memberById.get(id) ?? "—";
  const netMonthlyBreakdown = breakdownLabel(netMonthlyByMember, memberLabel);
  const grossMonthlyBreakdown = breakdownLabel(grossMonthlyByMember, memberLabel);
  const oneTimeNetBreakdown = breakdownLabel(oneTimeNetByMember, memberLabel);
  const oneTimeGrossBreakdown = breakdownLabel(oneTimeGrossByMember, memberLabel);
  const pensionBreakdown = breakdownLabel(pensionByMember, memberLabel);
  const carBreakdown = breakdownLabel(carByMember, memberLabel);

  // Per-type breakdown — type is a whole-row property (not split across
  // people), so this sums straight from each row's own gross/net figures.
  // (Pension/car allowance are salary-only fields, so they can never have
  // more than one contributing type — no breakdown line needed there.)
  const netMonthlyByType = new Map<string, number>();
  const grossMonthlyByType = new Map<string, number>();
  const oneTimeNetByType = new Map<string, number>();
  const oneTimeGrossByType = new Map<string, number>();
  for (const i of rows) {
    const gross = grossByRow.get(i.id);
    const net = netByRow.get(i.id);
    netMonthlyByType.set(i.type, (netMonthlyByType.get(i.type) ?? 0) + (net?.recurringMonthlyNet ?? 0));
    grossMonthlyByType.set(
      i.type,
      (grossMonthlyByType.get(i.type) ?? 0) + (gross?.recurringMonthlyGross ?? 0)
    );
    oneTimeNetByType.set(i.type, (oneTimeNetByType.get(i.type) ?? 0) + (net?.oneTimeAnnualNet ?? 0));
    oneTimeGrossByType.set(
      i.type,
      (oneTimeGrossByType.get(i.type) ?? 0) + (gross?.oneTimeAnnualGross ?? 0)
    );
  }
  const netMonthlyByTypeBreakdown = breakdownLabel(netMonthlyByType, typeLabel);
  const grossMonthlyByTypeBreakdown = breakdownLabel(grossMonthlyByType, typeLabel);
  const oneTimeNetByTypeBreakdown = breakdownLabel(oneTimeNetByType, typeLabel);
  const oneTimeGrossByTypeBreakdown = breakdownLabel(oneTimeGrossByType, typeLabel);

  // Grouped by type (in the app's canonical order), each starting rolled up.
  const rowsByType = new Map<string, Income[]>();
  for (const i of rows) {
    rowsByType.set(i.type, [...(rowsByType.get(i.type) ?? []), i]);
  }
  const groups = INCOME_TYPES.map((t) => ({
    key: t.value,
    label: t.label,
    rows: rowsByType.get(t.value) ?? [],
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Income</h1>
          <p className="text-sm text-muted-foreground">
            Net figures use each member&apos;s tax profile ({year} rates).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href="/income/export" />}>
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button size="sm" render={<Link href="/income/new" />}>
            <Plus className="size-4" />
            Add income
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="glow-card">
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Total monthly (net)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-4xl font-extrabold tabular-nums tracking-tight">
              {formatEUR(totalMonthlyNet)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">/mo</span>
            {netMonthlyBreakdown && (
              <p className="mt-1 text-xs text-muted-foreground">{netMonthlyBreakdown}</p>
            )}
            {netMonthlyByTypeBreakdown && (
              <p className="mt-1 text-xs text-muted-foreground">{netMonthlyByTypeBreakdown}</p>
            )}
            {totalMonthlyCompanyCarCost > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Already includes a {formatEUR(totalMonthlyCompanyCarCost)}/mo company car
                deduction.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="glow-card">
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Total monthly (gross)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-4xl font-extrabold tabular-nums tracking-tight text-muted-foreground">
              {formatEUR(totalMonthlyGross)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">/mo</span>
            {grossMonthlyBreakdown && (
              <p className="mt-1 text-xs text-muted-foreground">{grossMonthlyBreakdown}</p>
            )}
            {grossMonthlyByTypeBreakdown && (
              <p className="mt-1 text-xs text-muted-foreground">{grossMonthlyByTypeBreakdown}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {hasOneTimeBonus && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Annual bonus, one-time (net)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-extrabold tabular-nums tracking-tight">
                {formatEUR(totalOneTimeNet)}
              </span>
              <span className="ml-1 text-sm text-muted-foreground">/yr</span>
              {oneTimeNetBreakdown && (
                <p className="mt-1 text-xs text-muted-foreground">{oneTimeNetBreakdown}</p>
              )}
              {oneTimeNetByTypeBreakdown && (
                <p className="mt-1 text-xs text-muted-foreground">{oneTimeNetByTypeBreakdown}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Christmas bonus, holiday pay, and annual bonus paid as one lump — not folded into
                the monthly figures above.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Annual bonus, one-time (gross)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-extrabold tabular-nums tracking-tight text-muted-foreground">
                {formatEUR(totalOneTimeGross)}
              </span>
              <span className="ml-1 text-sm text-muted-foreground">/yr</span>
              {oneTimeGrossBreakdown && (
                <p className="mt-1 text-xs text-muted-foreground">{oneTimeGrossBreakdown}</p>
              )}
              {oneTimeGrossByTypeBreakdown && (
                <p className="mt-1 text-xs text-muted-foreground">{oneTimeGrossByTypeBreakdown}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {hasReferenceFigures && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Reference only — not part of gross or net income
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <span className="text-lg font-semibold tabular-nums">
                {formatEUR(totalAnnualPensionContribution)}
              </span>
              <span className="ml-1 text-sm text-muted-foreground">/yr pension contribution</span>
              {pensionBreakdown && (
                <p className="mt-1 text-xs text-muted-foreground">{pensionBreakdown}</p>
              )}
            </div>
            <div>
              <span className="text-lg font-semibold tabular-nums">
                {formatEUR(totalAnnualCarAllowance)}
              </span>
              <span className="ml-1 text-sm text-muted-foreground">/yr car allowance</span>
              {carBreakdown && <p className="mt-1 text-xs text-muted-foreground">{carBreakdown}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {missingProfileCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {missingProfileCount} income {missingProfileCount === 1 ? "share isn't" : "shares aren't"}{" "}
          linked to a taxed person yet, so {missingProfileCount === 1 ? "it's" : "they're"} excluded
          from the net total.{" "}
          <Link href="/household" className="underline underline-offset-2">
            Set up tax profiles
          </Link>
          .
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            All income
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">No income sources yet.</p>
              <Button size="sm" variant="outline" render={<Link href="/income/new" />}>
                Add your first income source
              </Button>
            </div>
          ) : (
            <Table aria-label="Income sources">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Linked to</TableHead>
                  <TableHead scope="col" className="text-right">
                    Gross amount
                  </TableHead>
                  <TableHead scope="col">Frequency</TableHead>
                  <TableHead scope="col">Adjustments</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">
                    Net/mo
                  </TableHead>
                  <TableHead scope="col" className="w-24 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              {groups.map((group) => {
                const groupNet = group.rows.reduce(
                  (sum, i) => sum + (netByRow.get(i.id)?.recurringMonthlyNet ?? 0),
                  0
                );
                return (
                  <CollapsibleTableGroup
                    key={group.key}
                    label={group.label}
                    total={formatEUR(groupNet)}
                    colSpan={6}
                  >
                    {group.rows.map((i) => {
                      const splits = splitsByIncome.get(i.id) ?? [];
                      const gross = grossByRow.get(i.id);
                      const net = netByRow.get(i.id)?.recurringMonthlyNet;
                      const hasResolvedShare = hasResolvedShareByRow.get(i.id) ?? false;
                      const status = incomeStatus(i, todayISO());
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell>{splitLabel(splits, memberById)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <CurrencyAmount
                              amount={i.gross_amount}
                              currency={i.currency}
                              exchangeRateToEur={i.exchange_rate_to_eur}
                            />
                          </TableCell>
                          <TableCell>{frequencyLabel(i.frequency)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {adjustmentNotes(i, gross).join(" · ") || "—"}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                              <span className={`size-1.5 shrink-0 rounded-full ${status.dotClassName}`} aria-hidden />
                              {status.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {hasResolvedShare && net !== undefined ? (
                              formatEUR(net)
                            ) : (
                              <Badge variant="outline" className="font-normal text-muted-foreground">
                                no tax profile
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit"
                                render={<Link href={`/income/${i.id}/edit`} />}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <DeleteButton
                                action={deleteIncome.bind(null, i.id)}
                                confirmMessage={`Delete "${i.name}"?`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </CollapsibleTableGroup>
                );
              })}
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
