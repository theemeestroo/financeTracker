import { createClient } from "@/lib/supabase/server";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";
import { toCSV } from "@/lib/finance/csv";
import { INCOME_BONUS_DISTRIBUTIONS, INCOME_FREQUENCIES, INCOME_TYPES } from "@/lib/types";
import type { HouseholdMember, Income } from "@/lib/types";

const typeLabel = (v: string) => INCOME_TYPES.find((t) => t.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  INCOME_FREQUENCIES.find((f) => f.value === v)?.label ?? v;
const bonusDistributionLabel = (v: string) =>
  INCOME_BONUS_DISTRIBUTIONS.find((d) => d.value === v)?.label ?? v;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const baselineProfileId = await getBaselineProfileId(supabase);

  const [{ data: income }, { data: members }] = await Promise.all([
    supabase
      .from("income")
      .select(
        "id, household_member_id, name, gross_amount, type, frequency, start_date, end_date, christmas_bonus_pct, holiday_pay_pct, annual_bonus, bonus_distribution, annual_car_allowance, monthly_pension_contribution, monthly_company_car_cost"
      )
      .eq("profile_id", baselineProfileId)
      .order("name"),
    supabase.from("household_members").select("id, name, created_at"),
  ]);

  const rows = (income ?? []) as Income[];
  const memberById = new Map(((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name]));

  const csv = toCSV(
    rows.map((i) => ({
      name: i.name,
      member: memberById.get(i.household_member_id) ?? "",
      type: typeLabel(i.type),
      gross_amount: i.gross_amount,
      frequency: frequencyLabel(i.frequency),
      start_date: i.start_date ?? "",
      end_date: i.end_date ?? "",
      christmas_bonus_pct: i.type === "salary" ? i.christmas_bonus_pct : "",
      holiday_pay_pct: i.type === "salary" ? i.holiday_pay_pct : "",
      annual_bonus: i.type === "salary" ? i.annual_bonus : "",
      bonus_distribution: i.type === "salary" ? bonusDistributionLabel(i.bonus_distribution) : "",
      annual_car_allowance: i.type === "salary" ? i.annual_car_allowance : "",
      monthly_pension_contribution: i.type === "salary" ? i.monthly_pension_contribution : "",
      monthly_company_car_cost: i.type === "salary" ? i.monthly_company_car_cost : "",
    })),
    [
      { key: "name", header: "Name" },
      { key: "member", header: "Household member" },
      { key: "type", header: "Type" },
      { key: "gross_amount", header: "Gross amount (EUR)" },
      { key: "frequency", header: "Frequency" },
      { key: "start_date", header: "Start date" },
      { key: "end_date", header: "End date" },
      { key: "christmas_bonus_pct", header: "Christmas bonus (% of 1mo)" },
      { key: "holiday_pay_pct", header: "Holiday pay (% of 1mo)" },
      { key: "annual_bonus", header: "Annual bonus (EUR)" },
      { key: "bonus_distribution", header: "Bonus payout" },
      { key: "annual_car_allowance", header: "Car allowance (EUR/yr, reference only)" },
      { key: "monthly_pension_contribution", header: "Pension contribution (EUR/mo, reference only)" },
      { key: "monthly_company_car_cost", header: "Company car cost (EUR/mo, deducted from net)" },
    ]
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="income-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
