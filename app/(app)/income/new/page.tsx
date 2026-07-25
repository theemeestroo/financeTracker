import { createClient } from "@/lib/supabase/server";
import { IncomeForm } from "../income-form";
import { createIncome } from "../actions";
import type { HouseholdMember } from "@/lib/types";

export default async function NewIncomePage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("household_members")
    .select("id, name, created_at")
    .order("name");

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Add income</h1>
      </div>
      <IncomeForm action={createIncome} members={(members ?? []) as HouseholdMember[]} />
    </div>
  );
}
