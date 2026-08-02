import { firstOfMonth, addMonths } from "@/lib/finance/date-utils";
import { activeProfileFor, monthlyIncomeItems, monthlyCommitmentItems } from "./monthly-items";
import type { ResolvedSeveranceScenario, RunwayPoint } from "./types";

/**
 * Synthesizes `RunwayPoint`s for the months *before* `projectRunway`'s own
 * start month, back to January 1 of that same calendar year — a severance
 * starting mid-year (say, April) means the real projection only covers
 * April onward (deliberately: the balance projection starts exactly at the
 * severance event, not before), but both (a) the Cash Flow tab's own chart
 * and month-breakdown table, and (b) the Tax tab's per-year totals, are
 * more useful showing the household's actual full year.
 *
 * Uses the same per-phase income/commitment logic the real projection uses
 * (`activeProfileFor`/`monthlyIncomeItems`/`monthlyCommitmentItems`, all
 * shared via `monthly-items.ts`) — severance streams, one-off scenario
 * events, recurring-income-start events, and savings/investment accrual are
 * deliberately not modeled here, since none of them exist yet before the
 * earliest severance actually starts.
 *
 * Balance is computed *backward* from `scenario.startingBalance` — which is
 * defined as the balance the moment the real projection begins, i.e. the
 * closing balance of the month immediately before it — rather than assumed
 * to be 0 or the same figure repeated: each earlier month's own closing
 * balance is `the next month's closing balance minus that next month's own
 * delta`, walking back to January.
 */
export function precedingMonthsSeries(scenario: ResolvedSeveranceScenario): RunwayPoint[] {
  if (scenario.phases.length === 0 || scenario.severances.length === 0) return [];

  const runwayStartMonth = firstOfMonth(
    scenario.severances.reduce(
      (earliest, s) => (s.severanceStartDate < earliest ? s.severanceStartDate : earliest),
      scenario.severances[0].severanceStartDate
    )
  );
  const yearStart = `${runwayStartMonth.slice(0, 4)}-01-01`;
  if (yearStart >= runwayStartMonth) return [];

  const months: string[] = [];
  for (let date = yearStart; date < runwayStartMonth; date = addMonths(date, 1)) {
    months.push(date);
  }

  const monthData = months.map((date) => {
    const phase = activeProfileFor(date, scenario.phases);
    const commitmentItems = monthlyCommitmentItems(phase, date);
    const incomeItems = monthlyIncomeItems(phase, date, scenario.taxProfileByMember, scenario.taxYear);
    const monthlyCost = -commitmentItems.reduce((sum, i) => sum + i.amount, 0);
    const items = [...commitmentItems, ...incomeItems];
    const delta = items.reduce((sum, i) => sum + i.amount, 0);
    return { date, items, monthlyCost, delta };
  });

  let closingBalance = scenario.startingBalance;
  const reversed: RunwayPoint[] = [];
  for (let i = monthData.length - 1; i >= 0; i--) {
    const { date, items, monthlyCost, delta } = monthData[i];
    reversed.push({
      date,
      balance: closingBalance,
      monthlyCost,
      breakdown: {
        inflows: items.filter((it) => it.amount > 0),
        outflows: items.filter((it) => it.amount < 0).map((it) => ({ label: it.label, amount: -it.amount })),
      },
    });
    closingBalance -= delta;
  }

  return reversed.reverse();
}
