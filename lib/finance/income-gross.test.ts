import { describe, expect, it } from "vitest";
import {
  incomeBreakdownPerSplit,
  incomeGrossBreakdown,
  incomeGrossBreakdownForRow,
  incomeNetBreakdown,
  incomeNetBreakdownForRow,
} from "./income-gross";
import type { Income, TaxProfile } from "@/lib/types";

const YEAR = 2025;

const income: Income = {
  id: "i1",
  profile_id: "p1",
  name: "Rental income",
  gross_amount: 6000,
  type: "rental",
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
};

const profileClass1: TaxProfile = {
  id: "tp1",
  household_member_id: "alice",
  tax_class: 1,
  church_tax: false,
  church_tax_state: null,
  has_children: false,
  statutory_health_insurance: true,
  health_insurance_addon_rate: null,
  private_health_insurance_monthly_premium: null,
};

const profileClass3: TaxProfile = {
  ...profileClass1,
  id: "tp2",
  household_member_id: "bob",
  tax_class: 3,
};

describe("rental overhead", () => {
  it("reduces the recurring gross by the overhead %, leaving other types untouched", () => {
    const withOverhead = incomeGrossBreakdown({ ...income, rental_overhead_pct: 20 });
    expect(withOverhead.recurringMonthlyGross).toBeCloseTo(4800, 5); // 6000 * 0.8

    const other = incomeGrossBreakdown({ ...income, type: "other", rental_overhead_pct: 20 });
    expect(other.recurringMonthlyGross).toBe(6000); // overhead only applies to "rental"
  });

  it("tax is calculated on the overhead-adjusted amount, not the raw rent", () => {
    const raw = incomeNetBreakdown(income, profileClass1, YEAR).recurringMonthlyNet;
    const adjusted = incomeNetBreakdown(
      { ...income, rental_overhead_pct: 20 },
      profileClass1,
      YEAR
    ).recurringMonthlyNet;
    // Net on 80% of the rent should be noticeably less than net on the full rent —
    // not just 80% of the raw-rent net, since the tax brackets differ too.
    expect(adjusted).toBeLessThan(raw);
    expect(adjusted).toBeGreaterThan(0);
  });

  it("flows through per-split shares the same way as any other dollar field", () => {
    const shares = incomeBreakdownPerSplit(
      { ...income, rental_overhead_pct: 20 },
      [
        { household_member_id: "alice", percentage: 50 },
        { household_member_id: "bob", percentage: 50 },
      ],
      new Map([["alice", profileClass1], ["bob", profileClass3]]),
      YEAR
    );
    const totalGross = shares.reduce((sum, s) => sum + s.gross.recurringMonthlyGross, 0);
    expect(totalGross).toBeCloseTo(4800, 5); // still 6000 * 0.8 overall, just split 50/50
  });
});

describe("currency conversion", () => {
  it("converts a non-EUR row to EUR via its own exchange rate", () => {
    const gbp = incomeGrossBreakdown({ ...income, currency: "GBP", exchange_rate_to_eur: 1.17 });
    expect(gbp.recurringMonthlyGross).toBeCloseTo(6000 * 1.17, 5);
  });

  it("a rate of 1 (the EUR default) is a no-op", () => {
    const eur = incomeGrossBreakdown(income);
    expect(eur.recurringMonthlyGross).toBe(6000);
  });

  it("tax is calculated on the EUR-converted amount, not the raw foreign-currency figure", () => {
    const eurNet = incomeNetBreakdown(income, profileClass1, YEAR).recurringMonthlyNet;
    const gbpNet = incomeNetBreakdown(
      { ...income, currency: "GBP", exchange_rate_to_eur: 1.17 },
      profileClass1,
      YEAR
    ).recurringMonthlyNet;
    // Same raw amount (6000), but the GBP row is worth 17% more once
    // converted — net should scale up accordingly, not match the EUR row.
    expect(gbpNet).toBeGreaterThan(eurNet);
  });

  it("composes correctly with rental overhead and splits — order doesn't matter", () => {
    const shares = incomeBreakdownPerSplit(
      { ...income, currency: "GBP", exchange_rate_to_eur: 1.2, rental_overhead_pct: 20 },
      [
        { household_member_id: "alice", percentage: 50 },
        { household_member_id: "bob", percentage: 50 },
      ],
      new Map([["alice", profileClass1], ["bob", profileClass3]]),
      YEAR
    );
    const totalGross = shares.reduce((sum, s) => sum + s.gross.recurringMonthlyGross, 0);
    // 6000 GBP -> 7200 EUR -> 80% after overhead = 5760, split 50/50 sums back to the same total.
    expect(totalGross).toBeCloseTo(5760, 5);
  });
});

