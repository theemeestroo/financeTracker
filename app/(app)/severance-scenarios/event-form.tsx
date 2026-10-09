"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  INCOME_FREQUENCIES,
  SCENARIO_EVENT_TYPES,
  SCENARIO_ITEM_SCOPES,
  type ScenarioEventType,
  type ScenarioItemScope,
  type HouseholdMember,
  type SeveranceScenarioEvent,
} from "@/lib/types";
import type { FormState } from "./event-actions";

export function EventForm({
  action,
  defaultValues,
  showScopeToggle = false,
  members = [],
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Partial<SeveranceScenarioEvent>;
  /** Only the scenario page's own "add event" form offers this — the
   *  Global list's add/edit forms are implicitly always scope="global". */
  showScopeToggle?: boolean;
  /** Household roster — drives the one-off events' per-person split inputs. */
  members?: Pick<HouseholdMember, "id" | "name">[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [eventType, setEventType] = useState<ScenarioEventType>(
    defaultValues?.event_type ?? "one_off_outflow"
  );
  // Defaults to an even split (50/50 for two people) unless the event
  // already has saved percentages.
  const [percentages, setPercentages] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      members.map((m) => [
        m.id,
        defaultValues?.member_splits?.find((s) => s.household_member_id === m.id)?.percentage ??
          (defaultValues?.member_splits ? 0 : Math.round((10000 / members.length) * 100) / 10000),
      ])
    )
  );
  const splitTotal = Object.values(percentages).reduce((a, b) => a + (Number(b) || 0), 0);
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
          <Label htmlFor="event_name">Name</Label>
          <Input id="event_name" name="name" defaultValue={defaultValues?.name} required />
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
            <DatePicker id="event_start_date" name="date" defaultValue={defaultValues?.date} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring_gross_amount">Gross amount</Label>
            <Input
              id="recurring_gross_amount"
              name="recurring_gross_amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues?.recurring_gross_amount ?? undefined}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring_frequency">Frequency</Label>
            <NativeSelect
              id="recurring_frequency"
              name="recurring_frequency"
              defaultValue={defaultValues?.recurring_frequency ?? "monthly"}
            >
              {INCOME_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="col-span-3 flex flex-col gap-1.5">
            <Label htmlFor="recurring_end_date">End date (optional)</Label>
            <DatePicker
              id="recurring_end_date"
              name="recurring_end_date"
              defaultValue={defaultValues?.recurring_end_date}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event_date">Date</Label>
            <DatePicker id="event_date" name="date" defaultValue={defaultValues?.date} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input
              key={String(defaultValues?.amount ?? "")}
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues?.amount ?? undefined}
              required
            />
          </div>
        </div>
      )}

      {eventType !== "recurring_income_start" && members.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Share per person</span>
          <div className="flex flex-wrap gap-3">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                {m.name}
                <Input
                  name={`splits[${m.id}]`}
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  className="h-8 w-20 text-right"
                  value={percentages[m.id] ?? 0}
                  onChange={(e) => setPercentages((p) => ({ ...p, [m.id]: Number(e.target.value) }))}
                />
                %
              </label>
            ))}
          </div>
          {Math.abs(splitTotal - 100) > 0.5 && (
            <p role="alert" className="text-xs text-destructive">
              Shares add up to {splitTotal}% — they must total 100%.
            </p>
          )}
        </div>
      )}

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Saving…" : defaultValues ? "Save changes" : "Add event"}
      </Button>
    </form>
  );
}
