"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { INCOME_FREQUENCIES, INCOME_TYPES, type HouseholdMember, type Income } from "@/lib/types";
import type { FormState } from "./actions";

export function IncomeForm({
  action,
  members,
  defaultValues,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  members: HouseholdMember[];
  defaultValues?: Partial<Income>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaultValues?.name} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="household_member_id">Household member</Label>
        <NativeSelect
          id="household_member_id"
          name="household_member_id"
          defaultValue={defaultValues?.household_member_id ?? ""}
          required
        >
          <option value="" disabled>
            Select a member
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gross_amount">Gross amount (EUR)</Label>
          <Input
            id="gross_amount"
            name="gross_amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultValues?.gross_amount}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="frequency">Frequency</Label>
          <NativeSelect
            id="frequency"
            name="frequency"
            defaultValue={defaultValues?.frequency ?? "monthly"}
          >
            {INCOME_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="type">Type</Label>
        <NativeSelect id="type" name="type" defaultValue={defaultValues?.type ?? "salary"}>
          {INCOME_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start_date">Start date (optional)</Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={defaultValues?.start_date ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="end_date">End date (optional)</Label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={defaultValues?.end_date ?? undefined}
          />
        </div>
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
        <Button variant="outline" render={<Link href="/income" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
