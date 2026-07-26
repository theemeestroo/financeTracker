"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  SEVERANCE_MULTIPLIER_PRESETS,
  type HouseholdMember,
  type SeveranceScenarioPackage,
} from "@/lib/types";
import type { FormState } from "./package-actions";

const TOGGLE_PRESETS = [
  { label: "Base only", bonus: false, car: false, garden: false },
  { label: "+ Garden leave", bonus: false, car: false, garden: true },
  { label: "+ Bonus in base", bonus: true, car: false, garden: true },
  { label: "Full package", bonus: true, car: true, garden: true },
];

export function PackageForm({
  action,
  members,
  defaultValues,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  members: HouseholdMember[];
  defaultValues?: Partial<SeveranceScenarioPackage>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [multiplier, setMultiplier] = useState(defaultValues?.severance_multiplier ?? 1.5);
  const [includeBonus, setIncludeBonus] = useState(defaultValues?.include_bonus_in_calc ?? false);
  const [includeCar, setIncludeCar] = useState(defaultValues?.include_car_in_calc ?? false);
  const [includeGardenLeave, setIncludeGardenLeave] = useState(
    defaultValues?.include_garden_leave ?? false
  );
  const [useOverride, setUseOverride] = useState(defaultValues?.gross_severance_override != null);

  const activePreset = SEVERANCE_MULTIPLIER_PRESETS.find((p) => p.value === multiplier);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="household_member_id">Whose severance is this?</Label>
        <NativeSelect
          id="household_member_id"
          name="household_member_id"
          defaultValue={defaultValues?.household_member_id ?? ""}
          required
        >
          <option value="" disabled>
            Select a household member
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Package calculator inputs
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employer_name">Employer (optional)</Label>
            <Input id="employer_name" name="employer_name" defaultValue={defaultValues?.employer_name ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="years_of_service">Years of service</Label>
            <Input
              id="years_of_service"
              name="years_of_service"
              type="number"
              step="0.1"
              min="0"
              defaultValue={defaultValues?.years_of_service ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employment_start_date">Employment start date</Label>
            <DatePicker
              id="employment_start_date"
              name="employment_start_date"
              defaultValue={defaultValues?.employment_start_date}
            />
            <span className="text-xs text-muted-foreground">Drives the pension Wartezeit view</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthly_base_salary">Monthly base salary (EUR)</Label>
            <Input
              id="monthly_base_salary"
              name="monthly_base_salary"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues?.monthly_base_salary ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="annual_bonus">Annual bonus (EUR)</Label>
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
            <Label htmlFor="annual_car_benefit">Car benefit (EUR/yr)</Label>
            <Input
              id="annual_car_benefit"
              name="annual_car_benefit"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues?.annual_car_benefit ?? 0}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holiday_pay_pct">Holiday pay, % of 1mo (optional)</Label>
            <Input
              id="holiday_pay_pct"
              name="holiday_pay_pct"
              type="number"
              step="0.1"
              min="0"
              defaultValue={defaultValues?.holiday_pay_pct ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthly_pension_contribution">BAV pension contribution (EUR/mo)</Label>
            <Input
              id="monthly_pension_contribution"
              name="monthly_pension_contribution"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultValues?.monthly_pension_contribution ?? 0}
            />
            <span className="text-xs text-muted-foreground">Reference only — excluded from the severance calc</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Base calculation includes
          </span>
          <div className="flex flex-wrap gap-2">
            {TOGGLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setIncludeBonus(preset.bonus);
                  setIncludeCar(preset.car);
                  setIncludeGardenLeave(preset.garden);
                }}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="include_bonus_in_calc"
                checked={includeBonus}
                onChange={(e) => setIncludeBonus(e.target.checked)}
                className="size-4 rounded border-input accent-foreground"
              />
              Include bonus
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="include_car_in_calc"
                checked={includeCar}
                onChange={(e) => setIncludeCar(e.target.checked)}
                className="size-4 rounded border-input accent-foreground"
              />
              Include car benefit
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="include_garden_leave"
                checked={includeGardenLeave}
                onChange={(e) => setIncludeGardenLeave(e.target.checked)}
                className="size-4 rounded border-input accent-foreground"
              />
              Include garden leave
            </label>
          </div>
        </div>

        {includeGardenLeave && (
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="notice_period_months">Notice period (months)</Label>
            <Input
              id="notice_period_months"
              name="notice_period_months"
              type="number"
              step="0.5"
              min="0"
              className="max-w-32"
              defaultValue={defaultValues?.notice_period_months ?? 6}
            />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Multiplier (× months per year of service)
          </span>
          <div className="flex flex-wrap gap-2">
            {SEVERANCE_MULTIPLIER_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setMultiplier(p.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  multiplier === p.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {p.value}×
              </button>
            ))}
          </div>
          <input
            type="number"
            name="severance_multiplier"
            step="0.05"
            min="0"
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            className="h-8 w-32 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          />
          {activePreset && (
            <span className="text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">{activePreset.tag}</strong> —{" "}
              {activePreset.description}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useOverride}
              onChange={(e) => setUseOverride(e.target.checked)}
              className="size-4 rounded border-input accent-foreground"
            />
            Override with a known/negotiated gross figure instead
          </label>
          {useOverride && (
            <Input
              name="gross_severance_override"
              type="number"
              step="0.01"
              min="0"
              placeholder="Gross severance (EUR)"
              defaultValue={defaultValues?.gross_severance_override ?? undefined}
              className="max-w-64"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 max-w-64">
        <Label htmlFor="severance_start_date">Severance start date</Label>
        <DatePicker
          id="severance_start_date"
          name="severance_start_date"
          defaultValue={defaultValues?.severance_start_date}
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} size="sm" className="self-start">
          {pending ? "Saving…" : "Save package"}
        </Button>
      </div>
    </form>
  );
}
