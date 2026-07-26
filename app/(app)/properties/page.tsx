import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteProperty } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/components/delete-button";
import { toMonthlyEquivalent, formatEUR, sortCommitmentsByCost } from "@/lib/finance/frequency";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";
import { splitLabel } from "@/lib/finance/splits";
import { todayISO } from "@/lib/finance/dashboard";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import type { Commitment, HouseholdMember, Property, PropertySplit } from "@/lib/types";

function propertyStatus(p: Property, onDate: string): { label: string; dotClassName: string } {
  if (!p.end_date) return { label: "Active", dotClassName: "bg-foreground/30" };
  if (p.end_date < onDate) return { label: "Ended", dotClassName: "bg-muted-foreground/40" };
  return { label: `Ends ${formatDateDisplay(p.end_date)}`, dotClassName: "bg-[var(--status-warning)]" };
}

export default async function PropertiesPage() {
  const supabase = await createClient();
  const baselineProfileId = await getBaselineProfileId(supabase);

  const [{ data: properties }, { data: members }, { data: commitments }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, profile_id, name, address, notes, end_date")
      .eq("profile_id", baselineProfileId)
      .order("name"),
    supabase.from("household_members").select("id, name, created_at"),
    supabase
      .from("commitments")
      .select("id, profile_id, name, category, amount, frequency, essential, start_date, end_date, property_id")
      .eq("profile_id", baselineProfileId)
      .order("name"),
  ]);

  const rows = (properties ?? []) as Property[];
  const memberById = new Map(((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name]));
  const allCommitments = (commitments ?? []) as Commitment[];

  const { data: splitRows } = await supabase
    .from("property_splits")
    .select("id, property_id, household_member_id, percentage")
    .in("property_id", rows.map((p) => p.id));
  const splitsByProperty = new Map<string, PropertySplit[]>();
  for (const s of (splitRows ?? []) as PropertySplit[]) {
    splitsByProperty.set(s.property_id, [...(splitsByProperty.get(s.property_id) ?? []), s]);
  }

  const commitmentsByProperty = new Map<string, Commitment[]>();
  for (const c of allCommitments) {
    if (!c.property_id) continue;
    commitmentsByProperty.set(c.property_id, [
      ...(commitmentsByProperty.get(c.property_id) ?? []),
      c,
    ]);
  }

  const onDate = todayISO();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground">
            Physical assets — link commitments to a property to group and end them together.
          </p>
        </div>
        <Button size="sm" render={<Link href="/properties/new" />}>
          <Plus className="size-4" />
          Add property
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">No properties yet.</p>
            <Button size="sm" variant="outline" render={<Link href="/properties/new" />}>
              Add your first property
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => {
            const splits = splitsByProperty.get(p.id) ?? [];
            const linked = sortCommitmentsByCost(commitmentsByProperty.get(p.id) ?? []);
            const linkedMonthly = linked.reduce(
              (sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency),
              0
            );
            const status = propertyStatus(p, onDate);
            return (
              <Card key={p.id} className="flex flex-col">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href={`/properties/${p.id}`}
                      className="hover:underline underline-offset-2"
                    >
                      <CardTitle className="text-base font-semibold tracking-tight">
                        {p.name}
                      </CardTitle>
                    </Link>
                    {p.address && (
                      <span className="text-xs text-muted-foreground">{p.address}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit"
                      render={<Link href={`/properties/${p.id}/edit`} />}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteButton
                      action={deleteProperty.bind(null, p.id)}
                      confirmMessage={`Delete "${p.name}"? Linked commitments will remain, unlinked.`}
                    />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{splitLabel(splits, memberById)}</span>
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      <span className={`size-1.5 shrink-0 rounded-full ${status.dotClassName}`} aria-hidden />
                      {status.label}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-1 border-t pt-2">
                    {linked.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No costs linked yet.</p>
                    ) : (
                      linked.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between text-xs text-muted-foreground"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="shrink-0 tabular-nums">
                            {formatEUR(toMonthlyEquivalent(c.amount, c.frequency))}/mo
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{formatEUR(linkedMonthly)}/mo</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
