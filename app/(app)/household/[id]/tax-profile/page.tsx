import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaxProfileForm } from "../../tax-profile-form";
import { upsertTaxProfile } from "../../tax-profile-actions";
import type { TaxProfile } from "@/lib/types";

export default async function TaxProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: member }, { data: taxProfile }] = await Promise.all([
    supabase.from("household_members").select("id, name").eq("id", id).single(),
    supabase
      .from("tax_profiles")
      .select(
        "id, household_member_id, tax_class, church_tax, church_tax_state, has_children, statutory_health_insurance, health_insurance_addon_rate"
      )
      .eq("household_member_id", id)
      .maybeSingle(),
  ]);

  if (!member) notFound();

  return (
    <div className="flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Tax profile — {member.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Used to convert {member.name}&apos;s gross income and severance to net figures.
        </p>
      </div>
      <TaxProfileForm
        action={upsertTaxProfile.bind(null, id)}
        defaultValues={(taxProfile as TaxProfile | null) ?? undefined}
      />
    </div>
  );
}
