"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { GERMAN_STATES, TAX_CLASSES, type TaxProfileRow } from "@/lib/types";
import type { FormState } from "./tax-profile-actions";

export function TaxProfileForm({
  action,
  defaultValues,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Partial<TaxProfileRow>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [churchTax, setChurchTax] = useState(defaultValues?.church_tax ?? false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tax_class">Tax class (Steuerklasse)</Label>
        <NativeSelect
          id="tax_class"
          name="tax_class"
          defaultValue={defaultValues?.tax_class ?? 1}
        >
          {TAX_CLASSES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="church_tax"
          name="church_tax"
          type="checkbox"
          checked={churchTax}
          onChange={(e) => setChurchTax(e.target.checked)}
          className="size-4 rounded border-input accent-foreground"
        />
        <Label htmlFor="church_tax" className="font-normal">
          Pays church tax (Kirchensteuer)
        </Label>
      </div>

      {churchTax && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="church_tax_state">State (determines 8% vs. 9%)</Label>
          <NativeSelect
            id="church_tax_state"
            name="church_tax_state"
            defaultValue={defaultValues?.church_tax_state ?? ""}
          >
            <option value="" disabled>
              Select a state
            </option>
            {GERMAN_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id="has_children"
          name="has_children"
          type="checkbox"
          defaultChecked={defaultValues?.has_children ?? false}
          className="size-4 rounded border-input accent-foreground"
        />
        <Label htmlFor="has_children" className="font-normal">
          Has children (exempts from the childless Pflegeversicherung surcharge)
        </Label>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" render={<Link href="/household" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
