/**
 * The "do-nothing" reference line (DESIGN v2 §2.5): what the household's
 * balance would look like if no severance were taken at all — today's net
 * monthly surplus/deficit held flat from a starting point, not a
 * career-trajectory model (no salary growth/inflation, per the doc's
 * non-goals). Takes the scenario's own `dates` so the two series always
 * line up point-for-point on the same chart.
 */
export function projectDoNothingBaseline(
  dates: string[],
  startingBalance: number,
  monthlySurplus: number
): { date: string; balance: number }[] {
  return dates.map((date, i) => ({ date, balance: startingBalance + monthlySurplus * i }));
}
