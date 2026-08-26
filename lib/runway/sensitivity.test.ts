import { describe, expect, it } from "vitest";
import { sensitivityAnalysis } from "./sensitivity";
import type { ResolvedCommitment, ResolvedSeveranceScenario } from "./types";
import type { Split } from "@/lib/finance/splits";
import type { Commitment } from "@/lib/types";

function commitment(
  overrides: Partial<Commitment> & Pick<Commitment, "id" | "category" | "amount" | "essential"> & { splits?: Split[] }
): ResolvedCommitment {
  const { splits, ...commitmentOverrides } = overrides;
  return {
    profile_id: "p1",
    name: overrides.id,
    frequency: "monthly",
    start_date: "2020-01-01",
    end_date: null,
    property_id: null,
    baseline_amount: null,
    ...commitmentOverrides,
    splits: splits ?? [],
  };
}

// One severance stream: no garden leave, no ALG I — lump sum lands the
// severance month, then pure burn at the phase's commitment total.
function scenario(
  commitments: ResolvedCommitment[],
  { horizonMonths, netSeveranceLumpSum = 6000 }: { horizonMonths?: number; netSeveranceLumpSum?: number } = {}
): ResolvedSeveranceScenario {
  return {
    startingBalance: 0,
    severances: [
      {
        householdMemberId: "member-A",
        householdMemberName: "Member A",
        severanceStartDate: "2027-01-01",
        includeGardenLeave: false,
        noticePeriodMonths: 0,
        gardenLeaveNetMonthly: 0,
        gardenLeaveGrossMonthly: 0,
        netSeveranceLumpSum,
        severancePaymentDate: "2027-01-01",
        refundAmount: 0,
        refundDate: null,
        algMonthlyNet: 0,
        algStartDate: "2027-01-01",
        algEndDate: "2027-01-01",
        newJobStartDate: null,
        healthGapMonthly: 0,
        healthAlgMonthly: 0,
      },
    ],
    phases: [{ startDate: "2026-07-30", profile: { commitments, income: [] } }],
    events: [],
    savingsRules: [],
    taxProfileByMember: new Map(),
    taxYear: 2026,
    horizonMonths,
  };
}

describe("sensitivityAnalysis", () => {
  it("ranks discretionary categories by months of runway gained, biggest cut first", () => {
    const commitments = [
      commitment({ id: "rent", category: "housing", amount: 1500, essential: true }),
      commitment({ id: "leisure", category: "leisure_discretionary", amount: 1500, essential: false }),
      commitment({ id: "subs", category: "subscriptions", amount: 100, essential: false }),
    ];
    const result = sensitivityAnalysis(scenario(commitments));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      category: "leisure_discretionary",
      monthlyAmount: 1500,
      monthsAdded: 2,
      becomesSustainable: false,
      lines: [{ name: "leisure", monthlyAmount: 1500 }],
    });
    expect(result[1]).toMatchObject({
      category: "subscriptions",
      monthlyAmount: 100,
      monthsAdded: 1,
      becomesSustainable: false,
      lines: [{ name: "subs", monthlyAmount: 100 }],
    });
    expect(result[0].baselineDepletionDate).toBe("2027-02-01");
    expect(result[0].newDepletionDate).toBe("2027-04-01");
  });

  it("lists multiple commitments within one category as separate detail lines, biggest first", () => {
    const commitments = [
      commitment({ id: "rent", category: "housing", amount: 1500, essential: true }),
      commitment({ id: "netflix", category: "subscriptions", amount: 15, essential: false }),
      commitment({ id: "gym", category: "subscriptions", amount: 60, essential: false }),
    ];
    const result = sensitivityAnalysis(scenario(commitments));

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("subscriptions");
    expect(result[0].monthlyAmount).toBe(75);
    expect(result[0].lines).toEqual([
      { name: "gym", monthlyAmount: 60 },
      { name: "netflix", monthlyAmount: 15 },
    ]);
  });

  it("marks a category sustainable when cutting it outruns the horizon", () => {
    const commitments = [
      commitment({ id: "rent", category: "housing", amount: 1500, essential: true }),
      commitment({ id: "leisure", category: "leisure_discretionary", amount: 1500, essential: false }),
    ];
    const result = sensitivityAnalysis(scenario(commitments, { horizonMonths: 3 }));

    expect(result).toHaveLength(1);
    expect(result[0].becomesSustainable).toBe(true);
    expect(result[0].monthsAdded).toBe(1); // horizon length (3) - baseline depletion index (2)
    expect(result[0].newDepletionDate).toBeNull();
  });

  it("returns nothing when the baseline never depletes within the horizon", () => {
    const commitments = [commitment({ id: "leisure", category: "leisure_discretionary", amount: 50, essential: false })];
    const result = sensitivityAnalysis(scenario(commitments, { netSeveranceLumpSum: 1_000_000 }));
    expect(result).toEqual([]);
  });

  it("returns nothing when there are no discretionary commitments", () => {
    const commitments = [commitment({ id: "rent", category: "housing", amount: 3000, essential: true })];
    expect(sensitivityAnalysis(scenario(commitments))).toEqual([]);
  });

  it("dedupes a commitment carried unchanged across multiple phases when totaling monthlyAmount", () => {
    const shared = commitment({ id: "leisure", category: "leisure_discretionary", amount: 800, essential: false });
    const rent = commitment({ id: "rent", category: "housing", amount: 1500, essential: true });
    const s = scenario([rent, shared]);
    s.phases = [
      { startDate: "2026-07-30", profile: { commitments: [rent, shared], income: [] } },
      { startDate: "2027-06-01", profile: { commitments: [rent, shared], income: [] } },
    ];
    const result = sensitivityAnalysis(s);
    const entry = result.find((e) => e.category === "leisure_discretionary");
    expect(entry?.monthlyAmount).toBe(800);
    expect(entry?.lines).toHaveLength(1); // not counted twice just for appearing in both phases
  });
});
