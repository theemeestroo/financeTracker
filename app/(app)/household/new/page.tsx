import { HouseholdMemberForm } from "../household-member-form";
import { createHouseholdMember } from "../actions";

export default function NewHouseholdMemberPage() {
  return (
    <div className="flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add household member</h1>
      </div>
      <HouseholdMemberForm action={createHouseholdMember} />
    </div>
  );
}
