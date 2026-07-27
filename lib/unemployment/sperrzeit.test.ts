import { describe, expect, it } from "vitest";
import { assessSperrzeitRisk } from "./sperrzeit";

describe("assessSperrzeitRisk", () => {
  const base = {
    monthly_base_salary: 10000,
    years_of_service: 10,
    include_garden_leave: true,
    notice_period_months: 6,
  };
  // statutoryFloor(10000, 10) = 0.5 * 10000 * 10 = 50000

  it("no risk when notice was observed and severance is at the floor", () => {
    const result = assessSperrzeitRisk(base, 50000);
    expect(result.atRisk).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("no risk when severance is below the floor", () => {
    const result = assessSperrzeitRisk(base, 30000);
    expect(result.atRisk).toBe(false);
  });

  it("flags risk when severance exceeds the safe-harbor floor", () => {
    // 87500 / (10000 * 10) = 0.875×
    const result = assessSperrzeitRisk(base, 87500);
    expect(result.atRisk).toBe(true);
    expect(result.reason).toContain("0.88×");
    expect(result.reason).toContain("Agentur für Arbeit");
  });

  it("flags risk when no garden leave was modeled, even under the floor", () => {
    const result = assessSperrzeitRisk({ ...base, include_garden_leave: false }, 30000);
    expect(result.atRisk).toBe(true);
    expect(result.reason).toContain("no garden leave modeled");
  });

  it("flags risk when garden leave is on but no notice period is set", () => {
    const result = assessSperrzeitRisk({ ...base, notice_period_months: 0 }, 30000);
    expect(result.atRisk).toBe(true);
  });

  it("combines both reasons when neither condition is met", () => {
    const result = assessSperrzeitRisk({ ...base, include_garden_leave: false }, 87500);
    expect(result.reason).toContain("no garden leave modeled");
    expect(result.reason).toContain("safe-harbor formula");
  });

  it("marks overridden:false on every heuristic path (no manual confirmation)", () => {
    expect(assessSperrzeitRisk(base, 50000).overridden).toBe(false);
    expect(assessSperrzeitRisk(base, 87500).overridden).toBe(false);
  });

  it("bypasses the heuristic entirely when sperrzeit_safe_confirmed is set, even well over the floor", () => {
    const result = assessSperrzeitRisk({ ...base, sperrzeit_safe_confirmed: true }, 87500);
    expect(result.atRisk).toBe(false);
    expect(result.overridden).toBe(true);
    expect(result.reason).toContain("manually waived");
  });

  it("bypasses the heuristic even when notice wasn't observed", () => {
    const result = assessSperrzeitRisk(
      { ...base, include_garden_leave: false, sperrzeit_safe_confirmed: true },
      30000
    );
    expect(result.atRisk).toBe(false);
    expect(result.overridden).toBe(true);
  });
});
