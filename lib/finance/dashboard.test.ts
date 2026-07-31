import { describe, expect, it } from "vitest";
import { incomeSummary, totalMonthlyNetIncome } from "./dashboard";
import type { HouseholdMember, Income, TaxProfile } from "@/lib/types";

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
  ["alice", { id: "alice", name: "Alice", created_at: "", date_of_birth: null, statutory_health_insurance: true, health_insurance_addon_rate: null, private_health_insurance_monthly_premium: null }],
  ["bob", { id: "bob", name: "Bob", created_at: "", date_of_birth: null, statutory_health_insurance: true, health_insurance_addon_rate: null, private_health_insurance_monthly_premium: null }],
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
