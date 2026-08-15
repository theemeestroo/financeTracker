"use client";

import { useActionState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type FormState = { error?: string } | undefined;

/** Small inline popover for setting a global item's per-scenario override
 *  value — doesn't fork the item, just supersedes its amount/value (or, for
 *  property changes, its end date) for this one scenario. Shared by the
 *  events, savings-rules, and property-changes merged tables on the
 *  scenario detail page. `field`/`type` pick the form's single input —
 *  `"value"`/number for events & savings rules, `"end_date"`/date for
 *  property changes — matching whichever field name each item's own
 *  override action (`setEventOverride`/`setSavingsRuleOverride`/
 *  `setPropertyEndOverride`) expects. */
export function OverridePopover({
  action,
  currentValue,
  field = "value",
  type = "number",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  currentValue?: number | string | null;
  field?: string;
  type?: "number" | "date";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <SlidersHorizontal className="size-3" />
        Override
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <form action={formAction} className="flex flex-col gap-2">
          <Label htmlFor="override_value" className="text-xs font-medium text-muted-foreground">
            {type === "date" ? "Date for this scenario" : "Value for this scenario"}
          </Label>
          <Input
            key={String(currentValue)}
            id="override_value"
            name={field}
            type={type}
            step={type === "number" ? "0.01" : undefined}
            defaultValue={currentValue ?? undefined}
            required
          />
          {state?.error && (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save override"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
