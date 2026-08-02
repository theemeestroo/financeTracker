"use client";

import { useMemo, useState } from "react";
import { DepletionChart } from "@/components/charts/depletion-chart";
import { formatEUR } from "@/lib/finance/frequency";
import { formatMonthDisplay } from "@/lib/finance/date-utils";
import type { RunwayLineItem, RunwayResult } from "@/lib/runway";

function LineItemRow({ item, sign }: { item: RunwayLineItem; sign: "+" | "−" }) {
  // Gross is only worth a second line when it's genuinely different from
  // net (i.e. actually taxed) — a gross fallback (no tax profile yet) or a
  // tax-exempt item (ALG I) would just repeat the same number twice.
  const showGross =
    sign === "+" && item.grossAmount != null && Math.abs(item.grossAmount - item.amount) > 0.5;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-foreground">
        {item.label}
        {item.taxExempt && (
          <span className="ml-1.5 text-xs text-muted-foreground">(tax-free)</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`tabular-nums font-medium ${sign === "−" ? "text-muted-foreground" : "text-foreground"}`}
        >
          {sign}
          {formatEUR(item.amount)}
        </span>
        {showGross && (
          <span className="block text-xs tabular-nums text-muted-foreground">
            {formatEUR(item.grossAmount!)} gross
          </span>
        )}
      </span>
    </div>
  );
}

/** Projected-balance chart plus a click-to-select monthly income/outgoings
 *  breakdown — clicking a column pins that month's itemized cash flow below. */
export function RunwayProjection({
  runway,
  baselineSeries,
}: {
  runway: RunwayResult;
  /** "Do-nothing" reference line (DESIGN v2 §2.5) — see DepletionChart. */
  baselineSeries?: { date: string; balance: number }[];
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(runway.series[0]?.date ?? null);

  const selected = useMemo(
    () => runway.series.find((p) => p.date === selectedDate) ?? null,
    [runway.series, selectedDate]
  );

  const totalIn = selected?.breakdown?.inflows.reduce((sum, i) => sum + i.amount, 0) ?? 0;
  const totalOut = selected?.breakdown?.outflows.reduce((sum, i) => sum + i.amount, 0) ?? 0;
  const inShare = totalIn + totalOut > 0 ? (totalIn / (totalIn + totalOut)) * 100 : 0;

  return (
    <>
      <DepletionChart
        series={runway.series}
        depletionDate={runway.depletionDate}
        selectedDate={selectedDate}
        onSelectMonth={setSelectedDate}
        baselineSeries={baselineSeries}
      />

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[var(--chart-5)]" aria-hidden />
          Balance (right axis)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[var(--chart-3)]" aria-hidden />
          Monthly cost (left axis)
        </span>
        {baselineSeries && (
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t-[1.5px] border-dashed border-muted-foreground" aria-hidden />
            Do-nothing (today&apos;s surplus held flat)
          </span>
        )}
        <span>Click a column for that month&apos;s breakdown</span>
      </div>

      {selected && (
        <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {formatMonthDisplay(selected.date)} breakdown
            </div>
            <div className="tabular-nums text-xs text-muted-foreground">
              Net {formatEUR(totalIn - totalOut)}
            </div>
          </div>

          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full bg-[var(--status-good)]" style={{ width: `${inShare}%` }} />
            <div className="h-full bg-[var(--status-critical)]" style={{ width: `${100 - inShare}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[var(--status-good)]" aria-hidden />
              In {formatEUR(totalIn)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[var(--status-critical)]" aria-hidden />
              Out {formatEUR(totalOut)}
            </span>
          </div>

          <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Income</div>
              {!selected.breakdown || selected.breakdown.inflows.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No income this month.</p>
              ) : (
                selected.breakdown.inflows.map((item, i) => (
                  <LineItemRow key={`${item.label}-${i}`} item={item} sign="+" />
                ))
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Outgoings</div>
              {!selected.breakdown || selected.breakdown.outflows.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No outgoings this month.</p>
              ) : (
                selected.breakdown.outflows.map((item, i) => (
                  <LineItemRow key={`${item.label}-${i}`} item={item} sign="−" />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
