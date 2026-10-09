import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { precedingMonthsSeries } from "./preceding-months";
import type { Split } from "@/lib/finance/splits";
import type { Commitment, Income, TaxProfile } from "@/lib/types";
import type { ResolvedCommitment, ResolvedIncome, ResolvedSeveranceScenario, SeveranceStream } from "./types";

const taxProfile: TaxProfile = {
  id: "tp1",
  household_member_id: "m1",
  tax_class: 1,
  church_tax: false,
  church_tax_state: null,
  has_children: false,
  statutory_health_insurance: true,
  health_insurance_addon_rate: null,
  private_health_insurance_monthly_premium: null,
};

function income(overrides: Partial<Income> & { splits?: Split[] }): ResolvedIncome {
  const { splits, ...incomeOverrides } = overrides;
  return {
    id: "i1",
    profile_id: "p1",
    name: "Rental income",
    gross_amount: 1000,
    type: "rental",
    frequency: "monthly",
    start_date: "2020-01-01",
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
    ...incomeOverrides,
    splits: splits ?? [{ household_member_id: "m1", percentage: 100 }],
  };
}

function commitment(overrides: Partial<Commitment> & { splits?: Split[] }): ResolvedCommitment {
  const { splits, ...commitmentOverrides } = overrides;
  return {
    id: "c1",
    profile_id: "p1",
    name: "Rent",
    category: "housing",
    amount: 1000,
    frequency: "monthly",
    essential: true,
    start_date: "2020-01-01",
    end_date: null,
    property_id: null,
    baseline_amount: null,
    ...commitmentOverrides,
    splits: splits ?? [],
  };
}

function stream(overrides: Partial<SeveranceStream>): SeveranceStream {
  return {
    householdMemberId: "m1",
    householdMemberName: "Member",
    severanceStartDate: "2027-04-15",
    includeGardenLeave: false,
    noticePeriodMonths: 0,
    gardenLeaveNetMonthly: 0,
    gardenLeaveGrossMonthly: 0,
    netSeveranceLumpSum: 0,
    severancePaymentDate: "2027-04-15",
    refundAmount: 0,
    refundDate: null,
    algMonthlyNet: 0,
    algStartDate: "2027-04-15",
    algEndDate: "2027-04-15",
    newJobStartDate: null,
    healthGapMonthly: 0,
    healthAlgMonthly: 0,
    ...overrides,
  };
}

const baseScenario: ResolvedSeveranceScenario = {
  startingBalance: 10000,
  severances: [stream({})],
  phases: [
    {
      startDate: "2020-01-01",
      profile: { commitments: [commitment({})], income: [income({})] },
    },
  ],
  events: [],
  savingsRules: [],
  taxProfileByMember: new Map([["m1", taxProfile]]),
  taxYear: 2026,
};

describe("precedingMonthsSeries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-10T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("backfills from today through the month before a mid-year severance start", () => {
    const points = precedingMonthsSeries(baseScenario);
    expect(points.map((p) => p.date)).toEqual(["2027-01-01", "2027-02-01", "2027-03-01"]);
  });

  it("each point carries both income and commitment items, same shape as the real projection", () => {
    const points = precedingMonthsSeries(baseScenario);
    for (const p of points) {
      expect(p.breakdown?.inflows).toHaveLength(1);
      expect(p.breakdown?.inflows[0].label).toBe("Rental income");
      expect(p.breakdown?.outflows).toHaveLength(1);
      expect(p.breakdown?.outflows[0]).toEqual({ label: "Rent", amount: 1000 });
      expect(p.monthlyCost).toBe(1000);
    }
  });

  it("walks the balance backward from startingBalance, which anchors the last backfilled month's closing balance", () => {
    // startingBalance is *April's opening* balance, i.e. March's own
    // closing balance — the last backfilled point's balance should equal
    // it exactly, by construction.
    const points = precedingMonthsSeries(baseScenario);
    const [jan, feb, mar] = points;
    expect(mar.balance).toBe(baseScenario.startingBalance);

    // Rental nets to something under 1000 (taxed), commitment costs
    // 1000/mo, so each month is a net deficit — meaning earlier months had
    // a HIGHER balance than startingBalance, since balance only fell as
    // time moved toward April.
    expect(mar.balance).toBeLessThan(feb.balance);
    expect(feb.balance).toBeLessThan(jan.balance);

    // Each month's own opening balance (the previous month's closing
    // balance) plus that month's own delta must reproduce its closing
    // balance exactly — the backward walk is just this run forward again.
    const marDelta =
      mar.breakdown!.inflows.reduce((s, i) => s + i.amount, 0) -
      mar.breakdown!.outflows.reduce((s, i) => s + i.amount, 0);
    expect(feb.balance + marDelta).toBeCloseTo(mar.balance, 5);
  });

  it("carries each member's own prorated balance backward too, summing to the household total at every point", () => {
    const points = precedingMonthsSeries({ ...baseScenario, householdMemberIds: ["m1", "m2"] });
    for (const p of points) {
      expect((p.balanceByMember?.m1 ?? 0) + (p.balanceByMember?.m2 ?? 0)).toBeCloseTo(p.balance, 5);
    }
    // March is the last backfilled month — its closing balance is exactly
    // startingBalance, split evenly (there's no data attributing the
    // household's existing savings to one person over another).
    const mar = points[points.length - 1];
    expect(mar.balanceByMember?.m1).toBeCloseTo(baseScenario.startingBalance / 2, 5);
    expect(mar.balanceByMember?.m2).toBeCloseTo(baseScenario.startingBalance / 2, 5);
  });

  it("omits balanceByMember when the scenario doesn't supply a household roster", () => {
    const points = precedingMonthsSeries(baseScenario);
    expect(points[0].balanceByMember).toBeUndefined();
  });

  it("returns nothing when today is already at or past the severance start", () => {
    vi.setSystemTime(new Date("2027-04-15T12:00:00Z"));
    const points = precedingMonthsSeries(baseScenario);
    expect(points).toEqual([]);
  });

  it("returns nothing when today is after the severance start", () => {
    vi.setSystemTime(new Date("2027-06-01T12:00:00Z"));
    const points = precedingMonthsSeries(baseScenario);
    expect(points).toEqual([]);
  });

  it("reaches back further than 3 months, and across calendar years, when the severance is planned well in advance", () => {
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    const points = precedingMonthsSeries(baseScenario);
    expect(points.map((p) => p.date)).toEqual([
      "2026-10-01", "2026-11-01", "2026-12-01",
      "2027-01-01", "2027-02-01", "2027-03-01",
    ]);
  });

  it("returns nothing when there are no phases or no severances", () => {
    expect(precedingMonthsSeries({ ...baseScenario, phases: [] })).toEqual([]);
    expect(precedingMonthsSeries({ ...baseScenario, severances: [] })).toEqual([]);
  });

  it("uses whichever phase would have been active in the backfilled month, same as the real projection", () => {
    const points = precedingMonthsSeries({
      ...baseScenario,
      phases: [
        {
          startDate: "2020-01-01",
          profile: { commitments: [], income: [income({ name: "Old rental" })] },
        },
        {
          startDate: "2027-02-01",
          profile: { commitments: [], income: [income({ name: "New rental" })] },
        },
      ],
    });
    const byDate = new Map(points.map((p) => [p.date, p.breakdown!.inflows[0].label]));
    expect(byDate.get("2027-01-01")).toBe("Old rental");
    expect(byDate.get("2027-02-01")).toBe("New rental");
    expect(byDate.get("2027-03-01")).toBe("New rental");
  });
});
