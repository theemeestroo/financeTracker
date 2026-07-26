"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/finance/frequency";
import type { CategoryBreakdownEntry } from "@/lib/finance/dashboard";

// Sequential monochrome ramp, darkest (ink) first — bars are pre-sorted by
// size, so the largest category reads as the boldest, tapering to lighter
// tints for smaller ones. Single-series data stays monochrome per the
// design system; no categorical hues here.
const RAMP = [
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-2)",
  "var(--chart-1)",
];

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CategoryBreakdownEntry }[];
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-2xl border border-border bg-popover px-3.5 py-2.5 text-sm shadow-sm">
      <div className="font-medium text-popover-foreground">{entry.label}</div>
      <div className="tabular-nums text-muted-foreground">
        {formatEUR(entry.monthly)}/mo
      </div>
    </div>
  );
}

export function CategoryBreakdownChart({ data }: { data: CategoryBreakdownEntry[] }) {
  const height = Math.max(data.length * 40 + 24, 140);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
        barCategoryGap={10}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip />} />
        <Bar dataKey="monthly" radius={[0, 10, 10, 0]} maxBarSize={22}>
          {data.map((entry, index) => (
            <Cell key={entry.category} fill={RAMP[Math.min(index, RAMP.length - 1)]} />
          ))}
          <LabelList
            dataKey="monthly"
            position="right"
            formatter={(value: unknown) => formatEUR(Number(value))}
            className="fill-foreground text-xs font-semibold"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
