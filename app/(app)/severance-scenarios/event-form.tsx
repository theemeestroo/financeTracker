"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { INCOME_FREQUENCIES, SCENARIO_EVENT_TYPES, type ScenarioEventType } from "@/lib/types";
import type { FormState } from "./event-actions";

export function EventForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [eventType, setEventType] = useState<ScenarioEventType>("one_off_outflow");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event_name">Name</Label>
          <Input id="event_name" name="name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event_type">Type</Label>
          <NativeSelect
            id="event_type"
            name="event_type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as ScenarioEventType)}
          >
            {SCENARIO_EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {eventType === "recurring_income_start" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event_start_date">Start date</Label>
            <DatePicker id="event_start_date" name="date" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring_gross_amount">Gross amount</Label>
            <Input
              id="recurring_gross_amount"
              name="recurring_gross_amount"
              type="number"
              step="0.01"
              min="0"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring_frequency">Frequency</Label>
            <NativeSelect id="recurring_frequency" name="recurring_frequency" defaultValue="monthly">
              {INCOME_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="col-span-3 flex flex-col gap-1.5">
            <Label htmlFor="recurring_end_date">End date (optional)</Label>
            <DatePicker id="recurring_end_date" name="recurring_end_date" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event_date">Date</Label>
            <DatePicker id="event_date" name="date" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0" required />
          </div>
        </div>
      )}

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Adding…" : "Add event"}
      </Button>
    </form>
  );
}
