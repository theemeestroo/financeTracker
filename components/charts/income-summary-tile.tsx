import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR } from "@/lib/finance/frequency";
import type { IncomePersonBreakdownEntry, IncomeTypeBreakdownEntry } from "@/lib/finance/dashboard";

// Same fixed categorical order as severance-scenarios/compare's SERIES_COLORS
// — IncomeType has exactly four values (salary/part_time/rental/other), a
// perfect fit for the four validated categorical hues.
const TYPE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

/** Companion to SurplusTile — net monthly income, broken down as a
 *  segmented bar + dot legend by IncomeType (CLAUDE.md's established
 *  category-breakdown pattern), plus a per-person line when more than one
 *  household member actually has income. */
export function IncomeSummaryTile({
  total,
  byType,
  byPerson,
}: {
  total: number;
  byType: IncomeTypeBreakdownEntry[];
  byPerson: IncomePersonBreakdownEntry[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Income by type (net, monthly)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl">
          {formatEUR(total)}
        </span>

        {byType.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No income linked to a taxed person yet.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              {byType.map((entry, i) => (
                <div
                  key={entry.type}
                  className="h-full"
                  style={{
                    width: `${(entry.monthly / total) * 100}%`,
                    backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length],
                  }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {byType.map((entry, i) => (
                <li key={entry.type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length] }}
                    aria-hidden
                  />
                  {entry.label}
                  <span className="tabular-nums font-medium text-foreground">
                    {formatEUR(entry.monthly)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {byPerson.length >= 2 && (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            {byPerson.map((p) => (
              <span key={p.householdMemberId} className="mr-3 inline-block">
                {p.name} <span className="tabular-nums font-medium text-foreground">{formatEUR(p.monthly)}</span>
              </span>
            ))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
