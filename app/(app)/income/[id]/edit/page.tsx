import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IncomeForm } from "../../income-form";
import { updateIncome } from "../../actions";
import type { HouseholdMember, Income } from "@/lib/types";

export default async function EditIncomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: income }, { data: members }] = await Promise.all([
    supabase
      .from("income")
      .select(
        "id, profile_id, household_member_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id"
      )
      .eq("id", id)
      .single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
  ]);

  if (!income) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Edit income</h1>
      </div>
      <IncomeForm
        action={updateIncome.bind(null, id)}
        members={(members ?? []) as HouseholdMember[]}
        defaultValues={income as Income}
      />
    </div>
  );
}
