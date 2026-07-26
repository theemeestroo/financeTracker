import { describe, expect, it } from "vitest";
import { projectRunway } from "./project-runway";
import type { Split } from "@/lib/finance/splits";
import type { Commitment, Income } from "@/lib/types";
import type { ResolvedIncome, ResolvedSeveranceScenario, SeveranceStream } from "./types";

function commitment(overrides: Partial<Commitment>): Commitment {
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
    ...overrides,
  };
}

function income(overrides: Partial<Income> & { splits?: Split[] }): ResolvedIncome {
  const { splits, ...incomeOverrides } = overrides;
  return {
    id: "i1",
    profile_id: "p1",
    name: "Salary",
    gross_amount: 1000,
    type: "salary",
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
    currency: "EUR",
    exchange_rate_to_eur: 1,
    ...incomeOverrides,
    splits: splits ?? [{ household_member_id: "m1", percentage: 100 }],
  };
}

function stream(overrides: Partial<SeveranceStream>): SeveranceStream {
  return {
    householdMemberId: "m1",
    severanceStartDate: "2026-01-01",
    includeGardenLeave: false,
    noticePeriodMonths: 0,
    gardenLeaveNetMonthly: 0,
    netSeveranceLumpSum: 0,
    ...overrides,
  };
}

const baseScenario: ResolvedSeveranceScenario = {
  startingBalance: 0,
  severances: [stream({})],
  phases: [{ startDate: "2026-01-01", profile: { commitments: [], income: [] } }],
  events: [],
  taxProfileByMember: new Map(),
  taxYear: 2026,
  horizonMonths: 12,
};

describe("projectRunway — lump sum timing", () => {
  it("lands the net severance in the first month when there's no garden leave", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [stream({ netSeveranceLumpSum: 100000 })],
    });
    expect(result.series[0].date).toBe("2026-01-01");
    expect(result.series[0].balance).toBe(100000);
    expect(result.depletionDate).toBeNull();
  });

  it("holds off the lump sum until garden leave ends, paying net monthly salary meanwhile", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [
        stream({
          includeGardenLeave: true,
          noticePeriodMonths: 2,
          gardenLeaveNetMonthly: 3000,
          netSeveranceLumpSum: 10000,
        }),
      ],
    });
    expect(result.series[0].balance).toBe(3000); // month 0: garden leave pay only
    expect(result.series[1].balance).toBe(6000); // month 1: another month of garden leave pay
    expect(result.series[2].balance).toBe(16000); // month 2: garden leave ends, lump sum lands
    expect(result.series[3].balance).toBe(16000); // month 3: no further cash flow
  });
});

describe("projectRunway — depletion", () => {
  it("finds the first month the balance goes negative under a flat burn rate", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [stream({ netSeveranceLumpSum: 20000 })],
      phases: [
        {
          startDate: "2026-01-01",
          profile: { commitments: [commitment({ amount: 5000 })], income: [] },
        },
      ],
    });
    // month 0: 20000 - 5000 = 15000 ... month 4: -5000 (first negative)
    expect(result.depletionDate).toBe("2026-05-01");
    expect(result.series[4].balance).toBe(-5000);
  });

  it("never depletes when income covers commitments", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [stream({ netSeveranceLumpSum: 5000 })],
      phases: [
        {
          startDate: "2026-01-01",
          profile: {
            commitments: [commitment({ amount: 2000 })],
            income: [income({ gross_amount: 3000 })], // no tax profile → gross fallback
          },
        },
      ],
    });
    expect(result.depletionDate).toBeNull();
    expect(result.series[11].balance).toBeGreaterThan(result.series[0].balance);
  });
});

describe("projectRunway — one-off commitments", () => {
  it("applies a one-off commitment only in its occurrence month", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [stream({ netSeveranceLumpSum: 10000 })],
      phases: [
        {
          startDate: "2026-01-01",
          profile: {
            commitments: [
              commitment({ frequency: "one_off", amount: 4000, start_date: "2026-03-15" }),
            ],
            income: [],
          },
        },
      ],
    });
    expect(result.series[0].balance).toBe(10000);
    expect(result.series[1].balance).toBe(10000);
    expect(result.series[2].balance).toBe(6000); // March: the one-off hits
    expect(result.series[3].balance).toBe(6000);
  });
});

