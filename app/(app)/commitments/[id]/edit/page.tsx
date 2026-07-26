import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommitmentForm } from "../../commitment-form";
import { updateCommitment } from "../../actions";
import type { Commitment, CommitmentSplit, HouseholdMember } from "@/lib/types";

export default async function EditCommitmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: commitment }, { data: members }, { data: splits }] = await Promise.all([
    supabase
      .from("commitments")
      .select("id, profile_id, name, category, amount, frequency, essential, start_date, end_date")
      .eq("id", id)
      .single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
    supabase
      .from("commitment_splits")
      .select("id, commitment_id, household_member_id, percentage")
      .eq("commitment_id", id),
  ]);

  if (!commitment) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit commitment</h1>
      </div>
      <CommitmentForm
        action={updateCommitment.bind(null, id)}
        members={(members ?? []) as HouseholdMember[]}
        defaultValues={commitment as Commitment}
        defaultSplits={(splits ?? []) as CommitmentSplit[]}
      />
    </div>
  );
}
