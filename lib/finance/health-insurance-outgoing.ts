import type { Commitment, HouseholdMember } from "@/lib/types";

/** Any date before every commitment in this app — a synthesized "always
 *  active unless cut off" start_date, since Commitment.start_date isn't
 *  nullable. The exact value doesn't matter, only that it's early. */
const ALWAYS_ACTIVE_FROM = "2000-01-01";

/** These virtual rows have no backing `commitment_splits` row (see the
 *  function doc below) — the id itself is the only record of which member
 *  it belongs to, so the prefix is factored out here rather than
 *  duplicated wherever a caller needs to recover that member. */
const ID_PREFIX = "health-insurance-";

/**
 * Synthesizes a "private health insurance" commitment for every household
 * member who is privately insured, has a premium set, and hasn't opted out
 * (`count_private_health_insurance_as_outgoing`) — see
 * `lib/tax/social-contributions.ts` and
 * `lib/unemployment/health-coverage.ts` for why nothing else in this app
 * charges this cost during ordinary employment: the employer subsidy
 * already shows up as extra net pay, so without this the household's net
 * income silently runs high with no corresponding outgoing anywhere.
 *
 * These are **never persisted** — the Commitments page (`app/(app)/commitments/page.tsx`)
 * folds them into its own rows read-only, badged "Auto — from Household" and
 * linking to the household member's edit page instead of offering this
 * table's normal edit/delete affordances, since a synthetic row has no
 * backing DB row to edit or delete. They're also folded into aggregate
 * totals and category breakdowns (the Overview dashboard; severance-scenario
 * phases via `resolve-scenario.ts`), always under the "insurance" category
 * and always essential (this is not a discretionary cost a sensitivity panel
 * should ever suggest cutting).
 *
 * `cutoffByMember` lets a caller end-date one specific member's synthetic
 * commitment so their own post-employment health-insurance regime
 * (`lib/unemployment/health-coverage.ts`'s "gap"/"alg1", applied from
 * `gardenLeaveEndDate`) takes over instead, without double-charging the
 * same month twice — same convention as `resolve-scenario.ts`'s
 * `salaryCutoffByMember`: the map's value is used directly as `end_date`,
 * so the caller is responsible for already subtracting the one day (e.g.
 * `addDays(gardenLeaveEndDate, -1)`). Omitted (or a member absent from the
 * map) means the cost is simply ongoing — the common case outside a
 * severance scenario, and for any household member the scenario doesn't
 * cover.
 */
export function healthInsuranceOutgoings(
  members: HouseholdMember[],
  profileId: string,
  cutoffByMember?: Map<string, string>
): Commitment[] {
  return members
    .filter(
      (m) =>
        !m.statutory_health_insurance &&
        m.count_private_health_insurance_as_outgoing &&
        (m.private_health_insurance_monthly_premium ?? 0) > 0
    )
    .map((m) => ({
      id: `${ID_PREFIX}${m.id}`,
      profile_id: profileId,
      name: `${m.name} — private health insurance`,
      category: "insurance" as const,
      amount: m.private_health_insurance_monthly_premium!,
      frequency: "monthly" as const,
      essential: true,
      start_date: ALWAYS_ACTIVE_FROM,
      end_date: cutoffByMember?.get(m.id) ?? null,
      property_id: null,
      baseline_amount: null,
    }));
}

/** The household member a synthetic commitment from `healthInsuranceOutgoings`
 *  belongs to — every row is one specific member's own premium, but (being
 *  unpersisted) it has no `commitment_splits` row to look that up from, so
 *  callers that need per-member attribution (the runway projection's
 *  per-person balance) recover it from the id's own convention instead. */
export function healthInsuranceOutgoingMemberId(commitmentId: string): string {
  return commitmentId.slice(ID_PREFIX.length);
}
