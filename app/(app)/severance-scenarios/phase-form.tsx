"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { LivingProfile } from "@/lib/types";
import type { FormState } from "./phase-actions";

export function PhaseForm({
  action,
  profiles,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  profiles: LivingProfile[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phase_profile_id">Living Profile</Label>
          <NativeSelect
            id="phase_profile_id"
            name="profile_id"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.is_baseline ? " (baseline)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phase_start_date">Active from</Label>
          <Input id="phase_start_date" name="start_date" type="date" required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phase_label">Label (optional)</Label>
        <Input id="phase_label" name="label" placeholder="e.g. Move to Thailand" />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="sm" className="self-start">
          {pending ? "Adding…" : "Add phase"}
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          render={<Link href="/profiles" />}
        >
          Manage Living Profiles
        </Button>
      </div>
    </form>
  );
}
