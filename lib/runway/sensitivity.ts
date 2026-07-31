import { projectRunway } from "./project-runway";
import type { ResolvedSeveranceScenario } from "./types";
import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { COMMITMENT_CATEGORIES, type CommitmentCategory } from "@/lib/types";

export type SensitivityLineItem = {
  name: string;
  /** Monthly-equivalent amount, same convention as `monthlyAmount` below. */
  monthlyAmount: number;
};

export type SensitivityEntry = {
  category: CommitmentCategory;
  label: string;
  /** That category's non-essential monthly-equivalent spend, deduped across
   *  every phase (a commitment carried unchanged into a later phase would
   *  otherwise double-count) — context for how big a cut this actually is.
   *  Equals the sum of `lines`. */
  monthlyAmount: number;
  /** The individual non-essential commitments making up `monthlyAmount`,
   *  same dedup rule, sorted descending — the detail behind the summary
   *  line for a collapsible UI. */
  lines: SensitivityLineItem[];
  /** Months the depletion date moves out by. A lower bound (horizon end
   *  minus the baseline depletion month) when `becomesSustainable` is true,
   *  since there's no later depletion date to diff against. */
  monthsAdded: number;
  /** True when cutting this category pushes the projection past the
   *  horizon entirely — no depletion date left to report. */
  becomesSustainable: boolean;
  /** The scenario's own (uncut) depletion date — repeated on every entry
   *  rather than hoisted to a wrapper type, so a UI rendering one entry at
   *  a time (e.g. a collapsible row) doesn't need it threaded separately. */
  baselineDepletionDate: string;
  /** This category's own depletion date after the cut — null exactly when
   *  `becomesSustainable` is true. */
  newDepletionDate: string | null;
};

/**
 * "If you cut X, how much longer does this last?" (DESIGN v2 §2.6). For
 * every discretionary (essential = false) category present anywhere in the
 * scenario's phases, re-runs `projectRunway` with that category's
 * non-essential commitments removed and diffs the depletion date against
 * the baseline — ranked by months gained, most first.
 *
 * Returns an empty list when the baseline projection is already sustainable
 * within the horizon — there's no "lasts N months longer" story to tell
 * when nothing depletes in the first place.
 */
export function sensitivityAnalysis(scenario: ResolvedSeveranceScenario): SensitivityEntry[] {
  const baseline = projectRunway(scenario);
  if (!baseline.depletionDate) return [];
  const baselineIndex = baseline.series.findIndex((p) => p.date === baseline.depletionDate);
  const horizonLength = baseline.series.length;

  const linesByCategory = new Map<CommitmentCategory, SensitivityLineItem[]>();
  const seenCommitmentIds = new Set<string>();
  for (const phase of scenario.phases) {
    for (const c of phase.profile.commitments) {
      if (c.essential || seenCommitmentIds.has(c.id)) continue;
      seenCommitmentIds.add(c.id);
      const lines = linesByCategory.get(c.category) ?? [];
      lines.push({ name: c.name, monthlyAmount: toMonthlyEquivalent(c.amount, c.frequency) });
      linesByCategory.set(c.category, lines);
    }
  }

  const categoryLabel = (category: CommitmentCategory) =>
    COMMITMENT_CATEGORIES.find((c) => c.value === category)?.label ?? category;

  const entries: SensitivityEntry[] = [];
  for (const [category, lines] of linesByCategory) {
    const withCategoryCut: ResolvedSeveranceScenario = {
      ...scenario,
      phases: scenario.phases.map((phase) => ({
        ...phase,
        profile: {
          ...phase.profile,
          commitments: phase.profile.commitments.filter(
            (c) => c.essential || c.category !== category
          ),
        },
      })),
    };
    const cut = projectRunway(withCategoryCut);
    const becomesSustainable = !cut.depletionDate;
    // A non-depleting cut survives every month through the horizon's last
    // index, i.e. at least through index `horizonLength` (one past the last
    // computed point) — the lower bound this represents, not
    // `horizonLength - 1`, which would understate it by a month whenever
    // the baseline itself depleted right at the horizon's edge.
    const cutIndex = becomesSustainable
      ? horizonLength
      : cut.series.findIndex((p) => p.date === cut.depletionDate);

    entries.push({
      category,
      label: categoryLabel(category),
      monthlyAmount: lines.reduce((sum, l) => sum + l.monthlyAmount, 0),
      lines: lines.sort((a, b) => b.monthlyAmount - a.monthlyAmount),
      monthsAdded: cutIndex - baselineIndex,
      becomesSustainable,
      baselineDepletionDate: baseline.depletionDate,
      newDepletionDate: cut.depletionDate,
    });
  }

  return entries.sort((a, b) => b.monthsAdded - a.monthsAdded);
}
