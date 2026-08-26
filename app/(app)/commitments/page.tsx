import Link from "next/link";
import { Plus, Pencil, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteCommitment } from "./actions";
import { CommitmentFilters } from "./filters";
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
import { CollapsibleTableGroup } from "@/components/collapsible-table-group";
import { toMonthlyEquivalent, formatEUR, sortCommitmentsByCost } from "@/lib/finance/frequency";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";
import { memberShareOfAmount, splitLabel } from "@/lib/finance/splits";
import { todayISO } from "@/lib/finance/dashboard";
import { formatDateDisplay, isActiveOn } from "@/lib/finance/date-utils";
import { healthInsuranceOutgoings } from "@/lib/finance/health-insurance-outgoing";
import { COMMITMENT_CATEGORIES, COMMITMENT_FREQUENCIES } from "@/lib/types";
import type { Commitment, CommitmentCategory, CommitmentSplit, HouseholdMember, Property } from "@/lib/types";

const categoryLabel = (v: string) =>
  COMMITMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  COMMITMENT_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

const ENDING_SOON_DAYS = 60;

/** Synthetic health-insurance rows (see health-insurance-outgoing.ts) use this
 *  id prefix and have no backing DB row — no edit/delete affordances. */
const isSyntheticHealthInsurance = (c: Commitment) => c.id.startsWith("health-insurance-");

/** Presentational only — derives a real tri-state from start/end dates already on the row. */
function commitmentStatus(c: Commitment, onDate: string): { label: string; dotClassName: string } {
  if (c.frequency === "one_off") return { label: "One-off", dotClassName: "bg-muted-foreground/40" };
  if (!c.end_date) return { label: "Ongoing", dotClassName: "bg-foreground/30" };
  if (c.end_date < onDate) return { label: "Ended", dotClassName: "bg-muted-foreground/40" };
  const daysUntil = Math.round(
    (new Date(c.end_date).getTime() - new Date(onDate).getTime()) / 86_400_000
  );
  if (daysUntil <= ENDING_SOON_DAYS) {
    return { label: "Ending soon", dotClassName: "bg-[var(--status-warning)]" };
  }
  return { label: `Ends ${formatDateDisplay(c.end_date)}`, dotClassName: "bg-foreground/30" };
}

