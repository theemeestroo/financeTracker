import { describe, expect, it } from "vitest";
import { mergeScenarioEvents, mergeScenarioPropertyEnds, mergeScenarioSavingsRules } from "./global-items";
import type {
  SeveranceGlobalEventOverride,
  SeveranceGlobalPropertyEndOverride,
  SeveranceGlobalSavingsRuleOverride,
  SeveranceScenarioEvent,
  SeveranceScenarioPropertyEnd,
  SeveranceScenarioSavingsRule,
} from "@/lib/types";

function scenarioEvent(overrides: Partial<SeveranceScenarioEvent> = {}): SeveranceScenarioEvent {
  return {
    id: "e-scenario",
    scope: "scenario",
    scenario_id: "s1",
    name: "Scenario-only event",
    event_type: "one_off_outflow",
    amount: 500,
    date: "2027-01-01",
    recurring_gross_amount: null,
    recurring_frequency: null,
    recurring_tax_profile_id: null,
    recurring_end_date: null,
    ...overrides,
  };
}

function globalEvent(overrides: Partial<SeveranceScenarioEvent> = {}): SeveranceScenarioEvent {
  return {
    id: "e-global",
    scope: "global",
    scenario_id: null,
    name: "Global event",
    event_type: "one_off_outflow",
    amount: 1000,
    date: "2027-02-01",
    recurring_gross_amount: null,
    recurring_frequency: null,
    recurring_tax_profile_id: null,
    recurring_end_date: null,
    ...overrides,
  };
}

function eventOverride(overrides: Partial<SeveranceGlobalEventOverride> = {}): SeveranceGlobalEventOverride {
  return {
    id: "o1",
    global_event_id: "e-global",
    scenario_id: "s1",
    value: null,
    suppressed: false,
    orphaned_item_name: null,
    stale_since: null,
    ...overrides,
  };
}

describe("mergeScenarioEvents", () => {
  it("includes every scenario-scoped event unchanged", () => {
    const merged = mergeScenarioEvents([scenarioEvent()], [], []);
    expect(merged).toEqual([expect.objectContaining({ id: "e-scenario", scope: "scenario", amount: 500 })]);
  });

  it("includes a global event with its own default amount when there's no override", () => {
    const merged = mergeScenarioEvents([], [globalEvent()], []);
    expect(merged).toEqual([
      expect.objectContaining({ id: "e-global", scope: "global", amount: 1000, isOverridden: false }),
    ]);
  });

  it("applies a scenario's override onto a one-off event's amount", () => {
    const merged = mergeScenarioEvents([], [globalEvent()], [eventOverride({ value: 250 })]);
    expect(merged[0]).toEqual(expect.objectContaining({ amount: 250, isOverridden: true }));
  });

  it("applies a scenario's override onto a recurring event's recurring_gross_amount, not amount", () => {
    const recurring = globalEvent({
      event_type: "recurring_income_start",
      amount: null,
      recurring_gross_amount: 3000,
    });
    const merged = mergeScenarioEvents([], [recurring], [eventOverride({ value: 3500 })]);
    expect(merged[0]).toEqual(
      expect.objectContaining({ recurring_gross_amount: 3500, amount: null, isOverridden: true })
    );
  });

  it("drops a suppressed global event entirely (superseded by a scenario-local duplicate)", () => {
    const merged = mergeScenarioEvents([], [globalEvent()], [eventOverride({ suppressed: true, value: null })]);
    expect(merged).toEqual([]);
  });

  it("leaves an override for a different scenario alone (id-keyed, not scenario-keyed)", () => {
    // The override rows a caller passes in are already scenario-scoped by
    // its own query — this just confirms the merge trusts the caller's
    // filtering rather than re-filtering by scenario_id itself.
    const merged = mergeScenarioEvents([], [globalEvent()], [eventOverride({ scenario_id: "other-scenario" })]);
    expect(merged[0].isOverridden).toBe(false);
  });
});

function scenarioPropertyEnd(
  overrides: Partial<SeveranceScenarioPropertyEnd> = {}
): SeveranceScenarioPropertyEnd {
  return {
    id: "pe-scenario",
    scope: "scenario",
    scenario_id: "s1",
    property_id: "prop-1",
    end_date: "2027-01-01",
    ...overrides,
  };
}

function globalPropertyEnd(overrides: Partial<SeveranceScenarioPropertyEnd> = {}): SeveranceScenarioPropertyEnd {
  return {
    id: "pe-global",
    scope: "global",
    scenario_id: null,
    property_id: "prop-2",
    end_date: "2027-02-01",
    ...overrides,
  };
}

function propertyEndOverride(
  overrides: Partial<SeveranceGlobalPropertyEndOverride> = {}
): SeveranceGlobalPropertyEndOverride {
  return {
    id: "o1",
    global_property_end_id: "pe-global",
    scenario_id: "s1",
    end_date: null,
    suppressed: false,
    orphaned_item_name: null,
    stale_since: null,
    ...overrides,
  };
}

