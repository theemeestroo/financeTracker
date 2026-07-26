import { toMonthlyEquivalent } from "./frequency";
import { isActiveOn } from "./date-utils";
import { incomeGrossBreakdown, incomeNetBreakdown } from "./income-gross";
import {
  COMMITMENT_CATEGORIES,
  type Commitment,
  type CommitmentCategory,
  type Income,
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
 * Nets each income row via its household member's tax profile. Rows whose
 * member has no tax profile yet are excluded from the total (not
 * approximated as gross) and counted in `missingProfileCount` so the UI can
 * flag it — silently mixing gross and net would make the headline number
 * wrong in a way that's not visible.
 *
 * This is the *recurring* monthly figure — a salary row's one-time annual
 * bonus (see lib/finance/income-gross.ts) is deliberately excluded so a
 * December Christmas bonus doesn't inflate every month's steady-state
 * surplus/deficit or burn-rate figure.
 */
export function totalMonthlyNetIncome(
  income: Income[],
  taxProfileByMember: Map<string, TaxProfile>,
  year: number
): NetIncomeTotals {
  let netMonthly = 0;
  let missingProfileCount = 0;

  for (const i of income) {
    const profile = taxProfileByMember.get(i.household_member_id);
    if (!profile) {
      missingProfileCount += 1;
      continue;
    }
    netMonthly += incomeNetBreakdown(i, profile, year).recurringMonthlyNet;
  }

  return { netMonthly, missingProfileCount };
}

export type CategoryBreakdownEntry = {
  category: CommitmentCategory;
  label: string;
  monthly: number;
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
  for (const c of commitments) {
    const monthly = weightFn(c);
    if (monthly <= 0) continue;
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + monthly);
  }

  return COMMITMENT_CATEGORIES.map((c) => ({
    category: c.value,
    label: c.label,
    monthly: byCategory.get(c.value) ?? 0,
  }))
    .filter((entry) => entry.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
