import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/delete-button";
import type { LivingProfile } from "@/lib/types";
import { deleteLivingProfile } from "./actions";
import { NewProfileForm } from "./new-profile-form";

export default async function ProfilesPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("living_profiles")
    .select("id, name, description, is_baseline")
    .order("is_baseline", { ascending: false })
    .order("name");

  const rows = (profiles ?? []) as LivingProfile[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Living Profiles</h1>
        <p className="text-sm text-muted-foreground">
          Alternate cost-of-living setups (e.g. moving abroad, downsizing) you can attach to a
          severance scenario as a phase.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Profiles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
            >
              <Link href={`/profiles/${p.id}`} className="flex items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                {p.is_baseline && <Badge variant="outline">Baseline</Badge>}
                {p.description && (
                  <span className="text-xs text-muted-foreground">{p.description}</span>
                )}
              </Link>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" render={<Link href={`/profiles/${p.id}`} />}>
                  Open
                </Button>
                {!p.is_baseline && (
                  <DeleteButton
                    action={deleteLivingProfile.bind(null, p.id)}
                    confirmMessage={`Delete profile "${p.name}"? Any scenario phase using it will need a replacement.`}
                  />
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            New profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NewProfileForm baselineProfileId={rows.find((p) => p.is_baseline)?.id ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
