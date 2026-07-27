"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HouseholdMember } from "@/lib/types";
import type { FormState } from "./actions";

export function HouseholdMemberForm({
  action,
  defaultName = "",
  defaultDateOfBirth,
  defaultValues,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultName?: string;
  defaultDateOfBirth?: string | null;
  defaultValues?: Partial<HouseholdMember>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [statutory, setStatutory] = useState(defaultValues?.statutory_health_insurance ?? true);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaultName} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date_of_birth">Date of birth (optional)</Label>
        <DatePicker
          id="date_of_birth"
          name="date_of_birth"
          defaultValue={defaultDateOfBirth ?? undefined}
        />
        <span className="text-xs text-muted-foreground">
          Drives age-graduated ALG I duration in severance scenarios
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="statutory_health_insurance"
          name="statutory_health_insurance"
          type="checkbox"
          checked={statutory}
          onChange={(e) => setStatutory(e.target.checked)}
          className="size-4 rounded border-input accent-foreground"
        />
        <Label htmlFor="statutory_health_insurance" className="font-normal">
          Statutory health insurance (gesetzlich versichert)
        </Label>
      </div>

      {statutory && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="health_insurance_addon_rate">
            Zusatzbeitrag override, % (optional)
          </Label>
          <Input
            id="health_insurance_addon_rate"
            name="health_insurance_addon_rate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={
              defaultValues?.health_insurance_addon_rate != null
                ? defaultValues.health_insurance_addon_rate * 100
                : undefined
            }
            placeholder="Leave blank to use the average"
          />
        </div>
      )}

      {!statutory && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="private_health_insurance_monthly_premium">
            Private health insurance premium (EUR/mo)
          </Label>
          <Input
            id="private_health_insurance_monthly_premium"
            name="private_health_insurance_monthly_premium"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultValues?.private_health_insurance_monthly_premium ?? undefined}
          />
          <span className="text-xs text-muted-foreground">
            Used to cost PKV through a severance scenario&apos;s employed → gap → ALG I transition
          </span>
        </div>
      )}

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" render={<Link href="/household" />}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
