import { describe, expect, it } from "vitest";
import { formatDateDisplay, formatMonthDisplay } from "./date-utils";

describe("formatDateDisplay", () => {
  it("converts ISO YYYY-MM-DD to DD/MM/YYYY", () => {
    expect(formatDateDisplay("2026-08-01")).toBe("01/08/2026");
    expect(formatDateDisplay("2026-12-31")).toBe("31/12/2026");
  });
});

describe("formatMonthDisplay", () => {
  it("converts an ISO date to MM/YYYY", () => {
    expect(formatMonthDisplay("2026-08-01")).toBe("08/2026");
    expect(formatMonthDisplay("2026-01-15")).toBe("01/2026");
  });
});
