import { describe, expect, it } from "vitest";
import { CHECKLIST_TEMPLATE, generateChecklistItems } from "./checklist";

describe("generateChecklistItems", () => {
  it("offsets every template item's due date from the anchor date", () => {
    const items = generateChecklistItems("2026-06-15");
    expect(items).toHaveLength(CHECKLIST_TEMPLATE.length);

    const byKey = new Map(items.map((i) => [i.template_key, i]));
    expect(byKey.get("meldepflicht")?.due_date).toBe("2026-03-17"); // -90 days
    expect(byKey.get("health_insurance_decision")?.due_date).toBe("2026-06-01"); // -14 days
    expect(byKey.get("aufhebungsvertrag_bedenkzeit")?.due_date).toBe("2026-06-08"); // -7 days
    expect(byKey.get("alg1_application")?.due_date).toBe("2026-06-15"); // 0 days
    expect(byKey.get("arbeitszeugnis")?.due_date).toBe("2026-06-15"); // 0 days
  });

  it("carries the template's label text through unchanged", () => {
    const items = generateChecklistItems("2026-01-01");
    const template = CHECKLIST_TEMPLATE.find((t) => t.key === "alg1_application")!;
    const generated = items.find((i) => i.template_key === "alg1_application")!;
    expect(generated.label).toBe(template.label);
  });
});
