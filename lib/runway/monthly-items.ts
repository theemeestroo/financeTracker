import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { combinedIncomeBreakdown } from "@/lib/finance/income-gross";
import { isActiveOn, firstOfMonth } from "@/lib/finance/date-utils";
import type { TaxProfile } from "@/lib/types";
import type { RunwayPhase, RunwayLineItem } from "./types";

/** Whichever phase's `startDate` is the most recent one at or before
 *  `date` — a wholesale profile swap, not an incremental diff. Shared by
 *  the real month-by-month projection (`project-runway.ts`) and the
 *  preceding-months backfill (`preceding-months.ts`), so both pick the
 *  same phase for the same date. */
export function activeProfileFor(date: string, phases: RunwayPhase[]): RunwayPhase {
  let active = phases[0];
  for (const phase of phases) {
    if (phase.startDate <= date) active = phase;
    else break;
  }
  return active;
}

/** That month's commitment spend for one profile, as signed (negative) line
 *  items — recurring-equivalent plus any one-off landing this month. Shared
 *  by the same two callers as `monthlyIncomeItems` below. */
export function monthlyCommitmentItems(phase: RunwayPhase, date: string): RunwayLineItem[] {
  const items: RunwayLineItem[] = [];
  for (const c of phase.profile.commitments) {
    if (c.frequency === "one_off") {
      if (firstOfMonth(c.start_date) === date) items.push({ label: c.name, amount: -c.amount });
      continue;
    }
    if (isActiveOn(c.start_date, c.end_date, date)) {
      items.push({ label: c.name, amount: -toMonthlyEquivalent(c.amount, c.frequency) });
    }
  }
  return items;
}

/** That month's net income for one profile, per split share, as signed
 *  (positive) line items — split shares of the same income row are merged
 *  back into one item (the breakdown panel is household-level, not
 *  per-person), but every row/share is netted together via
 *  `combinedIncomeBreakdown` first: a person's rental income (say) shares
 *  their salary's actual tax position for the month instead of getting its
 *  own fresh allowance, which understated the tax it owed. `householdMemberId`
 *  is only attached when a row has exactly one contributing person — a row
 *  split across 2+ people keeps its merged net/gross totals but is left
 *  unattributed for the annual tax summary (lib/tax/annual-tax-summary.ts),
 *  which needs one owner per line to be meaningful. */
export function monthlyIncomeItems(
  phase: RunwayPhase,
  date: string,
  taxProfileByMember: Map<string, TaxProfile>,
  year: number
): RunwayLineItem[] {
  const activeRows = phase.profile.income.filter((i) => isActiveOn(i.start_date, i.end_date, date));
  const splitsByRow = new Map(activeRows.map((i) => [i.id, i.splits]));
  const shares = combinedIncomeBreakdown(activeRows, (id) => splitsByRow.get(id) ?? [], taxProfileByMember, year);

  const sharesByRow = new Map<string, typeof shares>();
  for (const share of shares) {
    sharesByRow.set(share.incomeId, [...(sharesByRow.get(share.incomeId) ?? []), share]);
  }

  const items: RunwayLineItem[] = [];
  for (const i of activeRows) {
    // Recurring-only, same as the dashboard: a one-time annual bonus isn't
    // timed to a specific month in this data model, so it's deliberately
    // excluded from the month-by-month projection rather than guessed at.
    let net = 0;
    let gross = 0;
    const memberIds = new Set<string>();
    for (const share of sharesByRow.get(i.id) ?? []) {
      // No tax profile yet (or unattributed, zero-split income) — gross
      // fallback, same as the dashboard's documented gap. Unlike the
      // dashboard's totals, the runway never silently drops real cash flow.
      net += share.net ? share.net.recurringMonthlyNet : share.gross.recurringMonthlyGross;
      gross += share.gross.recurringMonthlyGross;
      if (share.householdMemberId) memberIds.add(share.householdMemberId);
    }
    if (net !== 0) {
      items.push({
        label: i.name,
        amount: net,
        householdMemberId: memberIds.size === 1 ? [...memberIds][0] : undefined,
        grossAmount: gross,
      });
    }
  }
  return items;
}
