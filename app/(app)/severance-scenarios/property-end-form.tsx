"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { Property } from "@/lib/types";
import type { FormState } from "./property-end-actions";

export function PropertyEndForm({
  action,
  properties,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  properties: Property[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="property_end_property_id">Property</Label>
          <NativeSelect id="property_end_property_id" name="property_id" defaultValue="">
            <option value="" disabled>
              Select a property…
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="property_end_date">Ends from</Label>
          <DatePicker id="property_end_date" name="end_date" />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Adding…" : "End property in this scenario"}
      </Button>
    </form>
  );
}
