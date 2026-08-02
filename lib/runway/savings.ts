import type { ResolvedSavingsRule } from "./types";

export const PERIODS_PER_YEAR: Record<ResolvedSavingsRule["accrualFrequency"], number> = {
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

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
 * This period's accrued return: `rule.allocationFraction` of
 * `openingBalance` (the household's *actual* running balance at the start
 * of this month, before this month's other cash flows — the caller is
 * responsible for passing that, not some independently-tracked sum), at
 * the periodic rate (annual ÷ periods/year — simple division, same "no
 * geometric effective-rate conversion" simplicity as `toMonthlyEquivalent`
 * elsewhere in this codebase). Deliberately *not* a segregated pot
 * compounding on its own: recalculated fresh every period against the real
 * balance, so it rises when income/lump sums land and falls as the
 * household spends its runway down — including going negative if
 * `openingBalance` itself is negative, a real consequence of tracking the
 * whole balance rather than a floor-at-zero side account.
 */
export function periodicAccrual(rule: ResolvedSavingsRule, openingBalance: number): number {
  const periodicRate = rule.annualReturnPct / 100 / PERIODS_PER_YEAR[rule.accrualFrequency];
  return rule.allocationFraction * openingBalance * periodicRate;
}
