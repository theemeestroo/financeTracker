import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommitmentForm } from "../../commitment-form";
import { updateCommitment } from "../../actions";
import type { Commitment, HouseholdMember } from "@/lib/types";

export default async function EditCommitmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: commitment }, { data: members }] = await Promise.all([
    supabase
      .from("commitments")
      .select(
        "id, profile_id, name, category, amount, frequency, essential, ownership, household_member_id, start_date, end_date"
      )
      .eq("id", id)
      .single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
  ]);

  if (!commitment) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Edit commitment</h1>
      </div>
      <CommitmentForm
        action={updateCommitment.bind(null, id)}
        members={(members ?? []) as HouseholdMember[]}
        defaultValues={commitment as Commitment}
      />
    </div>
  );
}
