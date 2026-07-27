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
import type { RunwayPoint } from "@/lib/runway";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: RunwayPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-2xl border border-border bg-popover px-3.5 py-2.5 text-sm shadow-sm">
      <div className="font-medium text-popover-foreground">
        {label ? formatMonthDisplay(label) : label}
      </div>
      <div className="tabular-nums text-muted-foreground">Balance: {formatEUR(point.balance)}</div>
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
}: {
  series: RunwayPoint[];
  depletionDate: string | null;
  /** The month currently shown in an external breakdown panel, if any — highlights its column. */
  selectedDate?: string | null;
  /** Fired with a point's date when its column/area is clicked. */
  onSelectMonth?: (date: string) => void;
}) {
  const depletionPoint = depletionDate ? series.find((p) => p.date === depletionDate) : undefined;
  const showCost = series.some((p) => p.monthlyCost != null);
  const gradientId = "depletion-fill";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart
        data={series}
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
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.35 }} />
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
      </ComposedChart>
    </ResponsiveContainer>
  );
}
