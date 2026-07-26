import { createClient } from "@/lib/supabase/server";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";
import { toCSV } from "@/lib/finance/csv";
import { splitLabel } from "@/lib/finance/splits";
import { COMMITMENT_CATEGORIES, COMMITMENT_FREQUENCIES } from "@/lib/types";
import type { Commitment, CommitmentSplit, HouseholdMember } from "@/lib/types";

const categoryLabel = (v: string) =>
  COMMITMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  COMMITMENT_FREQUENCIES.find((f) => f.value === v)?.label ?? v;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const baselineProfileId = await getBaselineProfileId(supabase);

  const [{ data: commitments }, { data: members }] = await Promise.all([
    supabase
      .from("commitments")
      .select("id, name, category, amount, frequency, essential, start_date, end_date")
      .eq("profile_id", baselineProfileId)
      .order("name"),
    supabase.from("household_members").select("id, name, created_at"),
  ]);

  const rows = (commitments ?? []) as Commitment[];
  const memberById = new Map(((members ?? []) as HouseholdMember[]).map((m) => [m.id, m.name]));

  const { data: splitRows } = await supabase
    .from("commitment_splits")
    .select("id, commitment_id, household_member_id, percentage")
    .in("commitment_id", rows.map((c) => c.id));
  const splitsByCommitment = new Map<string, CommitmentSplit[]>();
  for (const s of (splitRows ?? []) as CommitmentSplit[]) {
    splitsByCommitment.set(s.commitment_id, [
      ...(splitsByCommitment.get(s.commitment_id) ?? []),
      s,
    ]);
  }

  const csv = toCSV(
    rows.map((c) => ({
      name: c.name,
      category: categoryLabel(c.category),
      amount: c.amount,
      frequency: frequencyLabel(c.frequency),
      essential: c.essential ? "Yes" : "No",
      linked_to: splitLabel(splitsByCommitment.get(c.id) ?? [], memberById),
      start_date: c.start_date,
      end_date: c.end_date ?? "",
    })),
    [
      { key: "name", header: "Name" },
      { key: "category", header: "Category" },
      { key: "amount", header: "Amount (EUR)" },
      { key: "frequency", header: "Frequency" },
      { key: "essential", header: "Essential" },
      { key: "linked_to", header: "Linked to" },
      { key: "start_date", header: "Start date" },
      { key: "end_date", header: "End date" },
    ]
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commitments-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
