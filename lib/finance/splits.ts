/** Structural shape shared by CommitmentSplit and PropertySplit — these
 *  helpers work for either without duplicating the split math. */
export type Split = { household_member_id: string; percentage: number };

/** The fraction (0–1) of a commitment (or property) attributable to one household member. */
export function shareForMember(splits: Split[], memberId: string): number {
  const split = splits.find((s) => s.household_member_id === memberId);
  return split ? split.percentage / 100 : 0;
}

/** An amount, scaled down to one member's share of it. */
export function memberShareOfAmount(
  amount: number,
  splits: Split[],
  memberId: string
): number {
  return amount * shareForMember(splits, memberId);
}

export function splitLabel(
  splits: Split[],
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
