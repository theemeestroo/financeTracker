import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteCommitment } from "./actions";
import { CommitmentFilters } from "./filters";
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
import { toMonthlyEquivalent, formatEUR } from "@/lib/finance/frequency";
import { COMMITMENT_CATEGORIES, COMMITMENT_FREQUENCIES } from "@/lib/types";
import type { Commitment, HouseholdMember } from "@/lib/types";

const categoryLabel = (v: string) =>
  COMMITMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  COMMITMENT_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

export default async function CommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ownership?: string; category?: string }>;
}) {
  const { ownership, category } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("commitments")
    .select(
      "id, profile_id, name, category, amount, frequency, essential, ownership, household_member_id, start_date, end_date"
    )
    .order("name");

  if (ownership) query = query.eq("ownership", ownership);
  if (category) query = query.eq("category", category);

  const [{ data: commitments }, { data: members }] = await Promise.all([
    query,
    supabase.from("household_members").select("id, name, created_at"),
  ]);

  const rows = (commitments ?? []) as Commitment[];
  const memberById = new Map(
    ((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name])
  );

  const totalMonthly = rows.reduce(
    (sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Commitments</h1>
          <p className="text-sm text-muted-foreground">
            Everything the household spends — recurring and one-off.
          </p>
        </div>
        <Button size="sm" render={<Link href="/commitments/new" />}>
          <Plus className="size-4" />
          Add commitment
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total monthly-equivalent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold tabular-nums tracking-tight">
              {formatEUR(totalMonthly)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">/mo</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            All commitments
          </CardTitle>
          <CommitmentFilters />
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
                  <TableHead scope="col">Owner</TableHead>
                  <TableHead scope="col" className="text-right">
                    Amount
                  </TableHead>
                  <TableHead scope="col">Frequency</TableHead>
                  <TableHead scope="col" className="text-right">
                    Monthly-equiv.
                  </TableHead>
                  <TableHead scope="col" className="w-24 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {c.name}
                        {!c.essential && (
                          <Badge variant="outline" className="text-xs font-normal">
                            Discretionary
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{categoryLabel(c.category)}</TableCell>
                    <TableCell>
                      {c.ownership === "shared"
                        ? "Shared"
                        : memberById.get(c.household_member_id ?? "") ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEUR(c.amount)}
                    </TableCell>
                    <TableCell>{frequencyLabel(c.frequency)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEUR(toMonthlyEquivalent(c.amount, c.frequency))}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
