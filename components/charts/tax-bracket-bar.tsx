import { formatEUR } from "@/lib/finance/frequency";
import type { TaxBracketStep } from "@/lib/tax";

// Sequential ramp, light → dark, on the single brand hue (dataviz skill:
// "Sequential = one hue, light→dark") — a bracket ladder is a magnitude
// scale (rising marginal rate), not a set of unrelated categories, so it
// doesn't draw from the categorical --series-* palette.
const ZONE_MIX = [14, 32, 52, 74, 100];

function zoneColor(index: number): string {
  const mix = ZONE_MIX[Math.min(index, ZONE_MIX.length - 1)];
  return mix >= 100 ? "var(--primary)" : `color-mix(in oklch, var(--primary) ${mix}%, var(--card))`;
}

// Severance is taxed under a completely different mechanism (Fünftelregelung,
// not a literal marginal step), so it's a 6th, visually distinct column
// rather than folded into the sequential ramp.
const SEVERANCE_COLOR = "var(--series-3)";

/** How much of a zone's own euro range the income has used up, 0–100 —
 *  the open-ended top zone has no natural width to measure a fraction
 *  against, so it's simply lit fully once reached at all. */
function fillPct(step: TaxBracketStep): number {
  if (!step.reached) return 0;
  if (step.rangeEnd == null) return 100;
  const width = step.rangeEnd - step.rangeStart;
  return width > 0 ? Math.min(100, (step.amountInZone / width) * 100) : 100;
}

/**
 * The full 0–45% §32a tax ladder, always showing all five zones (per
 * `taxBracketBreakdown`'s own contract) so the shape of the whole tariff is
 * visible — not just the portion a person's income happens to reach — plus
 * a 6th column for a severance lump sum taxed via the Fünftelregelung, if
 * any. Each column is its own mini fill-bar: how much of *that zone's own*
 * euro range the income has used, so the ladder reads at a glance as
 * "here's the whole structure, here's where I currently sit on it."
 */
export function TaxBracketBar({
  steps,
  severanceGross = 0,
  severanceTax = 0,
}: {
  steps: TaxBracketStep[];
  severanceGross?: number;
  severanceTax?: number;
}) {
  const columns = [
    ...steps.map((s, i) => ({
      key: `${s.zoneLabel}-${i}`,
      rateLabel: s.zoneLabel,
      rangeLabel: s.rangeEnd == null ? `${formatEUR(s.rangeStart)}+` : `${formatEUR(s.rangeStart)}–${formatEUR(s.rangeEnd)}`,
      amount: s.amountInZone,
      tax: s.taxInZone,
      reached: s.reached,
      fill: fillPct(s),
      color: zoneColor(i),
    })),
    {
      key: "severance",
      rateLabel: "Severance",
      rangeLabel: "Fünftelregelung",
      amount: severanceGross,
      tax: severanceTax,
      reached: severanceGross > 0,
      fill: severanceGross > 0 ? 100 : 0,
      color: SEVERANCE_COLOR,
    },
  ];

  const reachedColumns = columns.filter((c) => c.reached);

  return (
    <div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6">
        {columns.map((col) => (
          <div key={col.key} className="flex flex-col gap-1.5" title={`${col.rateLabel}: ${formatEUR(col.amount)}, tax ${formatEUR(col.tax)}`}>
            <div
              className={`truncate text-xs font-semibold ${col.reached ? "text-foreground" : "text-muted-foreground"}`}
            >
              {col.rateLabel}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${col.rateLabel} bracket, ${Math.round(col.fill)}% filled`}>
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${col.fill}%`, backgroundColor: col.color }}
              />
            </div>
            <div className="truncate text-[11px] tabular-nums text-muted-foreground">{col.rangeLabel}</div>
          </div>
        ))}
      </div>

      {reachedColumns.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 text-xs">
          {reachedColumns.map((col) => (
            <div key={col.key} className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: col.color }} aria-hidden />
              <span className="text-muted-foreground">{col.rateLabel}</span>
              <span className="font-medium tabular-nums">{formatEUR(col.amount)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums text-muted-foreground">{formatEUR(col.tax)} tax</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
