"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatEUR } from "@/lib/finance/frequency";
import {
  ACCRUAL_FREQUENCIES,
  SCENARIO_ITEM_SCOPES,
  type ScenarioItemScope,
  type SeveranceScenarioSavingsRule,
} from "@/lib/types";
import type { FormState } from "./savings-rule-actions";

export type PackageAllocationOption = {
  id: string;
  memberName: string;
  /** Net severance (gross fallback when no tax profile yet) — the 100% base. */
  severanceBase: number;
  /** Sum of existing rules' resolved amounts for this package — includes
   *  any global rule that also resolves against this same person, so
   *  headroom can never be silently under-counted (see
   *  `savings-rule-actions.ts`'s own `packageAllocationState`). */
  alreadyAllocated: number;
};

export type HouseholdMemberOption = { id: string; name: string };

/**
 * Smart amount-vs-percentage entry: a segmented toggle picks which field is
 * live (matching `package-form.tsx`'s multiplier-preset toggle style), and
 * the headroom line recomputes on every keystroke against the selected
 * package's own severance base minus whatever's already allocated —
 * disabling submit before the server round-trip if it would exceed, same
 * number the server itself re-validates authoritatively. When scope is
 * "global" there's no single package to check headroom against — it
 * resolves per-scenario instead (see `global-items.ts`), so that live
 * preview is skipped there.
 */
export function SavingsRuleForm({
  action,
  packages,
  householdMembers = [],
  defaultValues,
  showScopeToggle = false,
  fixedScope,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  packages: PackageAllocationOption[];
  /** Needed whenever scope="global" is reachable — either via the toggle or `fixedScope`. */
  householdMembers?: HouseholdMemberOption[];
  defaultValues?: Partial<SeveranceScenarioSavingsRule> & { memberName?: string };
  /** Only the scenario page's own "add rule" form offers this. */
  showScopeToggle?: boolean;
  /** Used when `showScopeToggle` is false to pick which selector shows —
   *  the Global list's add/edit forms pass "global" here. */
  fixedScope?: ScenarioItemScope;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [scope, setScope] = useState<ScenarioItemScope>(defaultValues?.scope ?? fixedScope ?? "scenario");
  const [packageId, setPackageId] = useState(defaultValues?.package_id ?? packages[0]?.id ?? "");
  const [householdMemberId, setHouseholdMemberId] = useState(
    defaultValues?.household_member_id ?? householdMembers[0]?.id ?? ""
  );
  const [allocationType, setAllocationType] = useState<"amount" | "percentage">(
    defaultValues?.allocation_type ?? "percentage"
  );
  const [amount, setAmount] = useState(defaultValues?.amount != null ? String(defaultValues.amount) : "");
  const [percentage, setPercentage] = useState(
    defaultValues?.percentage != null ? String(defaultValues.percentage) : ""
  );

  const scenarioScopeUnavailable = scope === "scenario" && packages.length === 0;
  const selectedPackage = packages.find((p) => p.id === packageId) ?? packages[0];
  const requestedAmount =
    allocationType === "amount"
      ? Number(amount) || 0
      : ((Number(percentage) || 0) / 100) * (selectedPackage?.severanceBase ?? 0);
  const remaining = selectedPackage ? selectedPackage.severanceBase - selectedPackage.alreadyAllocated : 0;
  const headroomAfter = remaining - requestedAmount;
  const overAllocated = scope === "scenario" && !!selectedPackage && headroomAfter < -0.01;

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
        </div>
      )}
      <input type="hidden" name="scope" value={scope} />

      {scope === "scenario" ? (
        scenarioScopeUnavailable ? (
          <p className="text-sm text-muted-foreground">
            Add a severance package first — a scenario-scoped rule needs one to allocate from.
          </p>
        ) : packages.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="package_id">Whose severance</Label>
            <NativeSelect
              id="package_id"
              name="package_id"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              className="max-w-56"
            >
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.memberName}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <input type="hidden" name="package_id" value={packageId} />
        )
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="household_member_id">Whose severance</Label>
          <NativeSelect
            id="household_member_id"
            name="household_member_id"
            value={householdMemberId}
            onChange={(e) => setHouseholdMemberId(e.target.value)}
            className="max-w-56"
          >
            {householdMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Resolves against this person&apos;s own severance in whichever scenario it applies — no single
            headroom figure to check here.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="e.g. Index fund" defaultValue={defaultValues?.name} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Allocation</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAllocationType("percentage")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              allocationType === "percentage"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            % of severance
          </button>
          <button
            type="button"
            onClick={() => setAllocationType("amount")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              allocationType === "amount"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            Fixed amount
          </button>
        </div>
        <input type="hidden" name="allocation_type" value={allocationType} />

        {allocationType === "percentage" ? (
          <Input
            type="number"
            name="percentage"
            step="0.1"
            min="0"
            max="100"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            placeholder="e.g. 50"
            className="mt-1 max-w-32"
            required
          />
        ) : (
          <Input
            type="number"
            name="amount"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 20000"
            className="mt-1 max-w-40"
            required
          />
        )}

        {scope === "scenario" && selectedPackage && (
          <p className={`text-xs ${overAllocated ? "text-destructive" : "text-muted-foreground"}`}>
            {formatEUR(Math.max(0, remaining))} available for {selectedPackage.memberName} of{" "}
            {formatEUR(selectedPackage.severanceBase)} net severance
            {requestedAmount > 0 && (
              <>
                {" "}
                — this rule uses {formatEUR(requestedAmount)}
                {overAllocated
                  ? `, exceeding what's left by ${formatEUR(-headroomAfter)}`
                  : `, leaving ${formatEUR(headroomAfter)}`}
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="annual_return_pct">Annual return, %</Label>
          <Input
            id="annual_return_pct"
            name="annual_return_pct"
            type="number"
            step="0.1"
            defaultValue={defaultValues?.annual_return_pct ?? 5}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="accrual_frequency">Accrued</Label>
          <NativeSelect
            id="accrual_frequency"
            name="accrual_frequency"
            defaultValue={defaultValues?.accrual_frequency ?? "monthly"}
          >
            {ACCRUAL_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending || overAllocated || scenarioScopeUnavailable} size="sm" className="self-start">
        {pending ? "Saving…" : defaultValues ? "Save changes" : "Add rule"}
      </Button>
    </form>
  );
}
