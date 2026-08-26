import { firstOfMonth, addMonths } from "@/lib/finance/date-utils";
import { todayISO } from "@/lib/finance/dashboard";
import { activeProfileFor, monthlyIncomeItems, monthlyCommitmentItems } from "./monthly-items";
import type { ResolvedSeveranceScenario, RunwayPoint } from "./types";

/**
 * Synthesizes `RunwayPoint`s for the months *before* `projectRunway`'s own
 * start month — back to the current calendar month (today), so the lead-in
 * always reflects the household's actual real-time run-up to the severance
 * event rather than an arbitrary fixed window. A severance starting mid-year
 * (say, April) means the real projection only covers April onward
 * (deliberately: the balance projection starts exactly at the severance
 * event, not before), but both (a) the Cash Flow tab's own chart and
 * month-breakdown table, and (b) the Tax tab's per-year totals, are more
 * useful showing the household's actual run-up to it. If today is already
 * at or past the severance start (or the scenario is planned so far out
 * that "now" isn't meaningfully "before" it in a way this function needs to
 * special-case), there's nothing to backfill.
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
 * delta`, walking back from the start. Anchoring the backfill's start at
 * "today" (rather than reaching further into real, already-lived history)
 * keeps this a genuine forward-looking projection of what happens between
 * now and the severance event, not a guess about the past.
 */
export function precedingMonthsSeries(scenario: ResolvedSeveranceScenario): RunwayPoint[] {
  if (scenario.phases.length === 0 || scenario.severances.length === 0) return [];

  const runwayStartMonth = firstOfMonth(
    scenario.severances.reduce(
      (earliest, s) => (s.severanceStartDate < earliest ? s.severanceStartDate : earliest),
      scenario.severances[0].severanceStartDate
    )
  );
  const backfillStart = firstOfMonth(todayISO());
  if (backfillStart >= runwayStartMonth) return [];

  const months: string[] = [];
  for (let date = backfillStart; date < runwayStartMonth; date = addMonths(date, 1)) {
    months.push(date);
  }

  const householdMemberIds = scenario.householdMemberIds ?? [];

  const monthData = months.map((date) => {
    const phase = activeProfileFor(date, scenario.phases);
    const { items: commitmentItems, memberDeltas: commitmentMemberDeltas } = monthlyCommitmentItems(
      phase,
      date,
      householdMemberIds
    );
    const { items: incomeItems, memberDeltas: incomeMemberDeltas } = monthlyIncomeItems(
      phase,
      date,
      scenario.taxProfileByMember,
      scenario.taxYear,
      householdMemberIds
    );
    const monthlyCost = -commitmentItems.reduce((sum, i) => sum + i.amount, 0);
    const items = [...commitmentItems, ...incomeItems];
    const delta = items.reduce((sum, i) => sum + i.amount, 0);

    const memberDeltas = new Map<string, number>();
    for (const [id, amount] of commitmentMemberDeltas) memberDeltas.set(id, (memberDeltas.get(id) ?? 0) + amount);
    for (const [id, amount] of incomeMemberDeltas) memberDeltas.set(id, (memberDeltas.get(id) ?? 0) + amount);

    return { date, items, monthlyCost, delta, memberDeltas };
  });

  let closingBalance = scenario.startingBalance;
  // Mirrors `closingBalance` above, walked backward the same way — each
  // member's own share, seeded from an even split of the starting balance
  // (see project-runway.ts's identical seeding/reasoning).
  const closingMemberBalances = new Map<string, number>(
    householdMemberIds.map((id) => [id, householdMemberIds.length > 0 ? closingBalance / householdMemberIds.length : 0])
  );

  const reversed: RunwayPoint[] = [];
  for (let i = monthData.length - 1; i >= 0; i--) {
    const { date, items, monthlyCost, delta, memberDeltas } = monthData[i];

    let balanceByMember: Record<string, number> | undefined;
    if (householdMemberIds.length > 0) {
      balanceByMember = {};
      for (const id of householdMemberIds) balanceByMember[id] = closingMemberBalances.get(id) ?? 0;
    }

    reversed.push({
      date,
      balance: closingBalance,
      monthlyCost,
      breakdown: {
        inflows: items.filter((it) => it.amount > 0),
        outflows: items.filter((it) => it.amount < 0).map((it) => ({ ...it, amount: -it.amount })),
      },
      balanceByMember,
    });
    closingBalance -= delta;
    for (const id of householdMemberIds) {
      closingMemberBalances.set(id, (closingMemberBalances.get(id) ?? 0) - (memberDeltas.get(id) ?? 0));
    }
  }

  return reversed.reverse();
}
