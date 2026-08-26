import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { combinedIncomeBreakdown } from "@/lib/finance/income-gross";
import { isActiveOn, firstOfMonth } from "@/lib/finance/date-utils";
import { memberSharesOfAmount } from "@/lib/finance/splits";
import type { TaxProfile } from "@/lib/types";
import type { RunwayPhase, RunwayLineItem } from "./types";

/** A month's line items plus the same amounts prorated per household
 *  member — every euro of `items` lands on exactly one member of
 *  `householdMemberIds` (split-by-percentage where set, evenly divided
 *  where a row has no splits at all), so `memberDeltas`' values always sum
 *  to `items`' own total. Kept separate from `items[].householdMemberId`
 *  (which is only set when a row is unambiguously one person's, for
 *  display) since a 2+-way split has real per-member amounts to preserve
 *  here that the collapsed display line can't carry. */
type MonthlyItemsResult = { items: RunwayLineItem[]; memberDeltas: Map<string, number> };

function addMemberDelta(deltas: Map<string, number>, memberId: string, amount: number) {
  deltas.set(memberId, (deltas.get(memberId) ?? 0) + amount);
}

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
 *  by the same two callers as `monthlyIncomeItems` below. `householdMemberIds`
 *  is the fallback roster for `memberDeltas` (see `MonthlyItemsResult`) — an
 *  unattributed (zero-split) commitment is divided evenly across it. */
export function monthlyCommitmentItems(
  phase: RunwayPhase,
  date: string,
  householdMemberIds: string[] = []
): MonthlyItemsResult {
  const items: RunwayLineItem[] = [];
  const memberDeltas = new Map<string, number>();

  const addCommitment = (c: RunwayPhase["profile"]["commitments"][number], amount: number) => {
    items.push({
      label: c.name,
      amount: -amount,
      householdMemberId: c.splits.length === 1 ? c.splits[0].household_member_id : undefined,
    });
    for (const [memberId, share] of memberSharesOfAmount(-amount, c.splits, householdMemberIds)) {
      addMemberDelta(memberDeltas, memberId, share);
    }
  };

  for (const c of phase.profile.commitments) {
    if (c.frequency === "one_off") {
      if (firstOfMonth(c.start_date) === date) addCommitment(c, c.amount);
      continue;
    }
    if (isActiveOn(c.start_date, c.end_date, date)) {
      addCommitment(c, toMonthlyEquivalent(c.amount, c.frequency));
    }
  }
  return { items, memberDeltas };
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
  year: number,
  householdMemberIds: string[] = []
): MonthlyItemsResult {
  const activeRows = phase.profile.income.filter((i) => isActiveOn(i.start_date, i.end_date, date));
  const splitsByRow = new Map(activeRows.map((i) => [i.id, i.splits]));
  const shares = combinedIncomeBreakdown(activeRows, (id) => splitsByRow.get(id) ?? [], taxProfileByMember, year);

  const sharesByRow = new Map<string, typeof shares>();
  for (const share of shares) {
    sharesByRow.set(share.incomeId, [...(sharesByRow.get(share.incomeId) ?? []), share]);
  }

  const items: RunwayLineItem[] = [];
  const memberDeltas = new Map<string, number>();
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
      const shareNet = share.net ? share.net.recurringMonthlyNet : share.gross.recurringMonthlyGross;
      net += shareNet;
      gross += share.gross.recurringMonthlyGross;
      if (share.householdMemberId) memberIds.add(share.householdMemberId);

      // Per-share, not per-row: a row split across 2+ people has real
      // per-member amounts here that the merged `items` line below can't
      // carry — an empty-string householdMemberId (combinedIncomeBreakdown's
      // "unattributed, zero-split row" marker) divides evenly instead.
      if (shareNet !== 0) {
        const splitsForShare = share.householdMemberId
          ? [{ household_member_id: share.householdMemberId, percentage: 100 }]
          : [];
        for (const [memberId, amount] of memberSharesOfAmount(shareNet, splitsForShare, householdMemberIds)) {
          addMemberDelta(memberDeltas, memberId, amount);
        }
      }
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
  return { items, memberDeltas };
}
