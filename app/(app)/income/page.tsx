import Link from "next/link";
import { Plus, Pencil, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteIncome } from "./actions";
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
import { formatEUR } from "@/lib/finance/frequency";
import {
  incomeGrossBreakdown,
  incomeNetBreakdown,
  type IncomeGrossBreakdown,
  type IncomeNetBreakdown,
} from "@/lib/finance/income-gross";
import { getCurrentTaxYear } from "@/lib/tax";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";
import { todayISO } from "@/lib/finance/dashboard";
import { INCOME_FREQUENCIES, INCOME_TYPES } from "@/lib/types";
import type { HouseholdMember, Income, TaxProfile } from "@/lib/types";

const typeLabel = (v: string) => INCOME_TYPES.find((t) => t.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  INCOME_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

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
  return { label: `Ends ${i.end_date}`, dotClassName: "bg-foreground/30" };
}

export default async function IncomePage() {
  const supabase = await createClient();
  const baselineProfileId = await getBaselineProfileId(supabase);

  const [{ data: income }, { data: members }, { data: taxProfiles }] = await Promise.all([
    supabase
      .from("income")
      .select(
        "id, profile_id, household_member_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost"
      )
      .eq("profile_id", baselineProfileId)
      .order("name"),
    supabase.from("household_members").select("id, name, created_at"),
    supabase
      .from("tax_profiles")
      .select(
        "id, household_member_id, tax_class, church_tax, church_tax_state, has_children, statutory_health_insurance, health_insurance_addon_rate"
      ),
  ]);

  const rows = (income ?? []) as Income[];
  const memberById = new Map(
    ((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name])
  );
  const taxProfileByMember = new Map(
    ((taxProfiles ?? []) as TaxProfile[]).map((p) => [p.household_member_id, p])
  );

  const year = getCurrentTaxYear();
  const grossByRow = new Map<string, IncomeGrossBreakdown>();
  const netByRow = new Map<string, IncomeNetBreakdown>();
  let missingProfileCount = 0;

  for (const i of rows) {
    grossByRow.set(i.id, incomeGrossBreakdown(i));
    const profile = taxProfileByMember.get(i.household_member_id);
    if (!profile) {
      missingProfileCount += 1;
      continue;
    }
    netByRow.set(i.id, incomeNetBreakdown(i, profile, year));
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
        <Card>
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
            {totalMonthlyCompanyCarCost > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Already includes a {formatEUR(totalMonthlyCompanyCarCost)}/mo company car
                deduction.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
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
            </div>
            <div>
              <span className="text-lg font-semibold tabular-nums">
                {formatEUR(totalAnnualCarAllowance)}
              </span>
              <span className="ml-1 text-sm text-muted-foreground">/yr car allowance</span>
            </div>
          </CardContent>
        </Card>
      )}

      {missingProfileCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {missingProfileCount} income {missingProfileCount === 1 ? "source has" : "sources have"} no
          tax profile set for their household member yet, so they&apos;re excluded from the net
          total.{" "}
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
                  <TableHead scope="col">Member</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col" className="text-right">
                    Gross amount
                  </TableHead>
                  <TableHead scope="col">Frequency</TableHead>
                  <TableHead scope="col">Bonus</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">
                    Net/mo
                  </TableHead>
                  <TableHead scope="col" className="w-24 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => {
                  const gross = grossByRow.get(i.id);
                  const net = netByRow.get(i.id)?.recurringMonthlyNet;
                  const status = incomeStatus(i, todayISO());
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell>{memberById.get(i.household_member_id) ?? "—"}</TableCell>
                      <TableCell>{typeLabel(i.type)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(i.gross_amount)}
                      </TableCell>
                      <TableCell>{frequencyLabel(i.frequency)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {!gross || gross.bonusAnnualTotal <= 0
                          ? "—"
                          : i.bonus_distribution === "spread"
                            ? `Spread, +${formatEUR(gross.bonusAnnualTotal / 12)}/mo`
                            : `${formatEUR(gross.bonusAnnualTotal)}/yr, one-time`}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                          <span className={`size-1.5 shrink-0 rounded-full ${status.dotClassName}`} aria-hidden />
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {net !== undefined ? (
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
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
