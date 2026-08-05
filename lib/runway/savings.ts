import type { SeveranceScenarioSavingsRule } from "@/lib/types";
import type { ResolvedSavingsRule } from "./types";

export const PERIODS_PER_YEAR: Record<ResolvedSavingsRule["accrualFrequency"], number> = {
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

/** A DB savings-rule row's amount-vs-percentage, resolved to a flat EUR
 *  principal against that package's own severance base — shared by
 *  `resolve-scenario.ts` (feeding the runway projection) and the scenario
 *  detail page (display/headroom), so the two can never drift apart. An
 *  "amount" rule uses the entered figure as-is, uncapped by `severanceBase`
 *  here — the form/server action already validate a package's rules can't
 *  add up to more than its own severance. */
export function resolveSavingsPrincipal(
  rule: Pick<SeveranceScenarioSavingsRule, "allocation_type" | "amount" | "percentage">,
  severanceBase: number
): number {
  return rule.allocation_type === "amount"
    ? (rule.amount ?? 0)
    : ((rule.percentage ?? 0) / 100) * severanceBase;
}

/** Months between two ISO dates, month-granularity (day-of-month ignored —
 *  every date this app hands here is already first-of-month). Same
 *  arithmetic `lib/finance/trend.ts`'s `trendMonthsAvailable` already uses
 *  inline; kept local here rather than extracted, same as that file. */
function monthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm] = fromISO.split("-").map(Number);
  const [ty, tm] = toISO.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Whether `date` is one of `rule`'s accrual boundaries — counted from its
 *  own `startMonth`, not the scenario's projection start, so a quarterly
 *  rule starting mid-scenario still accrues every 3 months from *its own*
 *  start rather than misaligning to some other calendar anchor. */
export function isAccrualMonth(rule: ResolvedSavingsRule, date: string): boolean {
  if (date < rule.startMonth) return false;
  const elapsed = monthsBetween(rule.startMonth, date);
  const periodMonths = 12 / PERIODS_PER_YEAR[rule.accrualFrequency];
  return elapsed % periodMonths === 0;
}

/**
 * This period's accrued return: `potBalance` (this rule's own segregated
 * pot — seeded from `principal` and compounded forward period over period;
 * the caller tracks that running value and passes in its current amount,
 * this function is a pure per-period calculation, not itself stateful) at
 * the periodic rate (annual ÷ periods/year — simple division, same "no
 * geometric effective-rate conversion" simplicity as `toMonthlyEquivalent`
 * elsewhere in this codebase). Independent of the household's shared
 * running balance — see `ResolvedSavingsRule`'s own comment for why.
 */
export function periodicAccrual(rule: ResolvedSavingsRule, potBalance: number): number {
  const periodicRate = rule.annualReturnPct / 100 / PERIODS_PER_YEAR[rule.accrualFrequency];
  return potBalance * periodicRate;
}
