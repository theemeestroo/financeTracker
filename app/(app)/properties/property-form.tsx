"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HouseholdMember, Property, PropertySplit } from "@/lib/types";
import type { FormState } from "./actions";

export function PropertyForm({
  action,
  members,
  defaultValues,
  defaultSplits,
  profileId,
  redirectTo,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  members: HouseholdMember[];
  defaultValues?: Partial<Property>;
  defaultSplits?: PropertySplit[];
  profileId?: string;
  redirectTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [checkedIds, setCheckedIds] = useState<string[]>(
    defaultSplits?.map((s) => s.household_member_id) ?? []
  );
  const [percentages, setPercentages] = useState<Record<string, number>>(() =>
    Object.fromEntries((defaultSplits ?? []).map((s) => [s.household_member_id, s.percentage]))
  );

  function toggleMember(id: string) {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function splitEvenly() {
    const share = Math.round((100 / checkedIds.length) * 100) / 100;
    setPercentages(Object.fromEntries(checkedIds.map((id) => [id, share])));
  }

  const total = checkedIds.reduce((sum, id) => sum + (percentages[id] ?? 0), 0);
  const showPercentages = checkedIds.length > 1;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {profileId && <input type="hidden" name="profile_id" value={profileId} />}
      {redirectTo && <input type="hidden" name="redirect_to" value={redirectTo} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaultValues?.name} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Address (optional)</Label>
        <Input id="address" name="address" defaultValue={defaultValues?.address ?? undefined} />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Owned by
          </span>
          {showPercentages && (
            <button
              type="button"
              onClick={splitEvenly}
              className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
            >
              Split evenly
            </button>
          )}
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No household members yet — this will be a general household asset.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((m) => {
              const checked = checkedIds.includes(m.id);
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <label className="flex flex-1 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(m.id)}
                      className="size-4 rounded border-input accent-foreground"
                    />
                    {m.name}
                  </label>
                  {checked && showPercentages && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        name={`splits[${m.id}]`}
                        min="0"
                        max="100"
                        step="0.5"
                        value={percentages[m.id] ?? 0}
                        onChange={(e) =>
                          setPercentages((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))
                        }
                        className="h-8 w-20 rounded-lg border border-input bg-transparent px-2 text-sm text-right"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                  {checked && !showPercentages && (
                    <input type="hidden" name={`splits[${m.id}]`} value={100} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showPercentages && (
          <p
            className="text-xs"
            style={{ color: total === 100 ? "var(--muted-foreground)" : "var(--status-critical)" }}
          >
            Total: {total}% {total !== 100 && "— must add up to 100%"}
          </p>
        )}
        {checkedIds.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Not linked to anyone — counted as a general household asset.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="end_date">Sold / ended (optional)</Label>
        <DatePicker id="end_date" name="end_date" defaultValue={defaultValues?.end_date} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={defaultValues?.notes ?? undefined}
          rows={3}
          className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
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
        <Button variant="outline" render={<Link href={redirectTo ?? "/properties"} />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
