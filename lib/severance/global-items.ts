import type {
  AccrualFrequency,
  Frequency,
  SavingsAllocationType,
  ScenarioEventType,
  ScenarioItemScope,
  SeveranceGlobalEventOverride,
  SeveranceGlobalPhaseOverride,
  SeveranceGlobalPropertyEndOverride,
  SeveranceGlobalSavingsRuleOverride,
  SeveranceScenarioEvent,
  SeveranceScenarioPhase,
  SeveranceScenarioPropertyEnd,
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
 * One scenario's merged view of a property end — mirrors `MergedScenarioEvent`
 * above, superseding `end_date` (a date, not a numeric amount) via a
 * scenario-local override instead. When both a scenario-scoped and an
 * (unsuppressed) global row exist for the *same* `property_id` — possible
 * since the two are independent rows, not usually expected together outside
 * "duplicate into this scenario" (which suppresses the global row) — the
 * caller (`resolve-scenario.ts`, the scenario detail page) prefers the
 * scenario-scoped row when collapsing this list down to one end date per
 * property, same "more specific wins" reasoning as everywhere else scope
 * layers.
 */
export type MergedPropertyEnd = {
  id: string;
  scope: ScenarioItemScope;
  property_id: string;
  end_date: string;
  isOverridden: boolean;
};

/**
 * Merges this scenario's own property-ends with every global property-end
 * that still applies to it. A global row is dropped entirely when its
 * override for this scenario has `suppressed = true`, same reasoning as
 * `mergeScenarioEvents`.
 */
export function mergeScenarioPropertyEnds(
  scenarioPropertyEnds: SeveranceScenarioPropertyEnd[],
  globalPropertyEnds: SeveranceScenarioPropertyEnd[],
  overrides: SeveranceGlobalPropertyEndOverride[]
): MergedPropertyEnd[] {
  const overrideByGlobalId = new Map(overrides.map((o) => [o.global_property_end_id, o]));

  const scenarioMerged: MergedPropertyEnd[] = scenarioPropertyEnds.map((pe) => ({
    id: pe.id,
    scope: "scenario",
    property_id: pe.property_id,
    end_date: pe.end_date,
    isOverridden: false,
  }));

  const globalMerged: MergedPropertyEnd[] = globalPropertyEnds.flatMap((pe) => {
    const override = overrideByGlobalId.get(pe.id);
    if (override?.suppressed) return [];
    const isOverridden = override?.end_date != null;
    return [
      {
        id: pe.id,
        scope: "global",
        property_id: pe.property_id,
        end_date: isOverridden ? override!.end_date! : pe.end_date,
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

/**
 * One scenario's merged view of a cost phase — mirrors `MergedPropertyEnd`
 * above, but supersedes `profile_id` instead of `end_date`. `start_date`/
 * `label` are never overridden (a deliberate product decision, not a
 * technical limitation — the trigger date always stays the global phase's
 * own), so unlike the other three merge functions there's no "which field is
 * overridable" branch — it's always `profile_id`.
 */
export type MergedPhase = {
  id: string;
  scope: ScenarioItemScope;
  profile_id: string;
  start_date: string;
  label: string | null;
  isOverridden: boolean;
};

/**
 * Merges this scenario's own cost phases with every global phase that still
 * applies to it. A global row is dropped entirely when its override for this
 * scenario has `suppressed = true`, same reasoning as `mergeScenarioEvents`.
 */
export function mergePhases(
  scenarioPhases: SeveranceScenarioPhase[],
  globalPhases: SeveranceScenarioPhase[],
  overrides: SeveranceGlobalPhaseOverride[]
): MergedPhase[] {
  const overrideByGlobalId = new Map(overrides.map((o) => [o.global_phase_id, o]));

  const scenarioMerged: MergedPhase[] = scenarioPhases.map((p) => ({
    id: p.id,
    scope: "scenario",
    profile_id: p.profile_id,
    start_date: p.start_date,
    label: p.label,
    isOverridden: false,
  }));

  const globalMerged: MergedPhase[] = globalPhases.flatMap((p) => {
    const override = overrideByGlobalId.get(p.id);
    if (override?.suppressed) return [];
    const isOverridden = override?.profile_id != null;
    return [
      {
        id: p.id,
        scope: "global",
        profile_id: isOverridden ? override!.profile_id! : p.profile_id,
        start_date: p.start_date,
        label: p.label,
        isOverridden,
      },
    ];
  });

  return [...scenarioMerged, ...globalMerged];
}
