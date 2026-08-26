"use client";

import { useMemo, useState } from "react";
import { DepletionChart } from "@/components/charts/depletion-chart";
import { formatEUR } from "@/lib/finance/frequency";
import { formatDateDisplay, formatMonthDisplay } from "@/lib/finance/date-utils";
import type { RunwayLineItem, RunwayResult } from "@/lib/runway";

/** Named-member groups first (in `memberIds` order, skipping anyone with
 *  nothing this month), then a trailing "Shared" group for anything with no
 *  single owner — a general household item, or one split across 2+ people
 *  (see RunwayLineItem.householdMemberId's own doc). Only called once the
 *  household has 2+ members; for 1, everything is trivially that person's
 *  own, so the caller skips grouping entirely instead of showing a
 *  redundant single-member split. */
function groupByAttribution(
  items: RunwayLineItem[],
  memberIds: string[],
  memberById: Map<string, string>
): { key: string; label: string; items: RunwayLineItem[] }[] {
  const groups: { key: string; label: string; items: RunwayLineItem[] }[] = [];
  for (const id of memberIds) {
    const own = items.filter((i) => i.householdMemberId === id);
    if (own.length > 0) groups.push({ key: id, label: memberById.get(id) ?? "—", items: own });
  }
  const shared = items.filter((i) => !i.householdMemberId || !memberIds.includes(i.householdMemberId));
  if (shared.length > 0) groups.push({ key: "shared", label: "Shared", items: shared });
  return groups;
}

function RunwayStatusPill({ label, depletionDate }: { label: string; depletionDate: string | null }) {
  const sustainable = !depletionDate;
  const color = sustainable ? "var(--status-good)" : "var(--status-critical)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium"
      style={{ color }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}: {sustainable ? "Sustainable" : formatDateDisplay(depletionDate)}
    </span>
  );
}

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

function BreakdownColumn({
  label,
  items,
  sign,
  emptyLabel,
  memberIds,
  memberById,
}: {
  label: string;
  items: RunwayLineItem[];
  sign: "+" | "−";
  emptyLabel: string;
  /** Grouped into per-member + "Shared" sections when there are 2+ members;
   *  a single-member (or empty) household renders the same flat list as
   *  before this grouping existed. */
  memberIds: string[];
  memberById: Map<string, string>;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : memberIds.length < 2 ? (
        items.map((item, i) => <LineItemRow key={`${item.label}-${i}`} item={item} sign={sign} />)
      ) : (
        groupByAttribution(items, memberIds, memberById).map((group) => (
          <div key={group.key} className="mb-3 last:mb-0">
            <div className="mb-0.5 flex items-baseline justify-between text-[11px] font-medium text-muted-foreground/70">
              <span>{group.label}</span>
              <span className="tabular-nums">
                {formatEUR(group.items.reduce((sum, i) => sum + i.amount, 0))}
              </span>
            </div>
            {group.items.map((item, i) => (
              <LineItemRow key={`${item.label}-${i}`} item={item} sign={sign} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

/** Projected-balance chart plus a click-to-select monthly income/outgoings
 *  breakdown — clicking a column pins that month's itemized cash flow below. */
export function RunwayProjection({
  runway,
  memberById,
}: {
  runway: RunwayResult;
  /** Household member id -> name. Drives every per-person addition here
   *  (shared/individual grouping, balance per person, runway status per
   *  person) — all gated on 2+ members, since a single-member household's
   *  "individual" figure is trivially the same as the total already shown. */
  memberById: Map<string, string>;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(runway.series[0]?.date ?? null);
  const memberIds = useMemo(() => Array.from(memberById.keys()), [memberById]);
  const showPerMember = memberIds.length >= 2;

  const selected = useMemo(
    () => runway.series.find((p) => p.date === selectedDate) ?? null,
    [runway.series, selectedDate]
  );

  const totalIn = selected?.breakdown?.inflows.reduce((sum, i) => sum + i.amount, 0) ?? 0;
  const totalOut = selected?.breakdown?.outflows.reduce((sum, i) => sum + i.amount, 0) ?? 0;
  const net = totalIn - totalOut;
  // Each bar's own length relative to the bigger of the two — not a
  // stacked/normalized-to-100% split, which made two very different-sized
  // months look identical (in/out always summed to the same full bar) and
  // buried the actual size difference between them.
  const maxInOut = Math.max(totalIn, totalOut, 1);

  return (
    <>
      <DepletionChart
        series={runway.series}
        depletionDate={runway.depletionDate}
        selectedDate={selectedDate}
        onSelectMonth={setSelectedDate}
        memberById={memberById}
        perMember={runway.perMember}
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
        <span>Click a column for that month&apos;s breakdown</span>
      </div>

      {showPerMember && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Runway status
          </span>
          <RunwayStatusPill label="Total" depletionDate={runway.depletionDate} />
          {runway.perMember?.map((pm) => (
            <RunwayStatusPill
              key={pm.householdMemberId}
              label={memberById.get(pm.householdMemberId) ?? "—"}
              depletionDate={pm.depletionDate}
            />
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {formatMonthDisplay(selected.date)} breakdown
            </div>
            <div
              className="tabular-nums text-xs font-semibold"
              style={{ color: net >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
            >
              Net {formatEUR(net)}
            </div>
          </div>

          {showPerMember && selected.balanceByMember && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
              <span>Balance — Total {formatEUR(selected.balance)}</span>
              {memberIds.map((id) => (
                <span key={id}>
                  {memberById.get(id) ?? "—"} {formatEUR(selected.balanceByMember?.[id] ?? 0)}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
              <span className="w-9 shrink-0">In</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-[var(--status-good)]"
                  style={{ width: `${(totalIn / maxInOut) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-right">{formatEUR(totalIn)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
              <span className="w-9 shrink-0">Out</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-[var(--status-critical)]"
                  style={{ width: `${(totalOut / maxInOut) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-right">{formatEUR(totalOut)}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <BreakdownColumn
              label="Income"
              items={selected.breakdown?.inflows ?? []}
              sign="+"
              emptyLabel="No income this month."
              memberIds={memberIds}
              memberById={memberById}
            />
            <BreakdownColumn
              label="Outgoings"
              items={selected.breakdown?.outflows ?? []}
              sign="−"
              emptyLabel="No outgoings this month."
              memberIds={memberIds}
              memberById={memberById}
            />
          </div>
        </div>
      )}
    </>
  );
}
