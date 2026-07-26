import { activeCommitments, activeIncome, totalMonthlyCommitments, totalMonthlyNetIncome } from "./dashboard";
import { firstOfMonth, addMonths } from "./date-utils";
import type { Commitment, Income, TaxProfile } from "@/lib/types";

export type TrendPoint = { date: string; balance: number };

const MAX_MONTHS = 12;

/**
 * How many months of a meaningful trend exist, based on the earliest
 * start_date across commitments/income — there's no historical snapshot
 * table; the trend is reconstructed from records that were already active
 * in past months. Returns 0/1 when everything started this month (nothing
 * to trend yet).
 */
export function trendMonthsAvailable(commitments: Commitment[], income: Income[]): number {
  const dates = [
    ...commitments.map((c) => c.start_date),
    ...income.map((i) => i.start_date).filter((d): d is string => !!d),
  ];
  if (dates.length === 0) return 0;

  const earliest = dates.reduce((min, d) => (d < min ? d : min));
  const [ey, em] = firstOfMonth(earliest).split("-").map(Number);
  const [ty, tm] = firstOfMonth(new Date().toISOString().slice(0, 10)).split("-").map(Number);
  const monthsSince = (ty - ey) * 12 + (tm - em);

  return Math.min(monthsSince + 1, MAX_MONTHS);
}

/**
 * Reconstructs the household's monthly surplus/deficit for each of the last
 * `months`, by re-running the same active-record + net-income logic the
 * dashboard uses today against each past month's date instead of today's.
 */
export function computeHistoricalTrend(
  commitments: Commitment[],
  income: Income[],
  taxProfileByMember: Map<string, TaxProfile>,
  taxYear: number,
  months: number
): TrendPoint[] {
  const currentMonth = firstOfMonth(new Date().toISOString().slice(0, 10));
  const points: TrendPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = addMonths(currentMonth, -i);
    const monthlyCommitments = totalMonthlyCommitments(activeCommitments(commitments, date));
    const { netMonthly } = totalMonthlyNetIncome(
      activeIncome(income, date),
      taxProfileByMember,
      taxYear
    );
    points.push({ date, balance: netMonthly - monthlyCommitments });
  }

  return points;
}
