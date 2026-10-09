import { describe, expect, it } from "vitest";
import { categoryBreakdown, incomeSummary, totalMonthlyNetIncome } from "./dashboard";
import { memberShareOfAmount } from "./splits";
import type { Commitment, HouseholdMember, Income, TaxProfile } from "@/lib/types";

function commitment(
  overrides: Partial<Commitment> & Pick<Commitment, "id" | "category" | "amount">
): Commitment {
  return {
    profile_id: "p1",
    name: overrides.id,
    frequency: "monthly",
    essential: true,
    start_date: "2020-01-01",
    end_date: null,
    property_id: null,
    baseline_amount: null,
    ...overrides,
  };
}

const YEAR = 2025;

function income(overrides: Partial<Income> & Pick<Income, "id" | "type" | "gross_amount">): Income {
  return {
    profile_id: "p1",
    name: overrides.id,
    frequency: "monthly",
    start_date: null,
    end_date: null,
    tax_profile_id: null,
    christmas_bonus_pct: 0,
    holiday_pay_pct: 0,
    annual_bonus: 0,
    bonus_distribution: "one_time",
    annual_car_allowance: 0,
    monthly_pension_contribution: 0,
    monthly_company_car_cost: 0,
    rental_overhead_pct: 0,
    exclude_from_severance: false,
    baseline_gross_amount: null,
    currency: "EUR",
    exchange_rate_to_eur: 1,
    ...overrides,
  };
}

const alice: TaxProfile = {
  id: "tp-alice",
  household_member_id: "alice",
  tax_class: 1,
  church_tax: false,
  church_tax_state: null,
  has_children: false,
  statutory_health_insurance: true,
  health_insurance_addon_rate: null,
  private_health_insurance_monthly_premium: null,
};
const bob: TaxProfile = { ...alice, id: "tp-bob", household_member_id: "bob" };

const memberById = new Map<string, HouseholdMember>([
  ["alice", { id: "alice", name: "Alice", created_at: "", date_of_birth: null, statutory_health_insurance: true, health_insurance_addon_rate: null, private_health_insurance_monthly_premium: null, count_private_health_insurance_as_outgoing: true }],
  ["bob", { id: "bob", name: "Bob", created_at: "", date_of_birth: null, statutory_health_insurance: true, health_insurance_addon_rate: null, private_health_insurance_monthly_premium: null, count_private_health_insurance_as_outgoing: true }],
]);
const taxProfileByMember = new Map([
  ["alice", alice],
  ["bob", bob],
]);

describe("incomeSummary", () => {
  it("groups by type and by person, matching totalMonthlyNetIncome's total", () => {
    const salary = income({ id: "salary", type: "salary", gross_amount: 6000 });
    const rental = income({ id: "rental", type: "rental", gross_amount: 1000 });
    const rows = [salary, rental];
    const splitsByIncome = new Map([
      ["salary", [{ id: "s1", income_id: "salary", household_member_id: "alice", percentage: 100 }]],
      ["rental", [
        { id: "s2", income_id: "rental", household_member_id: "alice", percentage: 50 },
        { id: "s3", income_id: "rental", household_member_id: "bob", percentage: 50 },
      ]],
    ]);

    const summary = incomeSummary(rows, splitsByIncome, taxProfileByMember, memberById, YEAR);
    const { netMonthly } = totalMonthlyNetIncome(rows, splitsByIncome, taxProfileByMember, YEAR);

    expect(summary.total).toBeCloseTo(netMonthly, 5);
    expect(summary.byType.map((e) => e.type)).toEqual(["salary", "rental"]); // fixed INCOME_TYPES order
    expect(summary.byType.every((e) => e.monthly > 0)).toBe(true);

    expect(summary.byPerson).toHaveLength(2);
    expect(summary.byPerson[0].name).toBe("Alice"); // salary + half the rental — earns more than Bob
    expect(summary.byPerson[0].householdMemberId).toBe("alice");
    const bobEntry = summary.byPerson.find((e) => e.householdMemberId === "bob");
    expect(bobEntry?.monthly).toBeGreaterThan(0);
  });

  it("omits a person from byPerson entirely when unattributed (zero splits)", () => {
    const rows = [income({ id: "household-rental", type: "rental", gross_amount: 800 })];
    const summary = incomeSummary(rows, new Map(), taxProfileByMember, memberById, YEAR);

    expect(summary.total).toBe(0); // no one to tax — excluded, not gross-approximated
    expect(summary.byPerson).toEqual([]);
    expect(summary.byType).toEqual([]);
  });

  it("excludes a type entirely from byType when its net contribution is zero", () => {
    const rows = [income({ id: "other", type: "other", gross_amount: 500 })]; // no split → net excluded
    const summary = incomeSummary(rows, new Map(), taxProfileByMember, memberById, YEAR);
    expect(summary.byType).toEqual([]);
  });

  it("returns an empty summary for no income rows", () => {
    const summary = incomeSummary([], new Map(), taxProfileByMember, memberById, YEAR);
    expect(summary).toEqual({ total: 0, byType: [], byPerson: [] });
  });
});

describe("categoryBreakdown", () => {
  it("lists the individual commitments behind a category's total, sorted descending, summing to it", () => {
    const commitments = [
      commitment({ id: "Netflix", category: "subscriptions", amount: 15 }),
      commitment({ id: "Gym", category: "subscriptions", amount: 60 }),
      commitment({ id: "Rent", category: "housing", amount: 1800 }),
    ];
    const result = categoryBreakdown(commitments);

    const subs = result.find((e) => e.category === "subscriptions");
    expect(subs?.monthly).toBe(75);
    expect(subs?.lines).toEqual([
      { name: "Gym", monthly: 60 },
      { name: "Netflix", monthly: 15 },
    ]);
    expect(subs?.lines.reduce((sum, l) => sum + l.monthly, 0)).toBe(subs?.monthly);
  });

  it("prorates each line the same way as the total when weightFn is supplied", () => {
    const shared = commitment({ id: "Shared subscription", category: "subscriptions", amount: 100 });
    const splits = [
      { id: "s1", commitment_id: shared.id, household_member_id: "alice", percentage: 30 },
      { id: "s2", commitment_id: shared.id, household_member_id: "bob", percentage: 70 },
    ];
    const result = categoryBreakdown(
      [shared],
      (c) => memberShareOfAmount(c.amount, splits, "alice")
    );
    expect(result[0].monthly).toBe(30);
    expect(result[0].lines).toEqual([{ name: "Shared subscription", monthly: 30 }]);
  });

  it("excludes a category entirely when weightFn zeroes out every commitment in it", () => {
    const commitments = [commitment({ id: "Rent", category: "housing", amount: 1800 })];
    const result = categoryBreakdown(commitments, () => 0);
    expect(result).toEqual([]);
  });
});
