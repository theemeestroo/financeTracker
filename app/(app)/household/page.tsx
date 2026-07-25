import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
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
import type { HouseholdMember } from "@/lib/types";

export default async function HouseholdPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("household_members")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  const rows = (members ?? []) as HouseholdMember[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Household</h1>
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
          <CardTitle className="text-sm font-medium text-muted-foreground">
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
                  <TableHead scope="col" className="w-24 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
