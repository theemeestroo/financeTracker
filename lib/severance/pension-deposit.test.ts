import { describe, expect, it } from "vitest";
import { resolvePensionDeposit, SEVERANCE_PENSION_DEPOSIT_DEFAULT } from "./pension-deposit";

describe("resolvePensionDeposit", () => {
  it("falls back to the coded default when nothing is set", () => {
    expect(resolvePensionDeposit(361333, null, null)).toBe(SEVERANCE_PENSION_DEPOSIT_DEFAULT);
  });

  it("uses the global default over the coded fallback", () => {
    expect(resolvePensionDeposit(361333, 30000, null)).toBe(30000);
  });

  it("a package override wins over the global default", () => {
    expect(resolvePensionDeposit(361333, 30000, 15000)).toBe(15000);
  });

  it("a package override of 0 opts out, even with a global default set", () => {
    expect(resolvePensionDeposit(361333, 30000, 0)).toBe(0);
  });

  it("clamps a negative resolved value to 0", () => {
    expect(resolvePensionDeposit(361333, -5000, null)).toBe(0);
  });

  it("clamps to severanceGross when the resolved deposit would exceed it", () => {
    expect(resolvePensionDeposit(20000, null, null)).toBe(20000);
  });
});
