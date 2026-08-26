"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/finance/frequency";
import { formatMonthDisplay } from "@/lib/finance/date-utils";
import type { PerMemberRunway, RunwayPoint } from "@/lib/runway";

type ChartPoint = RunwayPoint;

/** Distinct series colors for each household member's own depletion dot —
 *  cycles for a 4th+ member. Deliberately skips --series-1 (teal), which is
 *  the same hex as --status-good and would blur into the "sustainable"
 *  signal instead of reading as a member's own marker. */
const MEMBER_DOT_COLORS = ["var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-1)"];

function ChartTooltip({
  active,
  payload,
  label,
  memberById,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  label?: string;
  /** Present (and >= 2 entries) only for a multi-person household — see
   *  RunwayProjection's own showPerMember gate. */
  memberById?: Map<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const memberIds = memberById ? Array.from(memberById.keys()) : [];
  return (
    <div className="rounded-2xl border border-border bg-popover px-3.5 py-2.5 text-sm shadow-sm">
      <div className="font-medium text-popover-foreground">
        {label ? formatMonthDisplay(label) : label}
      </div>
      <div className="tabular-nums text-muted-foreground">Balance: {formatEUR(point.balance)}</div>
      {memberIds.length >= 2 && point.balanceByMember && (
        <div className="mt-1 flex flex-col border-t border-border pt-1">
          {memberIds.map((id) => (
            <span key={id} className="tabular-nums text-muted-foreground">
              {memberById?.get(id) ?? "—"}: {formatEUR(point.balanceByMember?.[id] ?? 0)}
            </span>
          ))}
        </div>
      )}
      {point.monthlyCost != null && (
        <div className="tabular-nums text-muted-foreground">
          Monthly cost: {formatEUR(point.monthlyCost)}
        </div>
      )}
    </div>
  );
}

export function DepletionChart({
  series,
  depletionDate,
  selectedDate,
  onSelectMonth,
  memberById,
  perMember,
}: {
  series: RunwayPoint[];
  depletionDate: string | null;
  /** The month currently shown in an external breakdown panel, if any — highlights its column. */
  selectedDate?: string | null;
  /** Fired with a point's date when its column/area is clicked. */
  onSelectMonth?: (date: string) => void;
  /** Household member id -> name, for the tooltip's per-person balance
   *  lines and each member's own depletion dot below. Omit (or a single
   *  member) to show only the household total, same as before this prop
   *  existed. */
  memberById?: Map<string, string>;
  /** Each member's own depletion status (RunwayResult.perMember) — plotted
   *  as a small dot on their own sub-balance at the point it goes negative,
   *  alongside the household total's existing (larger, critical-red) dot. */
  perMember?: PerMemberRunway[];
}) {
  const depletionPoint = depletionDate ? series.find((p) => p.date === depletionDate) : undefined;
  const showPerMember = (memberById?.size ?? 0) >= 2;
  const showCost = series.some((p) => p.monthlyCost != null);
  const gradientId = "depletion-fill";

  const chartData: ChartPoint[] = series;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart
        data={chartData}
        margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
        className={onSelectMonth ? "cursor-pointer" : undefined}
        onClick={(state) => {
          const label = state?.activeLabel;
          if (onSelectMonth && typeof label === "string") onSelectMonth(label);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatMonthDisplay(d)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          yAxisId="balance"
          orientation="right"
          tickFormatter={(v: number) => formatEUR(v)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        {showCost && (
          <YAxis
            yAxisId="cost"
            orientation="left"
            tickFormatter={(v: number) => formatEUR(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
        )}
        <ReferenceLine yAxisId="balance" y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
        {selectedDate && (
          <ReferenceLine
            yAxisId="balance"
            x={selectedDate}
            stroke="var(--foreground)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        )}
        <Tooltip
          content={<ChartTooltip memberById={showPerMember ? memberById : undefined} />}
          cursor={{ fill: "var(--muted)", opacity: 0.35 }}
        />
        {showCost && (
          <Bar
            yAxisId="cost"
            dataKey="monthlyCost"
            radius={[3, 3, 0, 0]}
            maxBarSize={10}
            isAnimationActive={false}
          >
            {series.map((point) => (
              <Cell
                key={point.date}
                fill={point.date === selectedDate ? "var(--chart-5)" : "var(--chart-3)"}
              />
            ))}
          </Bar>
        )}
        <Area
          yAxisId="balance"
          type="monotone"
          dataKey="balance"
          stroke="var(--chart-5)"
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
        {depletionPoint && (
          <ReferenceDot
            yAxisId="balance"
            x={depletionPoint.date}
            y={depletionPoint.balance}
            r={5}
            fill="var(--status-critical)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        )}
        {showPerMember &&
          perMember?.map((pm, index) => {
            if (!pm.depletionDate) return null;
            const point = chartData.find((p) => p.date === pm.depletionDate);
            // Plotted on the total balance line itself (not this member's
            // own often-near-zero sub-balance) so the marker stays visible
            // and readable even when the household total is much larger —
            // it's marking *when* this person's own money runs out, not
            // *how much* balance is left at that instant.
            const y = point?.balance;
            if (y == null) return null;
            return (
              <ReferenceDot
                key={pm.householdMemberId}
                yAxisId="balance"
                x={pm.depletionDate}
                y={y}
                r={3.5}
                fill={MEMBER_DOT_COLORS[index % MEMBER_DOT_COLORS.length]}
                stroke="var(--card)"
                strokeWidth={1.5}
              />
            );
          })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
