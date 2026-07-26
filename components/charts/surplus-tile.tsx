import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR } from "@/lib/finance/frequency";

export function SurplusTile({
  label,
  monthlyIncome,
  monthlyCommitments,
}: {
  label: string;
  monthlyIncome: number;
  monthlyCommitments: number;
}) {
  const surplus = monthlyIncome - monthlyCommitments;
  const isSurplus = surplus >= 0;
  const statusColor = isSurplus ? "var(--status-good)" : "var(--status-critical)";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <span
            className="text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl"
            style={{ color: statusColor }}
          >
            {formatEUR(Math.abs(surplus))}
          </span>
          <span
            className="mb-1.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              color: statusColor,
              backgroundColor: `color-mix(in oklch, ${statusColor}, transparent 88%)`,
            }}
          >
            {isSurplus ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {isSurplus ? "Surplus" : "Deficit"}
          </span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {formatEUR(monthlyIncome)} income − {formatEUR(monthlyCommitments)} commitments, per
          month
        </p>
      </CardContent>
    </Card>
  );
}
