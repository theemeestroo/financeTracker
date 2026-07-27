import { describe, expect, it } from "vitest";
import { alg1MonthlyNet } from "./leistungsentgelt";

describe("alg1MonthlyNet — 2026", () => {
  it("matches a hand-computed mid-range salary (well under the ceiling, no Soli)", () => {
    // gross 5000/mo -> annual 60000; -20% SV pauschale -> taxable 48000
    // calculateBaseIncomeTax(48000, 2026) zone2: z=(48000-17799)/10000=3.0201
    //   (173.1*3.0201+2397)*3.0201+1034.87 = floor(9852.895...) = 9852
    // Soli: incomeTax 9852 <= freigrenzeSingle 20350 -> 0
    // Leistungsentgelt annual: 48000 - 9852 - 0 = 38148 -> /12 = 3179/mo
    expect(alg1MonthlyNet(5000, false, 2026)).toBeCloseTo(3179 * 0.6, 2); // 1907.4
  });

  it("applies the higher Leistungssatz with at least one child", () => {
    expect(alg1MonthlyNet(5000, true, 2026)).toBeCloseTo(3179 * 0.67, 2); // 2129.93
  });

  it("caps the gross salary at the Beitragsbemessungsgrenze (8,450/mo in 2026) before deductions", () => {
    // capped gross 8450/mo -> annual 101400; -20% -> taxable 81120
    // calculateBaseIncomeTax(81120, 2026) zone3: floor(0.42*81120-11135.63) = floor(22934.77) = 22934
    // Soli: 22934 > freigrenzeSingle 20350 -> min(22934*0.055, (22934-20350)*0.119)
    //   = min(1261.37, 307.496) = 307.496
    // Leistungsentgelt annual: 81120 - 22934 - 307.496 = 57878.504 -> /12 = 4823.2087.../mo
    const leistungsentgeltMonthly = (81120 - 22934 - 307.496) / 12;
    expect(alg1MonthlyNet(20000, false, 2026)).toBeCloseTo(leistungsentgeltMonthly * 0.6, 2); // ~2893.93
  });

  it("never increases once gross rises past the ceiling", () => {
    const atCeiling = alg1MonthlyNet(8450, false, 2026);
    const wellAbove = alg1MonthlyNet(30000, false, 2026);
    expect(wellAbove).toBeCloseTo(atCeiling, 2);
  });

  it("produces a maximum well below the old flat-rate approximation's ~4005/mo", () => {
    // Sanity check against the bug this replaced: a flat 21% deduction
    // rate produced an unrealistically high implied maximum. The real
    // Steuerklasse-I-based notional tax deduction removes a much larger
    // share at the top of the income range.
    expect(alg1MonthlyNet(20000, false, 2026)).toBeLessThan(3200);
  });
});
