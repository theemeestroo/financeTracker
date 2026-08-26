"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  SCENARIO_ITEM_SCOPES,
  type LivingProfile,
  type ScenarioItemScope,
  type SeveranceScenarioPhase,
} from "@/lib/types";
import type { FormState } from "./phase-actions";

export function PhaseForm({
  action,
  profiles,
  defaultValues,
  showScopeToggle = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  profiles: LivingProfile[];
  defaultValues?: Partial<SeveranceScenarioPhase>;
  /** Only the scenario page's own "add phase" form offers this — the Global
   *  list's add/edit forms are implicitly always scope="global". */
  showScopeToggle?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [profileId, setProfileId] = useState(defaultValues?.profile_id ?? profiles[0]?.id ?? "");
  const [scope, setScope] = useState<ScenarioItemScope>(defaultValues?.scope ?? "scenario");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {showScopeToggle && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Applies to</span>
          <div className="flex gap-2">
            {SCENARIO_ITEM_SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setScope(s.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  scope === s.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="scope" value={scope} />
        </div>
      )}

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
          <DatePicker id="phase_start_date" name="start_date" defaultValue={defaultValues?.start_date} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phase_label">Label (optional)</Label>
        <Input
          id="phase_label"
          name="label"
          placeholder="e.g. Move to Thailand"
          defaultValue={defaultValues?.label ?? ""}
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="sm" className="self-start">
          {pending ? "Saving…" : defaultValues ? "Save changes" : "Add phase"}
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
