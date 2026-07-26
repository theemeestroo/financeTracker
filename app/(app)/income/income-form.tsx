"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  INCOME_BONUS_DISTRIBUTIONS,
  INCOME_FREQUENCIES,
  INCOME_TYPES,
  type HouseholdMember,
  type Income,
  type IncomeType,
} from "@/lib/types";
import type { FormState } from "./actions";

export function IncomeForm({
  action,
  members,
  defaultValues,
  profileId,
  redirectTo,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  members: HouseholdMember[];
  defaultValues?: Partial<Income>;
  profileId?: string;
  redirectTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<IncomeType>(defaultValues?.type ?? "salary");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {profileId && <input type="hidden" name="profile_id" value={profileId} />}
      {redirectTo && <input type="hidden" name="redirect_to" value={redirectTo} />}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <NativeSelect
          id="type"
          name="type"
          defaultValue={defaultValues?.type ?? "salary"}
          onChange={(e) => setType(e.target.value as IncomeType)}
        >
          {INCOME_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {type === "salary" && (
        <div className="rounded-lg border p-4">
          <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Salary components
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="christmas_bonus_pct">Christmas bonus, % of 1mo</Label>
              <Input
                id="christmas_bonus_pct"
                name="christmas_bonus_pct"
                type="number"
                step="1"
                min="0"
                max="300"
                defaultValue={defaultValues?.christmas_bonus_pct ?? 100}
              />
              <span className="text-xs text-muted-foreground">Weihnachtsgeld</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="holiday_pay_pct">Holiday pay, % of 1mo</Label>
              <Input
                id="holiday_pay_pct"
                name="holiday_pay_pct"
                type="number"
                step="1"
                min="0"
                max="300"
                defaultValue={defaultValues?.holiday_pay_pct ?? 79}
              />
              <span className="text-xs text-muted-foreground">Urlaubsgeld</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="annual_bonus">Annual bonus (EUR/yr)</Label>
              <Input
                id="annual_bonus"
                name="annual_bonus"
                type="number"
                step="0.01"
                min="0"
                defaultValue={defaultValues?.annual_bonus ?? 0}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bonus_distribution">Bonus payout</Label>
              <NativeSelect
                id="bonus_distribution"
                name="bonus_distribution"
                defaultValue={defaultValues?.bonus_distribution ?? "one_time"}
              >
                {INCOME_BONUS_DISTRIBUTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </NativeSelect>
              <span className="text-xs text-muted-foreground">
                Christmas bonus + holiday pay + annual bonus, combined. Total compensation is the
                same either way — this only changes how it shows up in gross/mo and net/mo.
              </span>
            </div>
          </div>

          <div className="mt-4 border-t pt-4">
            <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Deducted from net pay
            </div>
            <div className="flex flex-col gap-1.5 max-w-56">
              <Label htmlFor="monthly_company_car_cost">Company car cost (EUR/mo)</Label>
              <Input
                id="monthly_company_car_cost"
                name="monthly_company_car_cost"
                type="number"
                step="0.01"
                min="0"
                defaultValue={defaultValues?.monthly_company_car_cost ?? 0}
              />
              <span className="text-xs text-muted-foreground">
                A private-use payroll deduction — reduces net/mo directly, unlike the reference
                figures below.
              </span>
            </div>
          </div>

          <div className="mt-4 border-t pt-4">
            <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Reference only — not included in gross or net
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="annual_car_allowance">Car allowance (EUR/yr)</Label>
                <Input
                  id="annual_car_allowance"
                  name="annual_car_allowance"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={defaultValues?.annual_car_allowance ?? 0}
                />
                <span className="text-xs text-muted-foreground">
                  A benefit-in-kind, not cash — excluded from gross/net. Tracked for the severance
                  calculator.
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monthly_pension_contribution">Pension contribution (EUR/mo)</Label>
                <Input
                  id="monthly_pension_contribution"
                  name="monthly_pension_contribution"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={defaultValues?.monthly_pension_contribution ?? 0}
                />
                <span className="text-xs text-muted-foreground">
                  Never paid out as cash — excluded from gross/net, shown as its own annual total.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <Button variant="outline" render={<Link href={redirectTo ?? "/income"} />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
