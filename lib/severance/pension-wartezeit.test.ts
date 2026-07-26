import { describe, expect, it } from "vitest";
import { pensionWartezeitDate, pensionWartezeitTimeline } from "./pension-wartezeit";

// Cross-checked against the severance-scenarios.jsx mock: employment start
// October 2022 → Wartezeit met October 2027.
describe("pensionWartezeitDate", () => {
  it("adds 5 years to the employment start date", () => {
    expect(pensionWartezeitDate("2022-10-01")).toBe("2027-10-01");
  });

  it("returns null with no employment start date", () => {
    expect(pensionWartezeitDate(null)).toBeNull();
  });
});

describe("pensionWartezeitTimeline", () => {
  it("flags rows before the threshold as ineligible and after as eligible", () => {
    const timeline = pensionWartezeitTimeline("2022-10-01", "2026-05-01");
    expect(timeline.length).toBeGreaterThan(0);
    const eligibleRow = timeline.find((r) => r.date >= "2027-10-01");
    const ineligibleRow = timeline.find((r) => r.date < "2027-10-01");
    expect(eligibleRow?.eligible).toBe(true);
    expect(ineligibleRow?.eligible).toBe(false);
  });
});
