import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { incomeBreakdownPerSplit } from "@/lib/finance/income-gross";
import { isActiveOn, firstOfMonth, addMonths } from "@/lib/finance/date-utils";
import { calculateNetIncome } from "@/lib/tax";
import type { TaxProfile } from "@/lib/types";
import type {
  ResolvedSeveranceScenario,
  RunwayPhase,
  RunwayResult,
  RunwayPoint,
  RunwayLineItem,
} from "./types";

const DEFAULT_HORIZON_MONTHS = 120;

function activeProfileFor(date: string, phases: RunwayPhase[]): RunwayPhase {
  let active = phases[0];
  for (const phase of phases) {
    if (phase.startDate <= date) active = phase;
    else break;
  }
  return active;
}

/** That month's commitment spend for one profile, as signed (negative) line
 *  items — recurring-equivalent plus any one-off landing this month. */
function monthlyCommitmentItems(phase: RunwayPhase, date: string): RunwayLineItem[] {
  const items: RunwayLineItem[] = [];
  for (const c of phase.profile.commitments) {
    if (c.frequency === "one_off") {
      if (firstOfMonth(c.start_date) === date) items.push({ label: c.name, amount: -c.amount });
      continue;
    }
    if (isActiveOn(c.start_date, c.end_date, date)) {
      items.push({ label: c.name, amount: -toMonthlyEquivalent(c.amount, c.frequency) });
    }
  }
  return items;
}

/** That month's net income for one profile, per split share, as signed
 *  (positive) line items — split shares of the same income row are merged
 *  into one item, since the breakdown is household-level, not per-person. */
function monthlyIncomeItems(
  phase: RunwayPhase,
  date: string,
  taxProfileByMember: Map<string, TaxProfile>,
  year: number
): RunwayLineItem[] {
  const items: RunwayLineItem[] = [];
  for (const i of phase.profile.income) {
    if (!isActiveOn(i.start_date, i.end_date, date)) continue;
    // Recurring-only, same as the dashboard: a one-time annual bonus isn't
    // timed to a specific month in this data model, so it's deliberately
    // excluded from the month-by-month projection rather than guessed at.
    let net = 0;
    for (const share of incomeBreakdownPerSplit(i, i.splits, taxProfileByMember, year)) {
      // No tax profile yet (or unattributed, zero-split income) — gross
      // fallback, same as the dashboard's documented gap. Unlike the
      // dashboard's totals, the runway never silently drops real cash flow.
      net += share.net ? share.net.recurringMonthlyNet : share.gross.recurringMonthlyGross;
    }
    if (net !== 0) items.push({ label: i.name, amount: net });
  }
  return items;
}

/**
 * Month-by-month balance projection for a severance scenario (DESIGN §7).
 *
 * Walks forward from the earliest severance stream's start date. Each stream
 * (one per person taking severance) contributes garden-leave pay for its own
 * notice window, then its own net severance lump sum when that ends —
 * streams run independently and simply sum together. Every month, whichever
 * phase's `startDate` is the most recent one at or before that month
 * supplies the active commitments/income — a wholesale profile swap, not an
 * incremental diff. One-off commitments and scenario events land in their
 * own occurrence month only.
 */
