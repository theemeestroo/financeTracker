"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  COMMITMENT_CATEGORIES,
  COMMITMENT_FREQUENCIES,
  type Commitment,
  type CommitmentFrequency,
  type HouseholdMember,
  type Ownership,
} from "@/lib/types";
import type { FormState } from "./actions";

export function CommitmentForm({
  action,
  members,
  defaultValues,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  members: HouseholdMember[];
  defaultValues?: Partial<Commitment>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [frequency, setFrequency] = useState<CommitmentFrequency>(
    defaultValues?.frequency ?? "monthly"
  );
  const [ownership, setOwnership] = useState<Ownership>(
    defaultValues?.ownership ?? "shared"
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaultValues?.name} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <NativeSelect
            id="category"
            name="category"
            defaultValue={defaultValues?.category ?? "housing"}
          >
            {COMMITMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount (EUR)</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultValues?.amount}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="frequency">Frequency</Label>
          <NativeSelect
            id="frequency"
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as CommitmentFrequency)}
          >
            {COMMITMENT_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownership">Ownership</Label>
          <NativeSelect
            id="ownership"
            name="ownership"
            value={ownership}
            onChange={(e) => setOwnership(e.target.value as Ownership)}
          >
            <option value="shared">Shared</option>
            <option value="individual">Individual</option>
          </NativeSelect>
        </div>
      </div>

      {ownership === "individual" && (
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
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start_date">
            {frequency === "one_off" ? "Date" : "Start date"}
          </Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={defaultValues?.start_date}
            required
          />
        </div>
        {frequency !== "one_off" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end_date">End date (optional)</Label>
            <Input
              id="end_date"
              name="end_date"
              type="date"
              defaultValue={defaultValues?.end_date ?? undefined}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id="essential"
          name="essential"
          type="checkbox"
          defaultChecked={defaultValues?.essential ?? true}
          className="size-4 rounded border-input accent-foreground"
        />
        <Label htmlFor="essential" className="font-normal">
          Essential (vs. discretionary)
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
        <Button variant="outline" render={<Link href="/commitments" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
