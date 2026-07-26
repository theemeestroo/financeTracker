import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IncomeForm } from "../../income-form";
import { updateIncome } from "../../actions";
import type { HouseholdMember, Income, IncomeSplit } from "@/lib/types";

export default async function EditIncomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: income }, { data: members }, { data: splits }] = await Promise.all([
    supabase
      .from("income")
      .select(
        "id, profile_id, name, gross_amount, type, frequency, start_date, end_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost, rental_overhead_pct, currency, exchange_rate_to_eur"
      )
      .eq("id", id)
      .single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
    supabase
      .from("income_splits")
      .select("id, income_id, household_member_id, percentage")
      .eq("income_id", id),
  ]);

  if (!income) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit income</h1>
      </div>
      <IncomeForm
        action={updateIncome.bind(null, id)}
        members={(members ?? []) as HouseholdMember[]}
        defaultValues={income as Income}
        defaultSplits={(splits ?? []) as IncomeSplit[]}
      />
    </div>
  );
}