export function projectRunway(scenario: ResolvedSeveranceScenario): RunwayResult {
  if (scenario.phases.length === 0 || scenario.severances.length === 0) {
    return { series: [], depletionDate: null, lowestBalance: 0, lowestBalanceDate: null };
  }

  const horizon = scenario.horizonMonths ?? DEFAULT_HORIZON_MONTHS;
  const startMonth = firstOfMonth(
    scenario.severances.reduce(
      (earliest, s) => (s.severanceStartDate < earliest ? s.severanceStartDate : earliest),
      scenario.severances[0].severanceStartDate
    )
  );
  const streams = scenario.severances.map((s) => ({
    ...s,
    startMonth: firstOfMonth(s.severanceStartDate),
    gardenLeaveEndMonth: s.includeGardenLeave
      ? addMonths(firstOfMonth(s.severanceStartDate), Math.round(s.noticePeriodMonths))
      : firstOfMonth(s.severanceStartDate),
    algStartMonth: firstOfMonth(s.algStartDate),
    algEndMonth: firstOfMonth(s.algEndDate),
    newJobStartMonth: s.newJobStartDate ? firstOfMonth(s.newJobStartDate) : null,
  }));

  let balance = scenario.startingBalance;
  const series: RunwayPoint[] = [];
  let depletionDate: string | null = null;
  let lowestBalance = Infinity;
  let lowestBalanceDate: string | null = null;

  const activeRecurringEvents: {
    name: string;
    grossAmount: number;
    frequency: NonNullable<ResolvedSeveranceScenario["events"][number]["recurringFrequency"]>;
    taxProfile: TaxProfile | null;
    endDate: string | null;
  }[] = [];

  for (let m = 0; m < horizon; m++) {
    const date = addMonths(startMonth, m);
    const phase = activeProfileFor(date, scenario.phases);

    const commitmentItems = monthlyCommitmentItems(phase, date);
    const monthlyCost = -commitmentItems.reduce((sum, i) => sum + i.amount, 0);
    const items: RunwayLineItem[] = [
      ...commitmentItems,
      ...monthlyIncomeItems(phase, date, scenario.taxProfileByMember, scenario.taxYear),
    ];

    for (const stream of streams) {
      if (date < stream.startMonth) continue;
      if (stream.includeGardenLeave && date < stream.gardenLeaveEndMonth) {
        items.push({
          label: `${stream.householdMemberName} — garden leave (net)`,
          amount: stream.gardenLeaveNetMonthly,
        });
      }
      if (date === stream.gardenLeaveEndMonth) {
        items.push({
          label: `${stream.householdMemberName} — severance lump sum (net)`,
          amount: stream.netSeveranceLumpSum,
        });
      }

      // ALG I income + post-severance health insurance — both stop the
      // moment a known re-employment date is reached (garden leave/lump sum
      // above are unaffected, they're already-earned money landing on a
      // fixed date regardless of what happens afterward).
      const reemployed = stream.newJobStartMonth != null && date >= stream.newJobStartMonth;
      if (!reemployed && date >= stream.gardenLeaveEndMonth) {
        const onAlg = stream.algMonthlyNet > 0 && date >= stream.algStartMonth && date < stream.algEndMonth;
        if (onAlg) {
          items.push({ label: `${stream.householdMemberName} — ALG I (net)`, amount: stream.algMonthlyNet });
        }
        const healthCost = onAlg ? stream.healthAlgMonthly : stream.healthGapMonthly;
        if (healthCost) {
          items.push({ label: `${stream.householdMemberName} — health insurance`, amount: -healthCost });
        }
      }
    }

    for (const event of scenario.events) {
      const eventMonth = firstOfMonth(event.date);
      if (eventMonth !== date) continue;

      if (event.eventType === "one_off_outflow") items.push({ label: event.name, amount: -(event.amount ?? 0) });
      else if (event.eventType === "one_off_inflow") items.push({ label: event.name, amount: event.amount ?? 0 });
      else if (event.eventType === "recurring_income_start" && event.recurringGrossAmount) {
        activeRecurringEvents.push({
          name: event.name,
          grossAmount: event.recurringGrossAmount,
          frequency: event.recurringFrequency ?? "monthly",
          taxProfile: event.recurringTaxProfile,
          endDate: event.recurringEndDate,
        });
      }
    }

    for (const rec of activeRecurringEvents) {
      if (rec.endDate && rec.endDate < date) continue;
      const amount = rec.taxProfile
        ? calculateNetIncome(rec.grossAmount, rec.frequency, rec.taxProfile, scenario.taxYear).netMonthly
        : toMonthlyEquivalent(rec.grossAmount, rec.frequency);
      items.push({ label: rec.name, amount });
    }

    const monthDelta = items.reduce((sum, i) => sum + i.amount, 0);
    balance += monthDelta;
    const breakdown = {
      inflows: items.filter((i) => i.amount > 0),
      outflows: items.filter((i) => i.amount < 0).map((i) => ({ label: i.label, amount: -i.amount })),
    };
    series.push({ date, balance, monthlyCost, breakdown });

    if (depletionDate === null && balance < 0) {
      depletionDate = date;
    }
    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestBalanceDate = date;
    }
  }

  return { series, depletionDate, lowestBalance, lowestBalanceDate };
}
