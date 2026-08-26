import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatEUR } from "@/lib/finance/frequency";

/** How far a Living Profile item's current value sits from the
 *  `baseline_amount`/`baseline_gross_amount` it was cloned at — deliberately
 *  neutral (no good/critical coloring): an increase reads differently for a
 *  commitment than for income, so this only signals direction and size, not
 *  judgment. Renders nothing once the item matches its baseline again. */
export function BaselineDeltaBadge({ deltaEur }: { deltaEur: number }) {
  if (Math.abs(deltaEur) < 0.005) return null;
  const isUp = deltaEur > 0;

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {isUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {isUp ? "+" : "−"}
      {formatEUR(Math.abs(deltaEur))} vs baseline
    </span>
  );
}
