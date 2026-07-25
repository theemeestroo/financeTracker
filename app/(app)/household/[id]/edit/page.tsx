import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HouseholdMemberForm } from "../../household-member-form";
import { updateHouseholdMember } from "../../actions";

export default async function EditHouseholdMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("household_members")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!member) notFound();

  return (
    <div className="flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Edit household member</h1>
      </div>
      <HouseholdMemberForm
        action={updateHouseholdMember.bind(null, id)}
        defaultName={member.name}
      />
    </div>
  );
}
