import { createClient } from "@/lib/supabase/server";
import { CommitmentForm } from "../commitment-form";
import { createCommitment } from "../actions";
import type { HouseholdMember } from "@/lib/types";

export default async function NewCommitmentPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("household_members")
    .select("id, name, created_at")
    .order("name");

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Add commitment</h1>
      </div>
      <CommitmentForm
        action={createCommitment}
        members={(members ?? []) as HouseholdMember[]}
      />
    </div>
  );
}