export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; category?: string }>;
}) {
  const { owner, category } = await searchParams;
  const supabase = await createClient();
  const baselineProfileId = await getBaselineProfileId(supabase);

  let query = supabase
    .from("commitments")
    .select(
      "id, profile_id, name, category, amount, frequency, essential, start_date, end_date, property_id"
    )
    .eq("profile_id", baselineProfileId)
    .order("name");

  if (category) query = query.eq("category", category);

  const [{ data: commitments }, { data: members }, { data: properties }] = await Promise.all([
    query,
    supabase
      .from("household_members")
      .select(
        "id, name, created_at, statutory_health_insurance, count_private_health_insurance_as_outgoing, private_health_insurance_monthly_premium"
      ),
    supabase.from("properties").select("id, profile_id, name, address, notes, end_date"),
  ]);
  let rows = (commitments ?? []) as Commitment[];
  const householdMembers = (members ?? []) as HouseholdMember[];
  const memberById = new Map(householdMembers.map((m) => [m.id, m.name]));

  const { data: splitRows } = await supabase
    .from("commitment_splits")
    .select("id, commitment_id, household_member_id, percentage")
    .in("commitment_id", rows.map((c) => c.id));
  const allSplits = (splitRows ?? []) as CommitmentSplit[];
  const splitsByCommitment = new Map<string, CommitmentSplit[]>();
  for (const s of allSplits) {
    splitsByCommitment.set(s.commitment_id, [
      ...(splitsByCommitment.get(s.commitment_id) ?? []),
      s,
    ]);
  }

  // Synthetic "private health insurance" outgoing (never a real DB row — see
  // lib/finance/health-insurance-outgoing.ts) folded in so this page's total
  // matches the Overview dashboard's, which already includes it. Respects
  // the category filter since every synthetic row is "insurance". Each gets
  // a 100%-to-that-member virtual split so the owner filter attributes it
  // correctly instead of falling into the unattributed "household" bucket.
  const healthInsuranceCommitments =
    !category || category === "insurance"
      ? healthInsuranceOutgoings(householdMembers, baselineProfileId)
      : [];
  for (const c of healthInsuranceCommitments) {
    const memberId = c.id.replace("health-insurance-", "");
    splitsByCommitment.set(c.id, [
      { id: `virtual-${c.id}`, commitment_id: c.id, household_member_id: memberId, percentage: 100 },
    ]);
  }
  rows = [...rows, ...healthInsuranceCommitments];

  if (owner === "household") {
    rows = rows.filter((c) => (splitsByCommitment.get(c.id) ?? []).length === 0);
  } else if (owner === "non-household") {
    rows = rows.filter((c) => (splitsByCommitment.get(c.id) ?? []).length > 0);
  } else if (owner) {
    rows = rows.filter((c) =>
      (splitsByCommitment.get(c.id) ?? []).some((s) => s.household_member_id === owner)
    );
  }

  // Only an actual person filter prorates to their share — "household" and
  // "non-household" are aggregate views, not one person's slice.
  const isMemberFilter = !!owner && memberById.has(owner);
  const onDate = todayISO();

  // Matches Overview's activeCommitments() — a not-yet-started or already-ended
  // commitment (see its Status badge below) doesn't count toward the live total,
  // so this figure and the Overview surplus/deficit stay in agreement.
  const totalMonthly = rows.reduce((sum, c) => {
    if (!isActiveOn(c.start_date, c.end_date, onDate)) return sum;
    const monthly = toMonthlyEquivalent(c.amount, c.frequency);
    const splits = splitsByCommitment.get(c.id) ?? [];
    return sum + (isMemberFilter ? memberShareOfAmount(monthly, splits, owner!) : monthly);
  }, 0);

  // Grouped by property (alphabetical), then every property-less commitment
  // sub-grouped by category instead of one flat "No property" bucket — each
  // category its own collapsible group, in the app's canonical category
  // order (COMMITMENT_CATEGORIES), same "fixed enum, declared order" idiom
  // income/page.tsx already uses for its own type-grouping. Costs within
  // each group ordered biggest-first, same as everywhere else.
  const commitmentsByProperty = new Map<string, Commitment[]>();
  const unassigned: Commitment[] = [];
  for (const c of rows) {
    if (c.property_id) {
      commitmentsByProperty.set(c.property_id, [
        ...(commitmentsByProperty.get(c.property_id) ?? []),
        c,
      ]);
    } else {
      unassigned.push(c);
    }
  }
  const unassignedByCategory = new Map<CommitmentCategory, Commitment[]>();
  for (const c of unassigned) {
    unassignedByCategory.set(c.category, [...(unassignedByCategory.get(c.category) ?? []), c]);
  }
  const groups = [
    ...((properties ?? []) as Property[])
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commitments</h1>
          <p className="text-sm text-muted-foreground">
            Everything the household spends — recurring and one-off.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href="/commitments/export" />}>
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button size="sm" render={<Link href="/commitments/new" />}>
            <Plus className="size-4" />
            Add commitment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="glow-card">
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Total monthly-equivalent
              {isMemberFilter ? ` — ${memberById.get(owner!) ?? ""}'s share` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-4xl font-extrabold tabular-nums tracking-tight">
              {formatEUR(totalMonthly)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">/mo</span>
            <p className="mt-1 text-xs text-muted-foreground">
              Active commitments only — matches the Overview surplus/deficit figure.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            All commitments
          </CardTitle>
          <CommitmentFilters members={(members ?? []) as HouseholdMember[]} />
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No commitments match yet.
              </p>
              <Button size="sm" variant="outline" render={<Link href="/commitments/new" />}>
                Add your first commitment
              </Button>
            </div>
          ) : (
            <Table aria-label="Commitments">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Category</TableHead>
                  <TableHead scope="col">Linked to</TableHead>
                  <TableHead scope="col" className="text-right">
                    Amount
                  </TableHead>
                  <TableHead scope="col">Frequency</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">
                    Monthly-equiv.
                  </TableHead>
                  <TableHead scope="col" className="w-24 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              {groups.map((group) => {
                const groupMonthly = group.commitments.reduce(
                  (sum, c) =>
                    sum +
                    (isActiveOn(c.start_date, c.end_date, onDate)
                      ? toMonthlyEquivalent(c.amount, c.frequency)
                      : 0),
                  0
                );
                return (
                  <CollapsibleTableGroup
                    key={group.key}
                    label={group.label}
                    href={group.type === "property" ? `/properties/${group.key}` : undefined}
                    total={formatEUR(groupMonthly)}
                    colSpan={6}
                  >
                    {group.commitments.map((c) => {
                      const splits = splitsByCommitment.get(c.id) ?? [];
                      const monthly = toMonthlyEquivalent(c.amount, c.frequency);
                      const displayMonthly = isMemberFilter
                        ? memberShareOfAmount(monthly, splits, owner!)
                        : monthly;
                      const status = commitmentStatus(c, onDate);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {c.name}
                              {!c.essential && (
                                <Badge
                                  variant="outline"
                                  className="border-[var(--status-discretionary)]/30 bg-[var(--status-discretionary)]/10 text-[var(--status-discretionary)] text-xs font-normal"
                                >
                                  Discretionary
                                </Badge>
                              )}
                              {isSyntheticHealthInsurance(c) && (
                                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                  Auto — from Household
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{categoryLabel(c.category)}</TableCell>
                          <TableCell>{splitLabel(splits, memberById)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatEUR(c.amount)}
                          </TableCell>
                          <TableCell>{frequencyLabel(c.frequency)}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                              <span className={`size-1.5 shrink-0 rounded-full ${status.dotClassName}`} aria-hidden />
                              {status.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatEUR(displayMonthly)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {isSyntheticHealthInsurance(c) ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Edit in Household"
                                  render={
                                    <Link
                                      href={`/household/${c.id.replace("health-insurance-", "")}/edit`}
                                    />
                                  }
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Edit"
                                    render={<Link href={`/commitments/${c.id}/edit`} />}
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                  <DeleteButton
                                    action={deleteCommitment.bind(null, c.id)}
                                    confirmMessage={`Delete "${c.name}"?`}
                                  />
                                </>
                              )}
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
