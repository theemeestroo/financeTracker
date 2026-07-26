import { createClient } from "@/lib/supabase/server";
import { CommitmentForm } from "../commitment-form";
import { createCommitment } from "../actions";
import { getBaselineProfileId } from "@/lib/finance/baseline-profile";
import { propertiesWithSplits } from "@/lib/finance/property-splits";
import type { HouseholdMember } from "@/lib/types";

export default async function NewCommitmentPage() {
  const supabase = await createClient();
  const baselineProfileId = await getBaselineProfileId(supabase);

  const [{ data: members }, { properties, splitsByProperty }] = await Promise.all([
    supabase.from("household_members").select("id, name, created_at").order("name"),
    propertiesWithSplits(supabase, baselineProfileId),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add commitment</h1>
      </div>
      <CommitmentForm
        action={createCommitment}
        members={(members ?? []) as HouseholdMember[]}
        properties={properties}
        propertySplitsByProperty={splitsByProperty}
      />
    </div>
  );
}
