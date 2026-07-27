"use client";

export function ChecklistItemCheckbox({
  action,
  defaultChecked,
}: {
  action: () => Promise<void>;
  defaultChecked: boolean;
}) {
  return (
    <form action={action}>
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="size-4 rounded border-input accent-foreground"
        aria-label="Mark done"
      />
    </form>
  );
}
