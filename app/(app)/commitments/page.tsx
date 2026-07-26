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
import { formatDateDisplay } from "@/lib/finance/date-utils";
import { COMMITMENT_CATEGORIES, COMMITMENT_FREQUENCIES } from "@/lib/types";
import type { Commitment, CommitmentSplit, HouseholdMember, Property } from "@/lib/types";

const categoryLabel = (v: string) =>
  COMMITMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  COMMITMENT_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

const ENDING_SOON_DAYS = 60;

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
    supabase.from("household_members").select("id, name, created_at"),
    supabase.from("properties").select("id, profile_id, name, address, notes, end_date"),
  ]);
  let rows = (commitments ?? []) as Commitment[];
  const memberById = new Map(
    ((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name])
  );

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

  const totalMonthly = rows.reduce((sum, c) => {
    const monthly = toMonthlyEquivalent(c.amount, c.frequency);
    const splits = splitsByCommitment.get(c.id) ?? [];
    return sum + (isMemberFilter ? memberShareOfAmount(monthly, splits, owner!) : monthly);
  }, 0);

  const onDate = todayISO();

  // Grouped by property (alphabetical), then a final "No property" group —
  // costs within each group ordered biggest-first, same as everywhere else.
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
  const groups = [
    ...((properties ?? []) as Property[])
      .filter((p) => commitmentsByProperty.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        key: p.id,
        label: p.name,
        commitments: sortCommitmentsByCost(commitmentsByProperty.get(p.id)!),
      })),
    { key: "none", label: "No property", commitments: sortCommitmentsByCost(unassigned) },
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
        <Card>
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
                  (sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency),
                  0
                );
                return (
                  <CollapsibleTableGroup
                    key={group.key}
                    label={group.label}
                    href={group.key === "none" ? undefined : `/properties/${group.key}`}
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
