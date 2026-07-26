"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/finance/frequency";
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
      <div className="font-medium text-popover-foreground">{label}</div>
      <div className="tabular-nums text-muted-foreground">{formatEUR(point.balance)}</div>
    </div>
  );
}

export function DepletionChart({
  series,
  depletionDate,
}: {
  series: RunwayPoint[];
  depletionDate: string | null;
}) {
  const depletionPoint = depletionDate ? series.find((p) => p.date === depletionDate) : undefined;
  const gradientId = "depletion-fill";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(0, 7)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={(v: number) => formatEUR(v)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
        <Tooltip content={<ChartTooltip />} />
        <Area
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
            x={depletionPoint.date}
            y={depletionPoint.balance}
            r={5}
            fill="var(--status-critical)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
