import type { Commitment, HouseholdMember } from "@/lib/types";

/** Any date before every commitment in this app — a synthesized "always
 *  active unless cut off" start_date, since Commitment.start_date isn't
 *  nullable. The exact value doesn't matter, only that it's early. */
const ALWAYS_ACTIVE_FROM = "2000-01-01";

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
 * These are **never persisted and never shown in the Commitments page's own
 * table** — a synthetic row can't honestly offer that table's edit/delete
 * affordances. They exist only to be folded into aggregate totals and
 * category breakdowns (the Overview dashboard; severance-scenario phases
 * via `resolve-scenario.ts`), always under the "insurance" category and
 * always essential (this is not a discretionary cost a sensitivity panel
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
      id: `health-insurance-${m.id}`,
      profile_id: profileId,
      name: `${m.name} — private health insurance`,
      category: "insurance" as const,
      amount: m.private_health_insurance_monthly_premium!,
      frequency: "monthly" as const,
      essential: true,
      start_date: ALWAYS_ACTIVE_FROM,
      end_date: cutoffByMember?.get(m.id) ?? null,
      property_id: null,
    }));
}
