import type { RunwayPoint } from "./types";

export type AnnualIncomeSource = {
  label: string;
  grossAnnual: number;
};

export type AnnualIncomeByMember = {
  householdMemberId: string;
  year: number;
  /** Wage-taxable sources, merged by label across the year's months —
   *  feeds lib/tax/annual-tax-summary.ts's `annualPersonTaxSummary`. */
  sources: AnnualIncomeSource[];
  /** Tax-exempt income (ALG I) for the same person/year — see
   *  `RunwayLineItem.taxExempt`. */
  taxFreeGross: number;
  /** Savings/investment accrual (gross, before Abgeltungsteuer) for the
   *  same person/year — see `RunwayLineItem.investmentIncome`. Kept
   *  separate from `sources` since it's taxed under the flat capital-gains
   *  regime, not the progressive wage-tax bands `sources` feeds. */
  investmentGross: number;
};

/**
 * Groups a runway projection's monthly breakdown by (household member,
 * calendar year), summing every wage-taxable inflow into its own source
 * total, every tax-exempt inflow into `taxFreeGross`, and every investment
 * accrual into `investmentGross` — the input `lib/tax/annual-tax-summary.ts`'s
 * per-person annual tax summary is built from. Only items the projection
 * itself tagged with a `householdMemberId` are attributable (income split
 * across 2+ people is left out here — see the tagging decisions in
 * project-runway.ts).
 */
export function aggregateAnnualIncomeByMember(series: RunwayPoint[]): AnnualIncomeByMember[] {
  type Entry = {
    householdMemberId: string;
    year: number;
    sourceTotals: Map<string, number>;
    taxFreeGross: number;
    investmentGross: number;
  };
  const byKey = new Map<string, Entry>();

  for (const point of series) {
    const year = Number(point.date.slice(0, 4));
    for (const item of point.breakdown?.inflows ?? []) {
      if (!item.householdMemberId) continue;
      const key = `${item.householdMemberId}::${year}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          householdMemberId: item.householdMemberId,
          year,
          sourceTotals: new Map(),
          taxFreeGross: 0,
          investmentGross: 0,
        };
        byKey.set(key, entry);
      }
      if (item.taxExempt) {
        entry.taxFreeGross += item.amount;
      } else if (item.investmentIncome) {
        entry.investmentGross += item.grossAmount ?? item.amount;
      } else if (item.grossAmount != null) {
        entry.sourceTotals.set(item.label, (entry.sourceTotals.get(item.label) ?? 0) + item.grossAmount);
      }
    }
  }

  return Array.from(byKey.values())
    .map((e) => ({
      householdMemberId: e.householdMemberId,
      year: e.year,
      sources: Array.from(e.sourceTotals.entries())
        .map(([label, grossAnnual]) => ({ label, grossAnnual }))
        .filter((s) => s.grossAnnual > 0),
      taxFreeGross: e.taxFreeGross,
      investmentGross: e.investmentGross,
    }))
    .filter((e) => e.sources.length > 0 || e.taxFreeGross > 0 || e.investmentGross !== 0)
    .sort((a, b) => a.year - b.year || a.householdMemberId.localeCompare(b.householdMemberId));
}
