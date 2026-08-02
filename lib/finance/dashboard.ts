import { toMonthlyEquivalent } from "./frequency";
import { isActiveOn } from "./date-utils";
import { incomeGrossBreakdown, combinedNetBreakdownByRow, combinedIncomeBreakdown } from "./income-gross";
import type { Split } from "./splits";
import {
  COMMITMENT_CATEGORIES,
  INCOME_TYPES,
  type Commitment,
  type CommitmentCategory,
  type HouseholdMember,
  type Income,
  type IncomeType,
  type TaxProfile,
} from "@/lib/types";

export function activeCommitments(commitments: Commitment[], onDate: string): Commitment[] {
  return commitments.filter((c) => isActiveOn(c.start_date, c.end_date, onDate));
}

export function activeIncome(income: Income[], onDate: string): Income[] {
  return income.filter((i) => isActiveOn(i.start_date, i.end_date, onDate));
}

export function totalMonthlyCommitments(commitments: Commitment[]): number {
  return commitments.reduce((sum, c) => sum + toMonthlyEquivalent(c.amount, c.frequency), 0);
}

export function totalMonthlyIncome(income: Income[]): number {
  return income.reduce((sum, i) => sum + incomeGrossBreakdown(i).recurringMonthlyGross, 0);
}

export type NetIncomeTotals = {
  netMonthly: number;
  missingProfileCount: number;
};

/**
 * Nets each income row per split share, combined per person via that
 * person's own tax profile (lib/finance/income-gross.ts's
 * `combinedNetBreakdownByRow`). Shares whose member has no tax profile
 * yet — or a row with no split at all
 * (household/unattributed income, no one to tax) — are excluded from the
 * total (not approximated as gross) and counted in `missingProfileCount`
 * so the UI can flag it — silently mixing gross and net would make the
 * headline number wrong in a way that's not visible.
 *
 * This is the *recurring* monthly figure — a salary row's one-time annual
 * bonus (see lib/finance/income-gross.ts) is deliberately excluded so a
 * December Christmas bonus doesn't inflate every month's steady-state
 * surplus/deficit or burn-rate figure.
 */
export function totalMonthlyNetIncome(
  income: Income[],
  splitsByIncome: Map<string, Split[]>,
  taxProfileByMember: Map<string, TaxProfile>,
  year: number
): NetIncomeTotals {
  let netMonthly = 0;
  let missingProfileCount = 0;

  const byRow = combinedNetBreakdownByRow(
    income,
    (id) => splitsByIncome.get(id) ?? [],
    taxProfileByMember,
    year
  );
  for (const { net, missingShares } of byRow.values()) {
    netMonthly += net.recurringMonthlyNet;
    missingProfileCount += missingShares;
  }

  return { netMonthly, missingProfileCount };
}

export type CategoryBreakdownLineItem = {
  name: string;
  monthly: number;
};

export type CategoryBreakdownEntry = {
  category: CommitmentCategory;
  label: string;
  monthly: number;
  /** The individual commitments behind `monthly`, sorted descending — the
   *  detail behind a chart tooltip. Each line is weighted the same way as
   *  the total (e.g. prorated to one member's split share when `weightFn`
   *  does that), so the lines always sum to `monthly`. */
  lines: CategoryBreakdownLineItem[];
};

/**
 * Category breakdown by monthly-equivalent amount. `weightFn` lets a caller
 * prorate each commitment (e.g. to one household member's split share)
 * instead of counting its full amount — defaults to the full amount.
 */
export function categoryBreakdown(
  commitments: Commitment[],
  weightFn: (commitment: Commitment) => number = (c) => toMonthlyEquivalent(c.amount, c.frequency)
): CategoryBreakdownEntry[] {
  const byCategory = new Map<CommitmentCategory, number>();
  const linesByCategory = new Map<CommitmentCategory, CategoryBreakdownLineItem[]>();
  for (const c of commitments) {
    const monthly = weightFn(c);
    if (monthly <= 0) continue;
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + monthly);
    const lines = linesByCategory.get(c.category) ?? [];
    lines.push({ name: c.name, monthly });
    linesByCategory.set(c.category, lines);
  }

  return COMMITMENT_CATEGORIES.map((c) => ({
    category: c.value,
    label: c.label,
    monthly: byCategory.get(c.value) ?? 0,
    lines: (linesByCategory.get(c.value) ?? []).sort((a, b) => b.monthly - a.monthly),
  }))
    .filter((entry) => entry.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
}

export type IncomeTypeBreakdownEntry = {
  type: IncomeType;
  label: string;
  monthly: number;
};

export type IncomePersonBreakdownEntry = {
  householdMemberId: string;
  name: string;
  monthly: number;
};

export type IncomeSummary = {
  /** Matches totalMonthlyNetIncome's netMonthly for the same inputs. */
  total: number;
  /** Fixed IncomeType declaration order, not sorted-by-size — a type's
   *  color mapping in the UI (one of the four categorical series hues)
   *  stays stable across renders/reloads. */
  byType: IncomeTypeBreakdownEntry[];
  /** Sorted descending. Left to the caller to decide whether a single
   *  earner makes this worth rendering at all. */
  byPerson: IncomePersonBreakdownEntry[];
};

/**
 * Net-monthly income summarized by IncomeType and by household member in
 * one pass, via lib/finance/income-gross.ts's `combinedIncomeBreakdown`.
 * Same net-only convention as totalMonthlyNetIncome above: a split share
 * with no tax profile yet, or a whole unattributed (zero-split) row,
 * contributes 0 rather than an unlabeled gross approximation — there's no
 * one to tax, and no one to attribute the amount to in `byPerson` either.
 */
export function incomeSummary(
  income: Income[],
  splitsByIncome: Map<string, Split[]>,
  taxProfileByMember: Map<string, TaxProfile>,
  memberById: Map<string, HouseholdMember>,
  year: number
): IncomeSummary {
  const byType = new Map<IncomeType, number>();
  const byPerson = new Map<string, number>();
  let total = 0;

  const typeByIncomeId = new Map(income.map((i) => [i.id, i.type]));
  const shares = combinedIncomeBreakdown(income, (id) => splitsByIncome.get(id) ?? [], taxProfileByMember, year);
  for (const share of shares) {
    if (!share.net) continue;
    const amount = share.net.recurringMonthlyNet;
    total += amount;
    const type = typeByIncomeId.get(share.incomeId);
    if (type) byType.set(type, (byType.get(type) ?? 0) + amount);
    if (share.householdMemberId) {
      byPerson.set(share.householdMemberId, (byPerson.get(share.householdMemberId) ?? 0) + amount);
    }
  }

  return {
    total,
    byType: INCOME_TYPES.map((t) => ({
      type: t.value,
      label: t.label,
      monthly: byType.get(t.value) ?? 0,
    })).filter((entry) => entry.monthly > 0),
    byPerson: Array.from(byPerson.entries())
      .map(([householdMemberId, monthly]) => ({
        householdMemberId,
        name: memberById.get(householdMemberId)?.name ?? "—",
        monthly,
      }))
      .filter((entry) => entry.monthly > 0)
      .sort((a, b) => b.monthly - a.monthly),
  };
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
