import { describe, expect, it } from "vitest";
import { sortCommitmentsByCost } from "./frequency";

describe("sortCommitmentsByCost", () => {
  it("orders by monthly-equivalent cost, largest first", () => {
    const sorted = sortCommitmentsByCost([
      { amount: 100, frequency: "monthly" }, // 100/mo
      { amount: 12000, frequency: "annual" }, // 1000/mo
      { amount: 3000, frequency: "quarterly" }, // 1000/mo
      { amount: 5000, frequency: "one_off" }, // 0/mo
    ]);
    expect(sorted.map((c) => c.amount)).toEqual([12000, 3000, 100, 5000]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { amount: 100, frequency: "monthly" as const },
      { amount: 200, frequency: "monthly" as const },
    ];
    const sorted = sortCommitmentsByCost(input);
    expect(sorted).not.toBe(input);
    expect(input.map((c) => c.amount)).toEqual([100, 200]);
  });
});
