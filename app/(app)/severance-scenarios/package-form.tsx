"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatEUR } from "@/lib/finance/frequency";
import {
  SEVERANCE_MULTIPLIER_PRESETS,
  type HouseholdMember,
  type SeveranceScenarioPackage,
} from "@/lib/types";
import type { FormState } from "./package-actions";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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
  globalPensionDepositDefault,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  members: HouseholdMember[];
  defaultValues?: Partial<SeveranceScenarioPackage>;
  /** The household's currently resolved global pension-deposit default
   *  (already falls back to the coded default upstream) — shown as this
   *  field's placeholder so leaving it blank visibly means "use this". */
  globalPensionDepositDefault: number;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [multiplier, setMultiplier] = useState(defaultValues?.severance_multiplier ?? 1.5);
  const [includeBonus, setIncludeBonus] = useState(defaultValues?.include_bonus_in_calc ?? false);
  const [includeCar, setIncludeCar] = useState(defaultValues?.include_car_in_calc ?? false);
  const [includeGardenLeave, setIncludeGardenLeave] = useState(
    defaultValues?.include_garden_leave ?? false
  );
  const [useOverride, setUseOverride] = useState(defaultValues?.gross_severance_override != null);
  const [includeChristmasBonus, setIncludeChristmasBonus] = useState(
    defaultValues?.include_christmas_bonus_in_calc ?? false
  );
  const [claimUnemploymentBenefit, setClaimUnemploymentBenefit] = useState(
    defaultValues?.claim_unemployment_benefit ?? true
  );
  const [sperrzeitSafeConfirmed, setSperrzeitSafeConfirmed] = useState(
    defaultValues?.sperrzeit_safe_confirmed ?? false
  );

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
            <Label htmlFor="annual_bonus_payment_month">Bonus paid in (optional)</Label>
            <NativeSelect
              id="annual_bonus_payment_month"
              name="annual_bonus_payment_month"
              defaultValue={defaultValues?.annual_bonus_payment_month ?? ""}
            >
              <option value="">Unknown / assume received</option>
              {MONTH_NAMES.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <span className="text-xs text-muted-foreground">
              A bonus paid on/after the work end date&apos;s month is never actually received, so it&apos;s
              left out of the severance-timing tax comparison
            </span>
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
            <Label htmlFor="christmas_bonus_pct">Christmas money, % of 1mo (optional)</Label>
            <Input
              id="christmas_bonus_pct"
              name="christmas_bonus_pct"
              type="number"
              step="0.1"
              min="0"
              defaultValue={defaultValues?.christmas_bonus_pct ?? undefined}
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="include_christmas_bonus_in_calc"
                checked={includeChristmasBonus}
                onChange={(e) => setIncludeChristmasBonus(e.target.checked)}
                className="size-4 rounded border-input accent-foreground"
              />
              Include Christmas money
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

        <div className="mt-4 flex flex-col gap-1.5 border-t pt-4">
          <Label htmlFor="pension_deposit_override">Pension deposit from this severance (EUR)</Label>
          <Input
            id="pension_deposit_override"
            name="pension_deposit_override"
            type="number"
            step="0.01"
            min="0"
            placeholder={`Defaults to the global rule (${formatEUR(globalPensionDepositDefault)})`}
            defaultValue={defaultValues?.pension_deposit_override ?? undefined}
            className="max-w-80"
          />
          <span className="text-xs text-muted-foreground">
            Carved out of the gross severance and paid into a company pension instead of as cash —
            reduces the taxable severance base. Leave blank to use the global rule, or enter 0 to skip a
            pension deposit for this package.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="severance_start_date">Work end date</Label>
          <DatePicker
            id="severance_start_date"
            name="severance_start_date"
            defaultValue={defaultValues?.severance_start_date}
          />
          <span className="text-xs text-muted-foreground">
            When employment/notice ends — drives garden leave, ALG I timing, and notice pay
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="severance_payment_date">Severance payment date (optional)</Label>
          <DatePicker
            id="severance_payment_date"
            name="severance_payment_date"
            defaultValue={defaultValues?.severance_payment_date ?? undefined}
          />
          <span className="text-xs text-muted-foreground">
            When the lump sum is actually paid, if different — severance is taxed in the year it&apos;s
            received, so paying in a later tax year (e.g. once salary has stopped) can lower the tax
            owed. Leave blank to assume it lands when garden leave ends.
          </span>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Unemployment benefit (ALG I)
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="claim_unemployment_benefit"
            checked={claimUnemploymentBenefit}
            onChange={(e) => setClaimUnemploymentBenefit(e.target.checked)}
            className="size-4 rounded border-input accent-foreground"
          />
          Assume ALG I is claimed after garden leave/severance
        </label>

        {claimUnemploymentBenefit && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unemployment_benefit_defer_months">Pause ALG I start by, months</Label>
              <Input
                id="unemployment_benefit_defer_months"
                name="unemployment_benefit_defer_months"
                type="number"
                step="0.5"
                min="0"
                defaultValue={defaultValues?.unemployment_benefit_defer_months ?? 0}
              />
              <span className="text-xs text-muted-foreground">
                E.g. self-funding a few months of travel before registering as job-seeking
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="months_insured_override">Months insured, last 30 (optional)</Label>
              <Input
                id="months_insured_override"
                name="months_insured_override"
                type="number"
                step="0.5"
                min="0"
                defaultValue={defaultValues?.months_insured_override ?? undefined}
                placeholder="Defaults to years of service × 12"
              />
              <span className="text-xs text-muted-foreground">
                Override if years of service at this employer doesn&apos;t reflect your full insured history
              </span>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2 border-t pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="sperrzeit_safe_confirmed"
                  checked={sperrzeitSafeConfirmed}
                  onChange={(e) => setSperrzeitSafeConfirmed(e.target.checked)}
                  className="size-4 rounded border-input accent-foreground"
                />
                Exit agreement wording confirmed to avoid a Sperrzeit
              </label>
              <span className="text-xs text-muted-foreground">
                By default this app flags a possible 12-week ALG I delay (Sperrzeit) whenever the
                severance exceeds the 0.5×salary/year safe-harbor formula. Check this only once
                you&apos;ve actually confirmed — with your lawyer or the Agentur für Arbeit — that
                this package&apos;s wording avoids it; it&apos;s your own assertion, not something
                this app can verify.
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-1.5 max-w-64">
          <Label htmlFor="new_job_start_date">Already know your return-to-work date? (optional)</Label>
          <DatePicker
            id="new_job_start_date"
            name="new_job_start_date"
            defaultValue={defaultValues?.new_job_start_date ?? undefined}
          />
          <span className="text-xs text-muted-foreground">
            Stops ALG I income and health-insurance gap costing from this date
          </span>
        </div>
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
