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

/** Full per-member breakdown of an amount: each split's own percentage
 *  share, or (when there are no splits at all — a general household item
 *  with no owner) an even share across `fallbackMemberIds`. Unlike
 *  `memberShareOfAmount`'s single-member lookup, this always accounts for
 *  the whole amount — every euro lands on exactly one household member —
 *  which is what a per-person running balance needs. */
export function memberSharesOfAmount(
  amount: number,
  splits: Split[],
  fallbackMemberIds: string[]
): Map<string, number> {
  const shares = new Map<string, number>();
  if (splits.length > 0) {
    for (const s of splits) {
      shares.set(s.household_member_id, (shares.get(s.household_member_id) ?? 0) + amount * (s.percentage / 100));
    }
  } else if (fallbackMemberIds.length > 0) {
    const even = amount / fallbackMemberIds.length;
    for (const id of fallbackMemberIds) shares.set(id, (shares.get(id) ?? 0) + even);
  }
  return shares;
}
