"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  SCENARIO_ITEM_SCOPES,
  type Property,
  type ScenarioItemScope,
  type SeveranceScenarioPropertyEnd,
} from "@/lib/types";
import type { FormState } from "./property-end-actions";

export function PropertyEndForm({
  action,
  properties,
  defaultValues,
  showScopeToggle = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  properties: Property[];
  defaultValues?: Partial<SeveranceScenarioPropertyEnd>;
  /** Only the scenario page's own "end a property" form offers this — the
   *  Global list's add/edit forms are implicitly always scope="global". */
  showScopeToggle?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
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
          <Label htmlFor="property_end_property_id">Property</Label>
          <NativeSelect
            id="property_end_property_id"
            name="property_id"
            defaultValue={defaultValues?.property_id ?? ""}
          >
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
          <DatePicker id="property_end_date" name="end_date" defaultValue={defaultValues?.end_date} />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Saving…" : defaultValues ? "Save changes" : "End property"}
      </Button>
    </form>
  );
}
