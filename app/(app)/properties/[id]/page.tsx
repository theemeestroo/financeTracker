import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteCommitment, createCommitment } from "../../commitments/actions";
import { CommitmentForm } from "../../commitments/commitment-form";
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
import { toMonthlyEquivalent, formatEUR, sortCommitmentsByCost } from "@/lib/finance/frequency";
import { splitLabel } from "@/lib/finance/splits";
import { propertiesWithSplits } from "@/lib/finance/property-splits";
import { todayISO } from "@/lib/finance/dashboard";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import { COMMITMENT_CATEGORIES, COMMITMENT_FREQUENCIES } from "@/lib/types";
import type { Commitment, CommitmentSplit, HouseholdMember, Property, PropertySplit } from "@/lib/types";
import { PropertySwitcher } from "./property-switcher";

const categoryLabel = (v: string) =>
  COMMITMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  COMMITMENT_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

function propertyStatus(p: Property, onDate: string): { label: string; dotClassName: string } {
  if (!p.end_date) return { label: "Active", dotClassName: "bg-foreground/30" };
  if (p.end_date < onDate) return { label: "Ended", dotClassName: "bg-muted-foreground/40" };
  return { label: `Ends ${formatDateDisplay(p.end_date)}`, dotClassName: "bg-[var(--status-warning)]" };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: property }, { data: members }, { data: commitments }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, profile_id, name, address, notes, end_date")
      .eq("id", id)
      .single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
    supabase
      .from("commitments")
      .select(
        "id, profile_id, name, category, amount, frequency, essential, start_date, end_date, property_id"
      )
      .eq("property_id", id)
      .order("name"),
  ]);

  if (!property) notFound();
  const typedProperty = property as Property;

  const householdMembers = (members ?? []) as HouseholdMember[];
  const memberById = new Map(householdMembers.map((m) => [m.id, m.name]));
  const commitmentRows = (commitments ?? []) as Commitment[];
  const redirectTo = `/properties/${id}`;

  const [{ data: propertySplitRows }, { data: commitmentSplitRows }, { properties, splitsByProperty }] =
    await Promise.all([
      supabase
        .from("property_splits")
        .select("id, property_id, household_member_id, percentage")
        .eq("property_id", id),
      supabase
        .from("commitment_splits")
        .select("id, commitment_id, household_member_id, percentage")
        .in("commitment_id", commitmentRows.map((c) => c.id)),
      propertiesWithSplits(supabase, typedProperty.profile_id),
    ]);

  const ownerSplits = (propertySplitRows ?? []) as PropertySplit[];
  const splitsByCommitment = new Map<string, CommitmentSplit[]>();
  for (const s of (commitmentSplitRows ?? []) as CommitmentSplit[]) {
    splitsByCommitment.set(s.commitment_id, [
      ...(splitsByCommitment.get(s.commitment_id) ?? []),
      s,
    ]);
  }

  const totalMonthly = commitmentRows.reduce(
    (sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency),
    0
  );
  const status = propertyStatus(typedProperty, todayISO());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PropertySwitcher properties={properties} currentId={id} />
            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
              <span className={`size-1.5 shrink-0 rounded-full ${status.dotClassName}`} aria-hidden />
              {status.label}
            </span>
          </div>
          {typedProperty.address && (
            <p className="text-sm text-muted-foreground">{typedProperty.address}</p>
          )}
        </div>
        <Button variant="outline" size="sm" render={<Link href={`/properties/${id}/edit`} />}>
          <Pencil className="size-4" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Owned by
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-lg font-semibold">{splitLabel(ownerSplits, memberById)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Linked costs (monthly-equiv.)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-extrabold tabular-nums tracking-tight">
              {formatEUR(totalMonthly)}
            </span>
            <span className="ml-1 text-sm text-muted-foreground">/mo</span>
          </CardContent>
        </Card>
      </div>

      {typedProperty.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{typedProperty.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Linked costs
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {commitmentRows.length > 0 && (
            <Table aria-label="Property commitments">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Category</TableHead>
                  <TableHead scope="col">Linked to</TableHead>
                  <TableHead scope="col" className="text-right">
                    Amount
                  </TableHead>
                  <TableHead scope="col">Frequency</TableHead>
                  <TableHead scope="col" className="w-20 text-right">
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
                    <TableCell className="text-right tabular-nums">{formatEUR(c.amount)}</TableCell>
                    <TableCell>{frequencyLabel(c.frequency)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          render={
                            <Link
                              href={`/commitments/${c.id}/edit?redirectTo=${encodeURIComponent(redirectTo)}`}
                            />
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteButton
                          action={deleteCommitment.bind(null, c.id, redirectTo)}
                          confirmMessage={`Delete "${c.name}"?`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <details className="rounded-lg border p-3" open={commitmentRows.length === 0}>
            <summary className="cursor-pointer text-sm font-medium">Add cost</summary>
            <div className="mt-4">
              <CommitmentForm
                action={createCommitment}
                members={householdMembers}
                defaultValues={{ property_id: id }}
                properties={properties}
                propertySplitsByProperty={splitsByProperty}
                profileId={typedProperty.profile_id}
                redirectTo={redirectTo}
              />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
