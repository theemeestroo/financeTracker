import type {
  AccrualFrequency,
  Frequency,
  SavingsAllocationType,
  ScenarioEventType,
  ScenarioItemScope,
  SeveranceGlobalEventOverride,
  SeveranceGlobalSavingsRuleOverride,
  SeveranceScenarioEvent,
  SeveranceScenarioSavingsRule,
} from "@/lib/types";

/**
 * One scenario's merged view of an event — scenario-scoped rows as-is, plus
 * every applicable global event with its scenario-local override (if any)
 * already applied. Shared by the runway projection (`resolve-scenario.ts`)
 * and the scenario detail page's own display table, so the two can never
 * disagree about which events apply or at what amount — same "single source
 * of truth" reasoning `resolveSavingsPrincipal` already documents for
 * savings rules.
 */
export type MergedScenarioEvent = {
  id: string;
  scope: ScenarioItemScope;
  name: string;
  event_type: ScenarioEventType;
  date: string;
  amount: number | null;
  recurring_gross_amount: number | null;
  recurring_frequency: Frequency | null;
  recurring_tax_profile_id: string | null;
  recurring_end_date: string | null;
  /** True when a scenario-local override supplied the amount above (only
   *  possible for scope="global" rows). */
  isOverridden: boolean;
};

/**
 * Merges this scenario's own events with every global event that still
 * applies to it. A global event is dropped entirely when its override for
 * this scenario has `suppressed = true` — set by "duplicate into this
 * scenario", which gives the scenario its own independent scope="scenario"
 * copy instead, so the global row would otherwise double-count it.
 */
export function mergeScenarioEvents(
  scenarioEvents: SeveranceScenarioEvent[],
  globalEvents: SeveranceScenarioEvent[],
  overrides: SeveranceGlobalEventOverride[]
): MergedScenarioEvent[] {
  const overrideByGlobalId = new Map(overrides.map((o) => [o.global_event_id, o]));

  const scenarioMerged: MergedScenarioEvent[] = scenarioEvents.map((e) => ({
    id: e.id,
    scope: "scenario",
    name: e.name,
    event_type: e.event_type,
    date: e.date,
    amount: e.amount,
    recurring_gross_amount: e.recurring_gross_amount,
    recurring_frequency: e.recurring_frequency,
    recurring_tax_profile_id: e.recurring_tax_profile_id,
    recurring_end_date: e.recurring_end_date,
    isOverridden: false,
  }));

  const globalMerged: MergedScenarioEvent[] = globalEvents.flatMap((e) => {
    const override = overrideByGlobalId.get(e.id);
    if (override?.suppressed) return [];
    const isOverridden = override?.value != null;
    const recurring = e.event_type === "recurring_income_start";
    return [
      {
        id: e.id,
        scope: "global",
        name: e.name,
        event_type: e.event_type,
        date: e.date,
        amount: !recurring && isOverridden ? override!.value : e.amount,
        recurring_gross_amount: recurring && isOverridden ? override!.value : e.recurring_gross_amount,
        recurring_frequency: e.recurring_frequency,
        recurring_tax_profile_id: e.recurring_tax_profile_id,
        recurring_end_date: e.recurring_end_date,
        isOverridden,
      },
    ];
  });

  return [...scenarioMerged, ...globalMerged];
}

/**
 * One scenario's merged view of a savings rule — mirrors `MergedScenarioEvent`
 * above. `packageId` is always resolved to *this scenario's own* package:
 * for a scope="scenario" row that's just its own `package_id`; for a
 * scope="global" row it's whichever package this scenario has for the
 * rule's `household_member_id` (a package is inherently scenario-specific —
 * see the migration's own comment) — the caller supplies that lookup so
 * every consumer downstream (`resolveSavingsPrincipal`, the headroom
 * display) can keep treating every rule uniformly by package.
 */
export type MergedSavingsRule = {
  id: string;
  scope: ScenarioItemScope;
  name: string;
  allocation_type: SavingsAllocationType;
  amount: number | null;
  percentage: number | null;
  annual_return_pct: number;
  accrual_frequency: AccrualFrequency;
  packageId: string;
  isOverridden: boolean;
};

/**
 * Merges this scenario's own savings rules with every global rule that
 * still applies to it. A global rule is dropped when this scenario has no
 * package for its household member yet (nothing to allocate from here —
 * same "orphaned rule" skip the projection already did before global rules
 * existed) or when suppressed by a "duplicate into this scenario" override,
 * same reasoning as `mergeScenarioEvents`.
 */
export function mergeScenarioSavingsRules(
  scenarioRules: SeveranceScenarioSavingsRule[],
  globalRules: SeveranceScenarioSavingsRule[],
  overrides: SeveranceGlobalSavingsRuleOverride[],
  packageIdByMember: Map<string, string>
): MergedSavingsRule[] {
  const overrideByGlobalId = new Map(overrides.map((o) => [o.global_rule_id, o]));

  const scenarioMerged: MergedSavingsRule[] = scenarioRules.map((r) => ({
    id: r.id,
    scope: "scenario",
    name: r.name,
    allocation_type: r.allocation_type,
    amount: r.amount,
    percentage: r.percentage,
    annual_return_pct: r.annual_return_pct,
    accrual_frequency: r.accrual_frequency,
    packageId: r.package_id!,
    isOverridden: false,
  }));

  const globalMerged: MergedSavingsRule[] = globalRules.flatMap((r) => {
    const packageId = packageIdByMember.get(r.household_member_id!);
    if (!packageId) return [];
    const override = overrideByGlobalId.get(r.id);
    if (override?.suppressed) return [];
    const isOverridden = override?.value != null;
    const isPercentage = r.allocation_type === "percentage";
    return [
      {
        id: r.id,
        scope: "global",
        name: r.name,
        allocation_type: r.allocation_type,
        amount: !isPercentage && isOverridden ? override!.value : r.amount,
        percentage: isPercentage && isOverridden ? override!.value : r.percentage,
        annual_return_pct: r.annual_return_pct,
        accrual_frequency: r.accrual_frequency,
        packageId,
        isOverridden,
      },
    ];
  });

  return [...scenarioMerged, ...globalMerged];
}
