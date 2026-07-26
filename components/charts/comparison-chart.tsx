"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/finance/frequency";

export type ComparisonSeries = {
  id: string;
  name: string;
  color: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  series: ComparisonSeries[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-popover px-3.5 py-2.5 text-sm shadow-sm">
      <div className="mb-1.5 font-medium text-popover-foreground">{label}</div>
      <div className="flex flex-col gap-1">
        {payload.map((entry) => {
          const s = series.find((x) => x.id === entry.dataKey);
          if (!s || entry.value == null) return null;
          return (
            <div key={entry.dataKey} className="flex items-center gap-2">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="text-muted-foreground">{s.name}</span>
              <span className="ml-auto tabular-nums font-medium text-popover-foreground">
                {formatEUR(entry.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Dot-swatch legend (identity via a colored dot, not a line stroke sample). */
function DotLegend({ series }: { series: ComparisonSeries[] }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

export function ComparisonChart({
  data,
  series,
}: {
  data: Record<string, string | number | null>[];
  series: ComparisonSeries[];
}) {
  return (
    <div>
      <DotLegend series={series} />
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
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
          <Tooltip content={<ChartTooltip series={series} />} />
          {series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
