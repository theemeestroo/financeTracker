import { describe, expect, it } from "vitest";
import { calculateBaseIncomeTax, calculateIncomeTaxForClass } from "./wage-tax";
import { calculateSoli } from "./soli";

// Reference figures independently sourced (not derived from this codebase)
// from vermoegenszentrum.de's published Grundtabelle summaries — see
// lib/tax/parameters.ts header for the full source list. If these ever
// drift from official figures, that's a signal the year's parameters need
// re-checking, not that the formula is wrong.
describe("calculateBaseIncomeTax — 2025 reference figures", () => {
  it("zvE 60,000 → €14,415", () => {
    expect(calculateBaseIncomeTax(60000, 2025)).toBe(14415);
  });

  it("zvE 100,000 → €31,088 (42% flat zone)", () => {
    expect(calculateBaseIncomeTax(100000, 2025)).toBe(31088);
  });

  it("at/below the Grundfreibetrag → €0", () => {
    expect(calculateBaseIncomeTax(12096, 2025)).toBe(0);
    expect(calculateBaseIncomeTax(0, 2025)).toBe(0);
  });
});

describe("calculateBaseIncomeTax — 2026 reference figures", () => {
  it("zvE 60,000 → €14,233", () => {
    expect(calculateBaseIncomeTax(60000, 2026)).toBe(14233);
  });

  it("zvE 80,000 → €22,464 (42% flat zone)", () => {
    expect(calculateBaseIncomeTax(80000, 2026)).toBe(22464);
  });

  it("at/below the Grundfreibetrag → €0", () => {
    expect(calculateBaseIncomeTax(12348, 2026)).toBe(0);
  });
});

describe("calculateBaseIncomeTax — monotonicity and continuity", () => {
  it("is non-decreasing across zone boundaries", () => {
    const points = [0, 12096, 12097, 17443, 17444, 68480, 68481, 277825, 277826, 400000];
    let prev = -1;
    for (const zve of points) {
      const tax = calculateBaseIncomeTax(zve, 2025);
      expect(tax).toBeGreaterThanOrEqual(prev);
      prev = tax;
    }
  });

  it("has no discontinuous jump at the 42%/45% zone boundary", () => {
    const justBelow = calculateBaseIncomeTax(277825, 2026);
    const justAbove = calculateBaseIncomeTax(277826, 2026);
    expect(justAbove - justBelow).toBeLessThan(5);
  });
});

describe("calculateIncomeTaxForClass — Splittingverfahren (class III)", () => {
  it("class III on 2x income equals 2x the tax on half that income (by construction)", () => {
    const zve = 80000;
    const expected = 2 * calculateBaseIncomeTax(zve / 2, 2025);
    expect(calculateIncomeTaxForClass(zve, 3, 2025)).toBe(expected);
  });

  it("class III is never worse than class I for the same income", () => {
    const zve = 90000;
    const classIII = calculateIncomeTaxForClass(zve, 3, 2025);
    const classI = calculateIncomeTaxForClass(zve, 1, 2025);
    expect(classIII).toBeLessThanOrEqual(classI);
  });
});

describe("calculateSoli", () => {
  it("is €0 below the Freigrenze", () => {
    expect(calculateSoli(15000, 1, 2026)).toBe(0);
  });

  it("matches the published reference at zvE 80,000 / 2026 (~€252)", () => {
    const tax = calculateBaseIncomeTax(80000, 2026); // 22,464
    expect(calculateSoli(tax, 1, 2026)).toBeCloseTo(252, 0);
  });

  it("never exceeds 5.5% of income tax", () => {
    const tax = 50000;
    expect(calculateSoli(tax, 1, 2026)).toBeLessThanOrEqual(tax * 0.055 + 0.01);
  });
});
