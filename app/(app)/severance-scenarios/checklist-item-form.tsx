"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "./checklist-actions";

export function ChecklistItemForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checklist_item_label">Task</Label>
          <Input id="checklist_item_label" name="label" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checklist_item_due_date">Due date (optional)</Label>
          <DatePicker id="checklist_item_due_date" name="due_date" />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} size="sm" className="self-start">
        {pending ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}