describe("mergeScenarioPropertyEnds", () => {
  it("includes every scenario-scoped property end unchanged", () => {
    const merged = mergeScenarioPropertyEnds([scenarioPropertyEnd()], [], []);
    expect(merged).toEqual([
      expect.objectContaining({ id: "pe-scenario", scope: "scenario", end_date: "2027-01-01" }),
    ]);
  });

  it("includes a global property end with its own default end_date when there's no override", () => {
    const merged = mergeScenarioPropertyEnds([], [globalPropertyEnd()], []);
    expect(merged).toEqual([
      expect.objectContaining({ id: "pe-global", scope: "global", end_date: "2027-02-01", isOverridden: false }),
    ]);
  });

  it("applies a scenario's override onto the end_date", () => {
    const merged = mergeScenarioPropertyEnds(
      [],
      [globalPropertyEnd()],
      [propertyEndOverride({ end_date: "2028-06-01" })]
    );
    expect(merged[0]).toEqual(expect.objectContaining({ end_date: "2028-06-01", isOverridden: true }));
  });

  it("drops a suppressed global property end entirely (superseded by a scenario-local duplicate)", () => {
    const merged = mergeScenarioPropertyEnds(
      [],
      [globalPropertyEnd()],
      [propertyEndOverride({ suppressed: true, end_date: null })]
    );
    expect(merged).toEqual([]);
  });

  it("leaves an override for a different scenario alone (id-keyed, not scenario-keyed)", () => {
    const merged = mergeScenarioPropertyEnds(
      [],
      [globalPropertyEnd()],
      [propertyEndOverride({ scenario_id: "other-scenario" })]
    );
    expect(merged[0].isOverridden).toBe(false);
  });
});

function scenarioRule(overrides: Partial<SeveranceScenarioSavingsRule> = {}): SeveranceScenarioSavingsRule {
  return {
    id: "r-scenario",
    scope: "scenario",
    scenario_id: "s1",
    package_id: "pkg-1",
    household_member_id: null,
    name: "Scenario rule",
    allocation_type: "amount",
    amount: 5000,
    percentage: null,
    annual_return_pct: 5,
    accrual_frequency: "monthly",
    ...overrides,
  };
}

function globalRule(overrides: Partial<SeveranceScenarioSavingsRule> = {}): SeveranceScenarioSavingsRule {
  return {
    id: "r-global",
    scope: "global",
    scenario_id: null,
    package_id: null,
    household_member_id: "alice",
    name: "Global rule",
    allocation_type: "percentage",
    amount: null,
    percentage: 20,
    annual_return_pct: 5,
    accrual_frequency: "monthly",
    ...overrides,
  };
}

function ruleOverride(
  overrides: Partial<SeveranceGlobalSavingsRuleOverride> = {}
): SeveranceGlobalSavingsRuleOverride {
  return {
    id: "o1",
    global_rule_id: "r-global",
    scenario_id: "s1",
    value: null,
    suppressed: false,
    orphaned_item_name: null,
    stale_since: null,
    ...overrides,
  };
}

describe("mergeScenarioSavingsRules", () => {
  it("includes every scenario-scoped rule with its own package_id as packageId", () => {
    const merged = mergeScenarioSavingsRules([scenarioRule()], [], [], new Map());
    expect(merged).toEqual([expect.objectContaining({ id: "r-scenario", packageId: "pkg-1", scope: "scenario" })]);
  });

  it("resolves a global rule against the scenario's own package for that household member", () => {
    const packageIdByMember = new Map([["alice", "pkg-in-this-scenario"]]);
    const merged = mergeScenarioSavingsRules([], [globalRule()], [], packageIdByMember);
    expect(merged).toEqual([
      expect.objectContaining({ id: "r-global", packageId: "pkg-in-this-scenario", percentage: 20, isOverridden: false }),
    ]);
  });

  it("the same global rule resolves to a different package per scenario", () => {
    const scenarioA = mergeScenarioSavingsRules([], [globalRule()], [], new Map([["alice", "pkg-a"]]));
    const scenarioB = mergeScenarioSavingsRules([], [globalRule()], [], new Map([["alice", "pkg-b"]]));
    expect(scenarioA[0].packageId).toBe("pkg-a");
    expect(scenarioB[0].packageId).toBe("pkg-b");
  });

  it("skips a global rule when this scenario has no package for that member", () => {
    const merged = mergeScenarioSavingsRules([], [globalRule()], [], new Map());
    expect(merged).toEqual([]);
  });

  it("applies a scenario's override onto a percentage rule's percentage, not amount", () => {
    const packageIdByMember = new Map([["alice", "pkg-1"]]);
    const merged = mergeScenarioSavingsRules(
      [],
      [globalRule()],
      [ruleOverride({ value: 35 })],
      packageIdByMember
    );
    expect(merged[0]).toEqual(expect.objectContaining({ percentage: 35, amount: null, isOverridden: true }));
  });

  it("applies a scenario's override onto an amount rule's amount, not percentage", () => {
    const amountRule = globalRule({ allocation_type: "amount", amount: 8000, percentage: null });
    const packageIdByMember = new Map([["alice", "pkg-1"]]);
    const merged = mergeScenarioSavingsRules(
      [],
      [amountRule],
      [ruleOverride({ value: 12000 })],
      packageIdByMember
    );
    expect(merged[0]).toEqual(expect.objectContaining({ amount: 12000, percentage: null, isOverridden: true }));
  });

  it("drops a suppressed global rule entirely", () => {
    const packageIdByMember = new Map([["alice", "pkg-1"]]);
    const merged = mergeScenarioSavingsRules(
      [],
      [globalRule()],
      [ruleOverride({ suppressed: true, value: null })],
      packageIdByMember
    );
    expect(merged).toEqual([]);
  });
});
