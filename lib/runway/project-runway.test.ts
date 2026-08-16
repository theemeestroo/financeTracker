import { describe, expect, it } from "vitest";
import { calculateCapitalGainsTax } from "@/lib/tax";
import { addMonths } from "@/lib/finance/date-utils";
import { projectRunway } from "./project-runway";
import type { Split } from "@/lib/finance/splits";
import type { Commitment, Income, TaxProfile } from "@/lib/types";
import type { ResolvedIncome, ResolvedSavingsRule, ResolvedSeveranceScenario, SeveranceStream } from "./types";

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

function stream(overrides: Partial<SeveranceStream> = {}): SeveranceStream {
  const severanceStartDate = overrides.severanceStartDate ?? "2026-01-01";
  const includeGardenLeave = overrides.includeGardenLeave ?? false;
  const noticePeriodMonths = overrides.noticePeriodMonths ?? 0;
  // Same "no separate payment date" fallback resolve-scenario.ts uses —
  // lands the lump sum the same month garden leave ends, unless a test
  // overrides severancePaymentDate explicitly.
  const gardenLeaveEnd = includeGardenLeave
    ? addMonths(severanceStartDate, Math.round(noticePeriodMonths))
    : severanceStartDate;
  return {
    householdMemberId: "m1",
    householdMemberName: "Member",
    severanceStartDate,
    includeGardenLeave,
    noticePeriodMonths,
    gardenLeaveNetMonthly: 0,
    gardenLeaveGrossMonthly: 0,
    netSeveranceLumpSum: 0,
    severancePaymentDate: gardenLeaveEnd,
    algMonthlyNet: 0,
    algStartDate: "2026-01-01",
    algEndDate: "2026-01-01",
    newJobStartDate: null,
    healthGapMonthly: 0,
    healthAlgMonthly: 0,
    ...overrides,
  };
}

function savingsRule(overrides: Partial<ResolvedSavingsRule>): ResolvedSavingsRule {
  return {
    id: "sr1",
    householdMemberId: "m1",
    label: "Member — Investment",
    principal: 10000,
    annualReturnPct: 12,
    accrualFrequency: "monthly",
    startMonth: "2026-01-01",
    ...overrides,
  };
}

const baseScenario: ResolvedSeveranceScenario = {
  startingBalance: 0,
  severances: [stream({})],
  phases: [{ startDate: "2026-01-01", profile: { commitments: [], income: [] } }],
  events: [],
  savingsRules: [],
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

  it("lands the lump sum at severancePaymentDate, not gardenLeaveEndMonth, when they differ", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [
        stream({
          includeGardenLeave: true,
          noticePeriodMonths: 2, // garden leave ends month 2
          gardenLeaveNetMonthly: 3000,
          netSeveranceLumpSum: 10000,
          severancePaymentDate: "2026-06-01", // paid month 5 instead
        }),
      ],
    });
    // Garden leave pay still stops after month 1 (unaffected by the
    // separate payment date) but the lump sum doesn't land yet.
    expect(result.series[2].balance).toBe(6000);
    expect(result.series[3].balance).toBe(6000);
    expect(result.series[4].balance).toBe(6000);
    // Month 5 (2026-06-01): the lump sum lands on its own schedule.
    expect(result.series[5].date).toBe("2026-06-01");
    expect(result.series[5].balance).toBe(16000);
  });
});

