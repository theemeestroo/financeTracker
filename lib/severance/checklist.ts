import { addDays } from "@/lib/finance/date-utils";

/**
 * Static redundancy admin task template (DESIGN v2 §2.7). Offsets are days
 * relative to the scenario's anchor date (the earliest severance_start_date
 * across its packages) — reasonable planning defaults, not exact statutory
 * deadlines (e.g. real Meldepflicht timing depends on when you *learn* your
 * end date, which this app doesn't separately track). Each generated item
 * is a plain checklist row afterward — editable/deletable like any other,
 * not re-derived from this template again.
 */
export type ChecklistTemplateItem = {
  key: string;
  label: string;
  offsetDays: number;
};

export const CHECKLIST_TEMPLATE: ChecklistTemplateItem[] = [
  {
    key: "meldepflicht",
    label: "Register as job-seeking (arbeitsuchend) with the Agentur für Arbeit",
    offsetDays: -90,
  },
  {
    key: "health_insurance_decision",
    label: "Decide on health insurance continuation (freiwillige GKV or PKV)",
    offsetDays: -14,
  },
  {
    key: "aufhebungsvertrag_bedenkzeit",
    label: "Use the Aufhebungsvertrag consideration period before signing",
    offsetDays: -7,
  },
  {
    key: "alg1_application",
    label: "Register as unemployed (arbeitslos) and apply for Arbeitslosengeld I",
    offsetDays: 0,
  },
  {
    key: "arbeitszeugnis",
    label: "Request a reference letter (Arbeitszeugnis)",
    offsetDays: 0,
  },
];

export type GeneratedChecklistItem = {
  template_key: string;
  label: string;
  due_date: string;
};

export function generateChecklistItems(anchorDate: string): GeneratedChecklistItem[] {
  return CHECKLIST_TEMPLATE.map((t) => ({
    template_key: t.key,
    label: t.label,
    due_date: addDays(anchorDate, t.offsetDays),
  }));
}
