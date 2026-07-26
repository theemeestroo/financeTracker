"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLivingProfile, cloneLivingProfile, type FormState } from "./actions";

export function NewProfileForm({ baselineProfileId }: { baselineProfileId: string | null }) {
  const [cloneBaseline, setCloneBaseline] = useState(true);
  const action = cloneBaseline && baselineProfileId
    ? cloneLivingProfile.bind(null, baselineProfileId)
    : createLivingProfile;
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
      {baselineProfileId && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cloneBaseline}
            onChange={(e) => setCloneBaseline(e.target.checked)}
            className="size-4 rounded border-input accent-foreground"
          />
          Start from a copy of the baseline (recommended — then edit down)
        </label>
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
