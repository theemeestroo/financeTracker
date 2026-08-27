import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "../../../../package-form";
import { updateScenarioPackage } from "../../../../package-actions";
import { SEVERANCE_PENSION_DEPOSIT_DEFAULT } from "@/lib/severance";
import type { HouseholdMember, SeveranceGlobalSettings, SeveranceScenarioPackage } from "@/lib/types";

export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string; packageId: string }>;
}) {
  const { id, packageId } = await params;
  const supabase = await createClient();

  const [{ data: pkg }, { data: members }, { data: globalSettingsRow }] = await Promise.all([
    supabase.from("severance_scenario_packages").select("*").eq("id", packageId).single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
    supabase.from("severance_global_settings").select("pension_deposit_default").maybeSingle(),
  ]);

  if (!pkg) notFound();

  const globalPensionDepositDefault =
    (globalSettingsRow as Pick<SeveranceGlobalSettings, "pension_deposit_default"> | null)
      ?.pension_deposit_default ?? SEVERANCE_PENSION_DEPOSIT_DEFAULT;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit severance package</h1>
      </div>
      <PackageForm
        action={updateScenarioPackage.bind(null, packageId, id)}
        members={(members ?? []) as HouseholdMember[]}
        defaultValues={pkg as SeveranceScenarioPackage}
        globalPensionDepositDefault={globalPensionDepositDefault}
      />
    </div>
  );
}
