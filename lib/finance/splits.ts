import type { CommitmentSplit } from "@/lib/types";

/** The fraction (0–1) of a commitment attributable to one household member. */
export function shareForMember(splits: CommitmentSplit[], memberId: string): number {
  const split = splits.find((s) => s.household_member_id === memberId);
  return split ? split.percentage / 100 : 0;
}

/** A commitment's amount, scaled down to one member's share of it. */
export function memberShareOfAmount(
  amount: number,
  splits: CommitmentSplit[],
  memberId: string
): number {
  return amount * shareForMember(splits, memberId);
}

export function splitLabel(
  splits: CommitmentSplit[],
  memberById: Map<string, string>
): string {
  if (splits.length === 0) return "Household";
  if (splits.length === 1) return memberById.get(splits[0].household_member_id) ?? "—";
  return splits
    .map((s) => `${memberById.get(s.household_member_id) ?? "—"} ${s.percentage}%`)
    .join(" · ");
}

export function splitPercentageTotal(splits: { percentage: number }[]): number {
  return splits.reduce((sum, s) => sum + s.percentage, 0);
}
