import { describe, expect, it } from "vitest";
import { healthInsuranceOutgoings } from "./health-insurance-outgoing";
import type { HouseholdMember } from "@/lib/types";

function member(overrides: Partial<HouseholdMember> & Pick<HouseholdMember, "id" | "name">): HouseholdMember {
  return {
    created_at: "",
    date_of_birth: null,
    statutory_health_insurance: false,
    health_insurance_addon_rate: null,
    private_health_insurance_monthly_premium: 600,
    count_private_health_insurance_as_outgoing: true,
    ...overrides,
  };
}

describe("healthInsuranceOutgoings", () => {
  it("synthesizes an essential 'insurance' commitment for a PKV member with a premium set", () => {
    const [row] = healthInsuranceOutgoings([member({ id: "alice", name: "Alice" })], "p1");
    expect(row).toMatchObject({
      profile_id: "p1",
      category: "insurance",
      amount: 600,
      frequency: "monthly",
      essential: true,
      end_date: null,
    });
    expect(row.name).toContain("Alice");
  });

  it("excludes a statutory (GKV) member entirely", () => {
    const rows = healthInsuranceOutgoings(
      [member({ id: "bob", name: "Bob", statutory_health_insurance: true })],
      "p1"
    );
    expect(rows).toEqual([]);
  });

  it("excludes a PKV member who opted out via count_private_health_insurance_as_outgoing", () => {
    const rows = healthInsuranceOutgoings(
      [member({ id: "carol", name: "Carol", count_private_health_insurance_as_outgoing: false })],
      "p1"
    );
    expect(rows).toEqual([]);
  });

  it("excludes a PKV member with no premium set", () => {
    const rows = healthInsuranceOutgoings(
      [member({ id: "dave", name: "Dave", private_health_insurance_monthly_premium: null })],
      "p1"
    );
    expect(rows).toEqual([]);
  });

  it("applies a cutoff end_date only to the member present in cutoffByMember", () => {
    const rows = healthInsuranceOutgoings(
      [member({ id: "alice", name: "Alice" }), member({ id: "erin", name: "Erin" })],
      "p1",
      new Map([["alice", "2027-03-31"]])
    );
    expect(rows.find((r) => r.id === "health-insurance-alice")?.end_date).toBe("2027-03-31");
    expect(rows.find((r) => r.id === "health-insurance-erin")?.end_date).toBeNull();
  });
});
