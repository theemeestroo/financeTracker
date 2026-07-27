import { statutoryFloor } from "@/lib/severance";
import type { SeveranceScenarioPackage } from "@/lib/types";

/** Commonly-published Sperrzeit length for a redundancy exit — §159 SGB III. */
export const SPERRZEIT_WEEKS = 12;

export type SperrzeitAssessment = {
  atRisk: boolean;
  /** null when not at risk and not overridden. Explains which safe-harbor
   *  condition(s) failed, always ending in a "confirm with the Agentur"
   *  disclaimer — or, when overridden, explains that atRisk:false is the
   *  user's own assertion rather than a heuristic pass. */
  reason: string | null;
  /** True when `sperrzeit_safe_confirmed` bypassed the heuristic below. */
  overridden: boolean;
};

/**
 * Heuristic Sperrzeit risk flag — not a determination (see DESIGN v2 §7).
 * Safe harbor (no risk flagged) requires *both*:
 * - the notice period was effectively observed. Proxied here as garden leave
 *   modeled with a positive notice period, since a package with neither
 *   represents an immediate exit (the classic Sperrzeit trigger) in this
 *   app's data model — a documented simplification, not a legal test.
 * - the severance is at or below the §1a KSchG rule-of-thumb ceiling
 *   (`statutoryFloor` — 0.5 months' pay × years of service).
 *
 * `sperrzeit_safe_confirmed` lets a package skip this heuristic entirely —
 * for when the user already knows (e.g. from their lawyer or the Agentur
 * itself) that the exit agreement's actual wording avoids a Sperrzeit, which
 * the heuristic above can't detect from the numbers alone. It's the user's
 * own assertion, not a determination by this app.
 */
export function assessSperrzeitRisk(
  pkg: Pick<
    SeveranceScenarioPackage,
    "monthly_base_salary" | "years_of_service" | "include_garden_leave" | "notice_period_months"
  > & { sperrzeit_safe_confirmed?: boolean },
  severanceGross: number
): SperrzeitAssessment {
  if (pkg.sperrzeit_safe_confirmed) {
    return {
      atRisk: false,
      reason:
        "Sperrzeit risk manually waived — you've confirmed the exit agreement's actual wording avoids it, so ALG I is modeled starting right after garden leave/notice ends, without the 12-week delay. This is your own assertion, not a determination by this app.",
      overridden: true,
    };
  }

  const monthlyBase = pkg.monthly_base_salary ?? 0;
  const years = pkg.years_of_service ?? 0;
  const noticeObserved = pkg.include_garden_leave && (pkg.notice_period_months ?? 0) > 0;
  const floor = statutoryFloor(monthlyBase, years);
  const overFloor = severanceGross > floor;

  if (noticeObserved && !overFloor) {
    return { atRisk: false, reason: null, overridden: false };
  }

  const reasons: string[] = [];
  if (!noticeObserved) {
    reasons.push("the notice period doesn't appear to have been worked or paid out (no garden leave modeled)");
  }
  if (overFloor) {
    const impliedMultiple = monthlyBase > 0 && years > 0 ? severanceGross / (monthlyBase * years) : null;
    reasons.push(
      impliedMultiple != null
        ? `severance is ${impliedMultiple.toFixed(2)}× salary/year vs. the 0.5× safe-harbor formula`
        : "severance exceeds the 0.5× salary/year safe-harbor formula"
    );
  }

  return {
    atRisk: true,
    reason: `${reasons.join(" and ")} — a Sperrzeit is possible; confirm with the Agentur für Arbeit before relying on this timeline.`,
    overridden: false,
  };
}
