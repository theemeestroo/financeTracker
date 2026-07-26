import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "../../../../package-form";
import { updateScenarioPackage } from "../../../../package-actions";
import type { HouseholdMember, SeveranceScenarioPackage } from "@/lib/types";

export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string; packageId: string }>;
}) {
  const { id, packageId } = await params;
  const supabase = await createClient();

  const [{ data: pkg }, { data: members }] = await Promise.all([
    supabase.from("severance_scenario_packages").select("*").eq("id", packageId).single(),
    supabase.from("household_members").select("id, name, created_at").order("name"),
  ]);

  if (!pkg) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit severance package</h1>
      </div>
      <PackageForm
        action={updateScenarioPackage.bind(null, packageId, id)}
        members={(members ?? []) as HouseholdMember[]}
        defaultValues={pkg as SeveranceScenarioPackage}
      />
    </div>
  );
}
