"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatEUR } from "@/lib/finance/frequency";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import { cn } from "@/lib/utils";
import type { SensitivityEntry } from "@/lib/runway";

/** One ranked "if you cut X" row on the Spend Analysis tab — starts rolled
 *  up (same chevron-rotate convention as `CollapsibleTableGroup`); expands
 *  to the individual commitments behind the summarized saving, plus the
 *  depletion-date effect in words. */
export function SensitivityEntryRow({ entry }: { entry: SensitivityEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-2 flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90"
            )}
            aria-hidden
          />
          <span className="font-medium">Cutting {entry.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatEUR(entry.monthlyAmount)}/mo
          </span>
        </span>
        <Badge
          variant="outline"
          className="shrink-0"
          style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}
        >
          +{entry.monthsAdded} {entry.monthsAdded === 1 ? "month" : "months"}
          {entry.becomesSustainable ? " (at least)" : ""}
        </Badge>
      </button>

      {open && (
        <div className="flex flex-col gap-3 pb-3 pl-5">
          <div className="flex flex-col gap-1">
            {entry.lines.map((line) => (
              <div
                key={line.name}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>{line.name}</span>
                <span className="tabular-nums">{formatEUR(line.monthlyAmount)}/mo</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Effect: depletion moves from {formatDateDisplay(entry.baselineDepletionDate)} to{" "}
            {entry.newDepletionDate
              ? formatDateDisplay(entry.newDepletionDate)
              : "beyond the projection horizon (never depletes)"}
            .
          </p>
        </div>
      )}
    </div>
  );
}
