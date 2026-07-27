"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "./variant-actions";

const DEFAULT_VARIANTS = [
  { months: 3, salaryPct: 100 },
  { months: 6, salaryPct: 90 },
  { months: 9, salaryPct: 80 },
];

export function VariantGeneratorForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Clones this scenario three times, each adding a re-employment income event at a
        different point after the earliest severance start date, sized as a % of the combined
        monthly base salary across this scenario&apos;s packages.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {DEFAULT_VARIANTS.map((v, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Variant {i + 1}
            </span>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`variant_${i}_months`}>Months until re-employment</Label>
              <Input
                id={`variant_${i}_months`}
                name={`variant_${i}_months`}
                type="number"
                step="0.5"
                min="0"
                defaultValue={v.months}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`variant_${i}_salary_pct`}>New salary, % of previous</Label>
              <Input
                id={`variant_${i}_salary_pct`}
                name={`variant_${i}_salary_pct`}
                type="number"
                step="1"
                min="0"
                defaultValue={v.salaryPct}
              />
            </div>
          </div>
        ))}
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Generating…" : "Generate 3 variants & compare"}
      </Button>
    </form>
  );
}
