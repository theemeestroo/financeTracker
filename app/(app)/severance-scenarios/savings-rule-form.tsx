"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatEUR } from "@/lib/finance/frequency";
import { ACCRUAL_FREQUENCIES } from "@/lib/types";
import type { FormState } from "./savings-rule-actions";

export type PackageAllocationOption = {
  id: string;
  memberName: string;
  /** Net severance (gross fallback when no tax profile yet) — the 100% base. */
  severanceBase: number;
  /** Sum of existing rules' resolved amounts for this package. */
  alreadyAllocated: number;
};

/**
 * Smart amount-vs-percentage entry: a segmented toggle picks which field is
 * live (matching `package-form.tsx`'s multiplier-preset toggle style), and
 * the headroom line recomputes on every keystroke against the selected
 * package's own severance base minus whatever's already allocated —
 * disabling submit before the server round-trip if it would exceed, same
 * number the server itself re-validates authoritatively.
 */
export function SavingsRuleForm({
  action,
  packages,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  packages: PackageAllocationOption[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [allocationType, setAllocationType] = useState<"amount" | "percentage">("percentage");
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState("");

  if (packages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a severance package first — a savings rule needs one to allocate from.
      </p>
    );
  }

  const selectedPackage = packages.find((p) => p.id === packageId) ?? packages[0];
  const remaining = selectedPackage.severanceBase - selectedPackage.alreadyAllocated;
  const requestedAmount =
    allocationType === "amount"
      ? Number(amount) || 0
      : ((Number(percentage) || 0) / 100) * selectedPackage.severanceBase;
  const headroomAfter = remaining - requestedAmount;
  const overAllocated = headroomAfter < -0.01;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {packages.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="package_id">Applies to</Label>
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
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="e.g. Index fund" required />
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
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="annual_return_pct">Annual return, %</Label>
          <Input id="annual_return_pct" name="annual_return_pct" type="number" step="0.1" defaultValue={5} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="accrual_frequency">Accrued</Label>
          <NativeSelect id="accrual_frequency" name="accrual_frequency" defaultValue="monthly">
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
      <Button type="submit" disabled={pending || overAllocated} size="sm" className="self-start">
        {pending ? "Adding…" : "Add rule"}
      </Button>
    </form>
  );
}
