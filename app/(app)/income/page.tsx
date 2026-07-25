import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteIncome } from "./actions";
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
import { DeleteButton } from "@/components/delete-button";
import { toMonthlyEquivalent, formatEUR } from "@/lib/finance/frequency";
import { INCOME_FREQUENCIES, INCOME_TYPES } from "@/lib/types";
import type { HouseholdMember, Income } from "@/lib/types";

const typeLabel = (v: string) => INCOME_TYPES.find((t) => t.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  INCOME_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

export default async function IncomePage() {
  const supabase = await createClient();

  const [{ data: income }, { data: members }] = await Promise.all([
    supabase
      .from("income")
      .select(
        "id, profile_id, household_member_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id"
      )
      .order("name"),
    supabase.from("household_members").select("id, name, created_at"),
  ]);

  const rows = (income ?? []) as Income[];
  const memberById = new Map(
    ((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name])
  );

  const totalMonthly = rows.reduce(
    (sum, i) => sum + toMonthlyEquivalent(i.gross_amount, i.frequency),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Income</h1>
          <p className="text-sm text-muted-foreground">
            Gross figures for now — net conversion lands in Phase 3.
          </p>
        </div>
        <Button size="sm" render={<Link href="/income/new" />}>
          <Plus className="size-4" />
          Add income
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total monthly-equivalent (gross)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold tabular-nums tracking-tight">
            {formatEUR(totalMonthly)}
          </span>
          <span className="ml-1 text-sm text-muted-foreground">/mo</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
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
                  <TableHead scope="col" className="text-right">
                    Monthly-equiv.
                  </TableHead>
                  <TableHead scope="col" className="w-24 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{memberById.get(i.household_member_id) ?? "—"}</TableCell>
                    <TableCell>{typeLabel(i.type)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEUR(i.gross_amount)}
                    </TableCell>
                    <TableCell>{frequencyLabel(i.frequency)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEUR(toMonthlyEquivalent(i.gross_amount, i.frequency))}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
