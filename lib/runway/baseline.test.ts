import { describe, expect, it } from "vitest";
import { projectDoNothingBaseline } from "./baseline";

describe("projectDoNothingBaseline", () => {
  const dates = ["2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01"];

  it("holds a surplus flat, growing the balance each month", () => {
    const result = projectDoNothingBaseline(dates, 10000, 500);
    expect(result).toEqual([
      { date: "2027-01-01", balance: 10000 },
      { date: "2027-02-01", balance: 10500 },
      { date: "2027-03-01", balance: 11000 },
      { date: "2027-04-01", balance: 11500 },
    ]);
  });

  it("holds a deficit flat, draining the balance each month", () => {
    const result = projectDoNothingBaseline(dates, 10000, -1000);
    expect(result.map((p) => p.balance)).toEqual([10000, 9000, 8000, 7000]);
  });

  it("is flat (zero surplus) when income exactly matches commitments", () => {
    const result = projectDoNothingBaseline(dates, 5000, 0);
    expect(result.every((p) => p.balance === 5000)).toBe(true);
  });

  it("returns an empty series for an empty date list", () => {
    expect(projectDoNothingBaseline([], 5000, 500)).toEqual([]);
  });
});
