import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A "+ Add X" disclosure — the plus rotates into a close glyph when open. */
export function AddDisclosure({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-dashed border-border p-4 open:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden group-open:text-foreground">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-foreground transition-transform duration-200 group-open:rotate-45">
          <Icon className="size-3.5" />
        </span>
        {label}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
