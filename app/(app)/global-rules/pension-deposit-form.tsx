"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "./pension-deposit-actions";

/** Household-wide default for the pension-deposit-from-severance feature —
 *  a single scalar setting, not a list, so unlike the other Global Rules
 *  cards this has no AddDisclosure/table/stale-override tracking; every
 *  unoverridden severance package resolves against this value. */
export function PensionDepositForm({
  action,
  defaultValue,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultValue: number;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="pension_deposit_default">Default pension deposit (€)</Label>
        <Input
          id="pension_deposit_default"
          name="pension_deposit_default"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaultValue}
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