describe("projectRunway — multi-phase (Living Profile switch)", () => {
  it("switches to the new phase's commitments from its start date, wholesale", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [stream({ netSeveranceLumpSum: 50000 })],
      phases: [
        {
          startDate: "2026-01-01",
          profile: { commitments: [commitment({ amount: 3000 })], income: [] },
        },
        {
          startDate: "2026-04-01", // month index 3
          profile: { commitments: [commitment({ amount: 800, name: "Thailand rent" })], income: [] },
        },
      ],
      horizonMonths: 6,
    });
    // months 0-2 burn 3000/mo, months 3-5 burn only 800/mo
    expect(result.series[0].balance).toBe(47000);
    expect(result.series[2].balance).toBe(41000);
    expect(result.series[3].balance).toBe(40200);
    expect(result.series[5].balance).toBe(38600);
  });
});

describe("projectRunway — scenario events", () => {
  it("applies a one-off outflow event in its month only", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [stream({ netSeveranceLumpSum: 20000 })],
      events: [
        { date: "2026-06-01", eventType: "one_off_outflow", amount: 5000, recurringGrossAmount: null, recurringFrequency: null, recurringTaxProfile: null, recurringEndDate: null },
      ],
    });
    expect(result.series[4].balance).toBe(20000);
    expect(result.series[5].balance).toBe(15000);
  });

  it("adds recurring income from its start month onward (gross fallback, no tax profile)", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [stream({ netSeveranceLumpSum: 0 })],
      phases: [
        { startDate: "2026-01-01", profile: { commitments: [commitment({ amount: 1000 })], income: [] } },
      ],
      events: [
        {
          date: "2026-03-01",
          eventType: "recurring_income_start",
          amount: null,
          recurringGrossAmount: 1200,
          recurringFrequency: "monthly",
          recurringTaxProfile: null,
          recurringEndDate: null,
        },
      ],
    });
    // months 0-1: -1000/mo; from month 2 (March) onward: -1000 + 1200 = +200/mo
    expect(result.series[1].balance).toBe(-2000);
    expect(result.series[2].balance).toBe(-1800);
    expect(result.series[3].balance).toBe(-1600);
  });
});

describe("projectRunway — multiple severance streams", () => {
  it("sums two people's independently-timed severance streams together", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 1000,
      severances: [
        stream({ householdMemberId: "m1", severanceStartDate: "2026-01-01", netSeveranceLumpSum: 20000 }),
        stream({
          householdMemberId: "m2",
          severanceStartDate: "2026-01-01",
          includeGardenLeave: true,
          noticePeriodMonths: 2,
          gardenLeaveNetMonthly: 2000,
          netSeveranceLumpSum: 15000,
        }),
      ],
      horizonMonths: 4,
    });
    // month 0: startingBalance 1000 + m1 lump 20000 + m2 garden leave 2000 = 23000
    expect(result.series[0].balance).toBe(23000);
    // month 1: + m2 garden leave 2000 = 25000
    expect(result.series[1].balance).toBe(25000);
    // month 2: m2 garden leave ends, m2 lump 15000 lands = 40000
    expect(result.series[2].balance).toBe(40000);
    expect(result.series[3].balance).toBe(40000);
  });

  it("starts the projection at the earliest of two staggered severance dates", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [
        stream({ householdMemberId: "m1", severanceStartDate: "2026-01-01", netSeveranceLumpSum: 10000 }),
        stream({ householdMemberId: "m2", severanceStartDate: "2026-04-01", netSeveranceLumpSum: 5000 }),
      ],
      horizonMonths: 4,
    });
    expect(result.series[0].date).toBe("2026-01-01");
    expect(result.series[0].balance).toBe(10000); // only m1's lump has landed yet
    expect(result.series[3].balance).toBe(15000); // m2's lump lands in month 3 (April)
  });
});