describe("incomeGrossBreakdownForRow", () => {
  it("a household (zero-split) row sums to the full gross amount", () => {
    expect(incomeGrossBreakdownForRow(income, []).recurringMonthlyGross).toBe(6000);
  });

  it("splitting 50/50 recombines to the same total gross as unsplit", () => {
    const split = incomeGrossBreakdownForRow(income, [
      { household_member_id: "alice", percentage: 50 },
      { household_member_id: "bob", percentage: 50 },
    ]);
    expect(split.recurringMonthlyGross).toBeCloseTo(6000, 5);
  });
});

describe("incomeBreakdownPerSplit", () => {
  it("zero splits is unattributed — one entry, no tax profile to apply", () => {
    const shares = incomeBreakdownPerSplit(income, [], new Map(), YEAR);
    expect(shares).toHaveLength(1);
    expect(shares[0].householdMemberId).toBe("");
    expect(shares[0].net).toBeNull();
    expect(shares[0].gross.recurringMonthlyGross).toBe(6000);
  });

  it("each split is taxed via its own member's profile, not a shared rate", () => {
    const taxProfileByMember = new Map([
      ["alice", profileClass1],
      ["bob", profileClass3],
    ]);
    const shares = incomeBreakdownPerSplit(
      income,
      [
        { household_member_id: "alice", percentage: 50 },
        { household_member_id: "bob", percentage: 50 },
      ],
      taxProfileByMember,
      YEAR
    );
    expect(shares).toHaveLength(2);
    const alice = shares.find((s) => s.householdMemberId === "alice")!;
    const bob = shares.find((s) => s.householdMemberId === "bob")!;
    expect(alice.gross.recurringMonthlyGross).toBeCloseTo(3000, 5);
    expect(bob.gross.recurringMonthlyGross).toBeCloseTo(3000, 5);
    // Tax class 1 vs 3 on the same gross share produces a different net —
    // proof each share is taxed via its own person's profile, not a blend.
    expect(alice.net!.recurringMonthlyNet).not.toBeCloseTo(bob.net!.recurringMonthlyNet, 2);
  });

  it("a share whose member has no tax profile yet nets to null", () => {
    const shares = incomeBreakdownPerSplit(
      income,
      [{ household_member_id: "alice", percentage: 100 }],
      new Map(),
      YEAR
    );
    expect(shares[0].net).toBeNull();
  });
});

describe("incomeNetBreakdownForRow", () => {
  it("sums only the shares with a resolvable tax profile, counting the rest as missing", () => {
    const taxProfileByMember = new Map([["alice", profileClass1]]);
    const { net, missingShares } = incomeNetBreakdownForRow(
      income,
      [
        { household_member_id: "alice", percentage: 50 },
        { household_member_id: "bob", percentage: 50 }, // no tax profile
      ],
      taxProfileByMember,
      YEAR
    );
    expect(missingShares).toBe(1);
    expect(net.recurringMonthlyNet).toBeGreaterThan(0);
    // Only Alice's half is netted — well under what the full row's net would be.
    const fullNet = incomeNetBreakdownForRow(
      income,
      [{ household_member_id: "alice", percentage: 100 }],
      taxProfileByMember,
      YEAR
    ).net.recurringMonthlyNet;
    expect(net.recurringMonthlyNet).toBeLessThan(fullNet);
  });

  it("an unattributed (zero-split) row contributes 0 net and counts as 1 missing share", () => {
    const { net, missingShares } = incomeNetBreakdownForRow(income, [], new Map(), YEAR);
    expect(net.recurringMonthlyNet).toBe(0);
    expect(missingShares).toBe(1);
  });
});