describe("projectRunway — month breakdown", () => {
  it("itemizes commitments, income, and garden-leave pay into signed inflow/outflow lines that sum to the month's delta", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [
        stream({
          householdMemberName: "Alex",
          includeGardenLeave: true,
          noticePeriodMonths: 2,
          gardenLeaveNetMonthly: 3000,
          netSeveranceLumpSum: 10000,
        }),
      ],
      phases: [
        {
          startDate: "2026-01-01",
          profile: { commitments: [commitment({ name: "Rent", amount: 1200 })], income: [] },
        },
      ],
    });

    const month0 = result.series[0];
    expect(month0.breakdown?.inflows).toEqual([
      {
        label: "Alex — garden leave (net)",
        amount: 3000,
        householdMemberId: "m1",
        grossAmount: 0,
      },
    ]);
    expect(month0.breakdown?.outflows).toEqual([{ label: "Rent", amount: 1200 }]);
    expect(month0.balance).toBe(3000 - 1200);

    // Month 2: garden leave ends, lump sum lands alongside it.
    const month2 = result.series[2];
    expect(month2.breakdown?.inflows).toContainEqual({
      label: "Alex — severance lump sum (net)",
      amount: 10000,
    });
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
        { name: "Big bill", date: "2026-06-01", eventType: "one_off_outflow", amount: 5000, recurringGrossAmount: null, recurringFrequency: null, recurringTaxProfile: null, recurringEndDate: null },
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
          name: "New freelance income",
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

describe("projectRunway — ALG I + post-severance health insurance", () => {
  it("charges the gap health cost before ALG I starts, then switches to ALG I income + its own health cost", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [
        stream({
          netSeveranceLumpSum: 0,
          algMonthlyNet: 2000,
          algStartDate: "2026-03-01", // deferred 2 months past the (no-garden-leave) severance start
          algEndDate: "2026-06-01",
          healthGapMonthly: 300,
          healthAlgMonthly: 50,
        }),
      ],
      horizonMonths: 6,
    });
    // months 0-1 (Jan/Feb): self-funded gap, -300/mo
    expect(result.series[0].balance).toBe(-300);
    expect(result.series[1].balance).toBe(-600);
    // months 2-4 (Mar-May): on ALG I, +2000 -50/mo
    expect(result.series[2].balance).toBe(-600 + 1950);
    expect(result.series[3].balance).toBe(-600 + 1950 * 2);
    expect(result.series[4].balance).toBe(-600 + 1950 * 3);
    // month 5 (Jun): ALG I exhausted, back to the self-funded gap cost
    expect(result.series[5].balance).toBe(-600 + 1950 * 3 - 300);
  });

  it("stops ALG I income and health-insurance cost the moment a known re-employment date lands", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [
        stream({
          netSeveranceLumpSum: 0,
          algMonthlyNet: 2000,
          algStartDate: "2026-01-01",
          algEndDate: "2026-06-01",
          healthGapMonthly: 300,
          healthAlgMonthly: 50,
          newJobStartDate: "2026-03-01",
        }),
      ],
      horizonMonths: 4,
    });
    expect(result.series[0].balance).toBe(1950); // Jan: on ALG I
    expect(result.series[1].balance).toBe(3900); // Feb: on ALG I
    expect(result.series[2].balance).toBe(3900); // Mar: re-employed, no more ALG I or health cost
    expect(result.series[3].balance).toBe(3900);
  });

  it("charges only the gap health cost, indefinitely, when not claiming ALG I", () => {
    const result = projectRunway({
      ...baseScenario,
      severances: [
        stream({
          netSeveranceLumpSum: 0,
          algMonthlyNet: 0, // not claiming — algStartDate === algEndDate from the fixture default
          healthGapMonthly: 300,
        }),
      ],
      horizonMonths: 3,
    });
    expect(result.series[0].balance).toBe(-300);
    expect(result.series[1].balance).toBe(-600);
    expect(result.series[2].balance).toBe(-900);
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

describe("projectRunway — savings/investment rules", () => {
  it("compounds on its own pot, seeded from principal, independent of the household's starting balance", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 999999, // arbitrary — must not affect the pot below
      savingsRules: [savingsRule({ principal: 20000, annualReturnPct: 12, accrualFrequency: "monthly" })],
      horizonMonths: 3,
    });

    // 12%/12 = 1%/mo of the rule's own pot — which starts at principal and
    // grows on its own prior periods' return, not the household balance.
    expect(result.series[0].breakdown?.inflows).toEqual([
      {
        label: "Member — Investment — investment return",
        amount: 200, // 20000 * 1%
        householdMemberId: "m1",
        grossAmount: 200,
        investmentIncome: true,
      },
    ]);
    expect(result.series[1].breakdown?.inflows[0].amount).toBeCloseTo(202, 5); // pot grew to 20200
    expect(result.series[2].breakdown?.inflows[0].amount).toBeCloseTo(204.02, 5); // pot grew to 20402.02
  });

  it("keeps accruing on its own pot, unaffected by other spending, as long as the balance stays above the pots' total", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 50000,
      phases: [
        { startDate: "2026-01-01", profile: { commitments: [commitment({ amount: 2000 })], income: [] } },
      ],
      savingsRules: [savingsRule({ principal: 10000, annualReturnPct: 12, accrualFrequency: "monthly" })],
      horizonMonths: 2,
    });

    // month 0: pot 10000 -> accrual 100, unaffected by the -2000 rent hitting the household balance separately.
    const month0Accrual = result.series[0].breakdown?.inflows.find((i) => i.label.includes("investment return"));
    expect(month0Accrual?.amount).toBeCloseTo(100, 5);
    expect(result.series[0].balance).toBeCloseTo(50000 - 2000 + 100, 5); // household balance still reflects the rent
    // month 1: pot compounded on its own growth (10000 + 100 = 10100) -> accrual 101 — the household still has
    // 48100 in balance, comfortably above the pot's 10100 total, so nothing draws the pot down.
    const month1Accrual = result.series[1].breakdown?.inflows.find((i) => i.label.includes("investment return"));
    expect(month1Accrual?.amount).toBeCloseTo(101, 5);
  });

  it("caps the pot to the household's actual balance once spending draws it below the pot's total, shrinking future accrual too", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 10000,
      phases: [
        { startDate: "2026-01-01", profile: { commitments: [commitment({ amount: 3000 })], income: [] } },
      ],
      savingsRules: [savingsRule({ principal: 10000, annualReturnPct: 12, accrualFrequency: "monthly" })],
      horizonMonths: 2,
    });

    // month 0: pot still compounds normally off its own prior value (10000 -> accrual 100) — a period's own
    // accrual is never rewritten after the fact, only the pot's value going forward.
    const month0Accrual = result.series[0].breakdown?.inflows.find((i) => i.label.includes("investment return"));
    expect(month0Accrual?.amount).toBeCloseTo(100, 5);
    // -3000 rent + 100 return leaves the real balance at 7100 — below the pot's own (10000 + 100 =) 10100 total,
    // so the pot gets capped down to 7100 (there's no other money left to have covered the rent from).
    expect(result.series[0].balance).toBeCloseTo(7100, 5);
    // month 1: this month's accrual is 1% of the *capped* 7100 pot (71), not the uncapped 10100 (which would be 101).
    const month1Accrual = result.series[1].breakdown?.inflows.find((i) => i.label.includes("investment return"));
    expect(month1Accrual?.amount).toBeCloseTo(71, 5);
  });

  it("scales every pot down proportionally when spending draws the balance below their combined total", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 9000,
      phases: [
        { startDate: "2026-01-01", profile: { commitments: [commitment({ amount: 5500 })], income: [] } },
      ],
      savingsRules: [
        savingsRule({ id: "a", label: "Alice — Fund", principal: 6000, annualReturnPct: 12 }),
        savingsRule({ id: "b", label: "Bob — Deposit", principal: 3000, annualReturnPct: 12 }),
      ],
      horizonMonths: 2,
    });

    // month 0: both pots still accrue off their own untouched principal (6000 -> 60, 3000 -> 30).
    const month0 = result.series[0].breakdown?.inflows ?? [];
    expect(month0.find((i) => i.label.includes("Alice"))?.amount).toBeCloseTo(60, 5);
    expect(month0.find((i) => i.label.includes("Bob"))?.amount).toBeCloseTo(30, 5);
    // -5500 rent + 90 combined return leaves the real balance at 3590 — well below the pots' combined
    // (6060 + 3030 =) 9090 total, so both pots are scaled down by the same ratio (balance ÷ combined pots).
    expect(result.series[0].balance).toBeCloseTo(3590, 5);
    // month 1: each pot's accrual reflects its own scaled-down value, still in the original 2:1 ratio.
    const month1 = result.series[1].breakdown?.inflows ?? [];
    expect(month1.find((i) => i.label.includes("Alice"))?.amount).toBeCloseTo(23.93, 1);
    expect(month1.find((i) => i.label.includes("Bob"))?.amount).toBeCloseTo(11.97, 1);
  });

  it("wipes the pot to 0 once the household balance itself goes negative, and it never recovers on its own", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 1000,
      phases: [
        { startDate: "2026-01-01", profile: { commitments: [commitment({ amount: 5000 })], income: [] } },
      ],
      savingsRules: [savingsRule({ principal: 1000, annualReturnPct: 12, accrualFrequency: "monthly" })],
      horizonMonths: 2,
    });

    expect(result.series[0].balance).toBeCloseTo(1000 - 5000 + 10, 5); // -3990 — deep negative
    // month 1: the pot was capped to 0 (there's no money left, let alone invested money), so there's nothing
    // left to accrue a return on — no investment-return line item at all this month.
    const month1Accrual = result.series[1].breakdown?.inflows.find((i) => i.label.includes("investment return"));
    expect(month1Accrual).toBeUndefined();
  });

  it("only accrues on the rule's own period boundaries (quarterly), not every month", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 4000, // backs the pot's principal so the balance-cap below never kicks in here
      savingsRules: [savingsRule({ principal: 4000, annualReturnPct: 8, accrualFrequency: "quarterly" })],
      horizonMonths: 4,
    });
    expect(result.series[0].breakdown?.inflows).toHaveLength(1); // month 0: accrual (8%/4 = 2% of 4000 = 80)
    expect(result.series[0].breakdown?.inflows[0].amount).toBeCloseTo(80, 5);
    expect(result.series[1].breakdown?.inflows).toHaveLength(0);
    expect(result.series[2].breakdown?.inflows).toHaveLength(0);
    expect(result.series[3].breakdown?.inflows).toHaveLength(1); // +3 months, pot grew to 4080 -> 81.6
    expect(result.series[3].breakdown?.inflows[0].amount).toBeCloseTo(81.6, 5);
  });

  it("doesn't accrue before the rule's own startMonth", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 10000, // backs the default rule's principal (see savingsRule())
      savingsRules: [savingsRule({ startMonth: "2026-03-01" })],
      horizonMonths: 3,
    });
    expect(result.series[0].breakdown?.inflows).toEqual([]);
    expect(result.series[1].breakdown?.inflows).toEqual([]);
    expect(result.series[2].breakdown?.inflows).toHaveLength(1);
  });

  it("doesn't shrink a rule's pot for months before its own startMonth, even if its principal dwarfs the balance then", () => {
    const result = projectRunway({
      ...baseScenario,
      startingBalance: 0,
      severances: [
        stream({
          includeGardenLeave: true,
          noticePeriodMonths: 2, // garden leave covers months 0-1; lump sum + rule both start month 2
          gardenLeaveNetMonthly: 500, // tiny next to the pot's principal below
          netSeveranceLumpSum: 100000,
        }),
      ],
      savingsRules: [
        savingsRule({ principal: 100000, annualReturnPct: 12, accrualFrequency: "monthly", startMonth: "2026-03-01" }),
      ],
      horizonMonths: 3,
    });

    // Months 0-1: only garden-leave pay exists — the pot's own principal
    // (100000) dwarfs it, but the rule hasn't started yet, so it must not
    // exist yet and must not falsely trip the "shrink pots to fit the real
    // balance" safeguard against it.
    expect(result.series[0].breakdown?.inflows.some((i) => i.label.includes("investment return"))).toBe(false);
    expect(result.series[1].breakdown?.inflows.some((i) => i.label.includes("investment return"))).toBe(false);

    // Month 2: the lump sum lands and the rule's own startMonth arrives in
    // the same month — the pot is seeded fresh from its full 100000
    // principal (never having been prematurely collapsed during months
    // 0-1) and accrues a full month's return on it (12%/12 = 1% of 100000
    // = 1000). This is the regression case: seeding pots eagerly at month
    // 0 used to let an unfunded rule's principal be shrunk down to a
    // sliver of itself before the severance was ever actually paid,
    // permanently.
    const accrual = result.series[2].breakdown?.inflows.find((i) => i.label.includes("investment return"));
    expect(accrual?.amount).toBeCloseTo(1000, 5);
    expect(result.series[2].balance).toBeCloseTo(500 + 500 + 100000 + 1000, 5);
  });

  it("sums multiple rules independently, each against its own principal, in the same month", () => {
    const result = projectRunway({
      ...baseScenario,
      savingsRules: [
        savingsRule({ id: "a", label: "Alice — Fund", principal: 10000, annualReturnPct: 12 }),
        savingsRule({ id: "b", label: "Bob — Deposit", principal: 5000, annualReturnPct: 6 }),
      ],
      horizonMonths: 1,
    });
    expect(result.series[0].breakdown?.inflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Alice — Fund — investment return", amount: 100 }), // 10000 * 1%
        expect.objectContaining({ label: "Bob — Deposit — investment return", amount: 25 }), // 5000 * 0.5%
      ])
    );
  });

  it("nets the accrual via Abgeltungsteuer when the rule's member has a tax profile", () => {
    const result = projectRunway({
      ...baseScenario,
      taxProfileByMember: new Map([["m1", taxProfile]]),
      savingsRules: [
        savingsRule({ principal: 100000, annualReturnPct: 12, accrualFrequency: "monthly", householdMemberId: "m1" }),
      ],
      horizonMonths: 1,
    });

    const item = result.series[0].breakdown?.inflows.find((i) => i.label.includes("investment return"));
    const grossAccrued = 100000 * 0.01; // 12%/12 of the pot
    // Sparerpauschbetrag is annual — a monthly rule annualizes (×12) before
    // netting, then de-annualizes the result back to this month's share.
    const netAnnual = calculateCapitalGainsTax(grossAccrued * 12, taxProfile, 2026).netAnnual;
    expect(item?.grossAmount).toBeCloseTo(grossAccrued, 5);
    expect(item?.amount).toBeCloseTo(netAnnual / 12, 5);
    expect(item?.amount).toBeLessThan(grossAccrued); // genuinely taxed, not a pass-through
    expect(item?.investmentIncome).toBe(true);
    expect(item?.householdMemberId).toBe("m1");
  });

  it("a negative accrual (a loss on the pot) is never taxed", () => {
    const result = projectRunway({
      ...baseScenario,
      taxProfileByMember: new Map([["m1", taxProfile]]),
      savingsRules: [savingsRule({ principal: 100000, annualReturnPct: -12, householdMemberId: "m1" })],
      horizonMonths: 1,
    });
    const item = result.series[0].breakdown?.outflows.find((i) => i.label.includes("investment return"));
    expect(item?.amount).toBeCloseTo(1000, 5); // untaxed — full -1% of the 100000 pot shown as an outflow
  });
});
