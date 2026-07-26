import Link from "next/link";
import { Plus, Pencil, Landmark } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteHouseholdMember } from "./actions";
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
import { TAX_CLASSES } from "@/lib/types";
import type { HouseholdMember } from "@/lib/types";

export default async function HouseholdPage() {
  const supabase = await createClient();
  const [{ data: members }, { data: taxProfiles }] = await Promise.all([
    supabase
      .from("household_members")
      .select("id, name, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("tax_profiles").select("household_member_id, tax_class"),
  ]);

  const rows = (members ?? []) as HouseholdMember[];
  const taxClassByMember = new Map(
    (taxProfiles ?? []).map((p) => [p.household_member_id as string, p.tax_class as number])
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Household</h1>
          <p className="text-sm text-muted-foreground">
            People commitments and income can be attributed to.
          </p>
        </div>
        <Button size="sm" render={<Link href="/household/new" />}>
          <Plus className="size-4" />
          Add member
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No household members yet.
              </p>
              <Button size="sm" variant="outline" render={<Link href="/household/new" />}>
                Add your first member
              </Button>
            </div>
          ) : (
            <Table aria-label="Household members">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Tax profile</TableHead>
                  <TableHead scope="col" className="w-24 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((member) => {
                  const taxClass = taxClassByMember.get(member.id);
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell>
                        {taxClass ? (
                          <Link
                            href={`/household/${member.id}/tax-profile`}
                            className="flex w-fit items-center gap-1.5 text-sm hover:underline"
                          >
                            <span className="size-1.5 shrink-0 rounded-full bg-foreground/30" aria-hidden />
                            {TAX_CLASSES.find((c) => c.value === taxClass)?.label ?? taxClass}
                          </Link>
                        ) : (
                          <Link
                            href={`/household/${member.id}/tax-profile`}
                            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
                          >
                            <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                            <Landmark className="size-3.5" />
                            Set up
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            render={<Link href={`/household/${member.id}/edit`} />}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <DeleteButton
                            action={deleteHouseholdMember.bind(null, member.id)}
                            confirmMessage={`Remove ${member.name} from the household?`}
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
