"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "../actions";

/** Baseline-profile-only input feeding the "do-nothing" overlay on severance
 *  scenario charts (DESIGN v2 §2.5) — today's liquid savings, held flat at
 *  the household's current net monthly surplus/deficit as a reference line
 *  against a scenario's projected balance. */
export function BaselineSavingsForm({
  action,
  defaultValue,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultValue: number | null;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="current_liquid_savings">Current liquid savings (€)</Label>
        <Input
          id="current_liquid_savings"
          name="current_liquid_savings"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaultValue ?? ""}
          placeholder="e.g. 25000"
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
