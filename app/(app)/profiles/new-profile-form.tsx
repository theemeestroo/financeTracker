"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createLivingProfile, cloneLivingProfile, type FormState } from "./actions";
import type { LivingProfile } from "@/lib/types";

export function NewProfileForm({ profiles }: { profiles: LivingProfile[] }) {
  const baselineId = profiles.find((p) => p.is_baseline)?.id ?? "";
  const [sourceId, setSourceId] = useState(baselineId);
  const action = sourceId ? cloneLivingProfile.bind(null, sourceId) : createLivingProfile;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile_name">Name</Label>
          <Input id="profile_name" name="name" placeholder="e.g. Thailand move" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile_description">Description (optional)</Label>
          <Input id="profile_description" name="description" />
        </div>
      </div>
      {profiles.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile_source">Start from</Label>
          <NativeSelect
            id="profile_source"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="max-w-72"
          >
            <option value="">Start fresh (no commitments/income)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                Copy of {p.name}
                {p.is_baseline ? " (baseline)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Creating…" : "Create profile"}
      </Button>
    </form>
  );
}
