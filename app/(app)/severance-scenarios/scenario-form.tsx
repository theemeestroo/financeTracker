"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SeveranceScenario } from "@/lib/types";
import type { FormState } from "./actions";

export function ScenarioForm({
  action,
  defaultValues,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Partial<SeveranceScenario>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Scenario name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Both of us take severance"
          defaultValue={defaultValues?.name}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="starting_balance">Additional buffer (EUR)</Label>
        <Input
          id="starting_balance"
          name="starting_balance"
          type="number"
          step="0.01"
          defaultValue={defaultValues?.starting_balance ?? 0}
        />
        <span className="text-xs text-muted-foreground">
          Household savings beyond anyone&apos;s severance itself — each person&apos;s net severance is
          added automatically from their own package.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input id="notes" name="notes" defaultValue={defaultValues?.notes ?? ""} />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save scenario"}
        </Button>
        <Button variant="outline" render={<Link href="/severance-scenarios" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
