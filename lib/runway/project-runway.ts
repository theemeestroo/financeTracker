import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { incomeBreakdownPerSplit } from "@/lib/finance/income-gross";
import { isActiveOn, firstOfMonth, addMonths } from "@/lib/finance/date-utils";
import { calculateNetIncome } from "@/lib/tax";
import type { TaxProfile } from "@/lib/types";
import type { ResolvedSeveranceScenario, RunwayPhase, RunwayResult, RunwayPoint } from "./types";

const DEFAULT_HORIZON_MONTHS = 120;

function activeProfileFor(date: string, phases: RunwayPhase[]): RunwayPhase {
  let active = phases[0];
  for (const phase of phases) {
    if (phase.startDate <= date) active = phase;
    else break;
  }
  return active;
}

/** That month's commitment spend for one profile — recurring-equivalent plus any one-off landing this month. */
function monthlyCommitmentsCost(phase: RunwayPhase, date: string): number {
  let cost = 0;
  for (const c of phase.profile.commitments) {
    if (c.frequency === "one_off") {
      if (firstOfMonth(c.start_date) === date) cost += c.amount;
      continue;
    }
    if (isActiveOn(c.start_date, c.end_date, date)) {
      cost += toMonthlyEquivalent(c.amount, c.frequency);
    }
  }
  return cost;
}

/** That month's net income for one profile, per split share. */
function monthlyIncomeNet(
  phase: RunwayPhase,
  date: string,
  taxProfileByMember: Map<string, TaxProfile>,
  year: number
): number {
  let net = 0;
  for (const i of phase.profile.income) {
    if (!isActiveOn(i.start_date, i.end_date, date)) continue;
    // Recurring-only, same as the dashboard: a one-time annual bonus isn't
    // timed to a specific month in this data model, so it's deliberately
    // excluded from the month-by-month projection rather than guessed at.
    for (const share of incomeBreakdownPerSplit(i, i.splits, taxProfileByMember, year)) {
      // No tax profile yet (or unattributed, zero-split income) — gross
      // fallback, same as the dashboard's documented gap. Unlike the
      // dashboard's totals, the runway never silently drops real cash flow.
      net += share.net ? share.net.recurringMonthlyNet : share.gross.recurringMonthlyGross;
    }
  }
  return net;
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
  }));

  let balance = scenario.startingBalance;
  const series: RunwayPoint[] = [];
  let depletionDate: string | null = null;
  let lowestBalance = Infinity;
  let lowestBalanceDate: string | null = null;

  const activeRecurringEvents: {
    grossAmount: number;
    frequency: NonNullable<ResolvedSeveranceScenario["events"][number]["recurringFrequency"]>;
    taxProfile: TaxProfile | null;
    endDate: string | null;
  }[] = [];

  for (let m = 0; m < horizon; m++) {
    const date = addMonths(startMonth, m);
    const phase = activeProfileFor(date, scenario.phases);

    const monthlyCost = monthlyCommitmentsCost(phase, date);
    let monthDelta =
      monthlyIncomeNet(phase, date, scenario.taxProfileByMember, scenario.taxYear) - monthlyCost;

    for (const stream of streams) {
      if (date < stream.startMonth) continue;
      if (stream.includeGardenLeave && date < stream.gardenLeaveEndMonth) {
        monthDelta += stream.gardenLeaveNetMonthly;
      }
      if (date === stream.gardenLeaveEndMonth) {
        monthDelta += stream.netSeveranceLumpSum;
      }
    }

    for (const event of scenario.events) {
      const eventMonth = firstOfMonth(event.date);
      if (eventMonth !== date) continue;

      if (event.eventType === "one_off_outflow") monthDelta -= event.amount ?? 0;
      else if (event.eventType === "one_off_inflow") monthDelta += event.amount ?? 0;
      else if (event.eventType === "recurring_income_start" && event.recurringGrossAmount) {
        activeRecurringEvents.push({
          grossAmount: event.recurringGrossAmount,
          frequency: event.recurringFrequency ?? "monthly",
          taxProfile: event.recurringTaxProfile,
          endDate: event.recurringEndDate,
        });
      }
    }

    for (const rec of activeRecurringEvents) {
      if (rec.endDate && rec.endDate < date) continue;
      monthDelta += rec.taxProfile
        ? calculateNetIncome(rec.grossAmount, rec.frequency, rec.taxProfile, scenario.taxYear).netMonthly
        : toMonthlyEquivalent(rec.grossAmount, rec.frequency);
    }

    balance += monthDelta;
    series.push({ date, balance, monthlyCost });

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
