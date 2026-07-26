"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  CURRENCIES,
  INCOME_BONUS_DISTRIBUTIONS,
  INCOME_FREQUENCIES,
  INCOME_TYPES,
  type Currency,
  type HouseholdMember,
  type Income,
  type IncomeSplit,
  type IncomeType,
} from "@/lib/types";
import type { FormState } from "./actions";

export function IncomeForm({
  action,
  members,
  defaultValues,
  defaultSplits,
  profileId,
  redirectTo,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  members: HouseholdMember[];
  defaultValues?: Partial<Income>;
  defaultSplits?: IncomeSplit[];
  profileId?: string;
  redirectTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<IncomeType>(defaultValues?.type ?? "salary");
  const [currency, setCurrency] = useState<Currency>(defaultValues?.currency ?? "EUR");
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

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Who receives this income?
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
            No household members yet — this will be a general household income.
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
            Not linked to anyone — counted as a general household income.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gross_amount">Gross amount</Label>
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
          <Label htmlFor="currency">Currency</Label>
          <NativeSelect
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
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

      {currency !== "EUR" && (
        <div className="flex flex-col gap-1.5 max-w-64">
          <Label htmlFor="exchange_rate_to_eur">Exchange rate (1 {currency} = ? EUR)</Label>
          <Input
            id="exchange_rate_to_eur"
            name="exchange_rate_to_eur"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={defaultValues?.exchange_rate_to_eur ?? 1}
            required
          />
          <span className="text-xs text-muted-foreground">
            Entered manually — update periodically as rates move. Everything (gross, net, tax) is
            calculated in EUR using this rate, not the raw {currency} amount.
          </span>
        </div>
      )}

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

      {type === "rental" && (
        <div className="rounded-lg border p-4">
          <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Rental overhead
          </div>
          <div className="flex flex-col gap-1.5 max-w-56">
            <Label htmlFor="rental_overhead_pct">Overhead, % of rent</Label>
            <Input
              id="rental_overhead_pct"
              name="rental_overhead_pct"
              type="number"
              step="1"
              min="0"
              max="100"
              defaultValue={defaultValues?.rental_overhead_pct ?? 20}
            />
            <span className="text-xs text-muted-foreground">
              Reserved for vacancy, maintenance, etc. The adjusted amount — not the raw rent — is
              what counts toward gross/net income and gets taxed.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start_date">Start date (optional)</Label>
          <DatePicker id="start_date" name="start_date" defaultValue={defaultValues?.start_date} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="end_date">End date (optional)</Label>
          <DatePicker id="end_date" name="end_date" defaultValue={defaultValues?.end_date} />
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
