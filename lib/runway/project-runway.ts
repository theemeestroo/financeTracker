import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { incomeGrossBreakdown, incomeNetBreakdown } from "@/lib/finance/income-gross";
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

/** Net monthly cash flow (income − commitments) for one profile on one month. */
function monthlyNetCashFlow(
  phase: RunwayPhase,
  date: string,
  taxProfileByMember: Map<string, TaxProfile>,
  year: number
): number {
  let net = 0;

  for (const c of phase.profile.commitments) {
    if (c.frequency === "one_off") {
      if (firstOfMonth(c.start_date) === date) net -= c.amount;
      continue;
    }
    if (isActiveOn(c.start_date, c.end_date, date)) {
      net -= toMonthlyEquivalent(c.amount, c.frequency);
    }
  }

  for (const i of phase.profile.income) {
    if (!isActiveOn(i.start_date, i.end_date, date)) continue;
    const taxProfile = taxProfileByMember.get(i.household_member_id);
    // Recurring-only, same as the dashboard: a one-time annual bonus isn't
    // timed to a specific month in this data model, so it's deliberately
    // excluded from the month-by-month projection rather than guessed at.
    net += taxProfile
      ? incomeNetBreakdown(i, taxProfile, year).recurringMonthlyNet
      : incomeGrossBreakdown(i).recurringMonthlyGross; // no tax profile yet — gross fallback, same as the dashboard's documented gap
  }

  return net;
}

/**
 * Month-by-month balance projection for a severance scenario (DESIGN §7).
 *
 * Walks forward from `severanceStartDate`: garden leave (if any) contributes
 * net monthly salary on top of ordinary cash flow for `noticePeriodMonths`;
 * once it ends, the net severance lump sum lands. Every month, whichever
 * phase's `startDate` is the most recent one at or before that month
 * supplies the active commitments/income — a wholesale profile swap, not an
 * incremental diff. One-off commitments and scenario events land in their
 * own occurrence month only.
 */
export function projectRunway(scenario: ResolvedSeveranceScenario): RunwayResult {
  if (scenario.phases.length === 0) {
    return { series: [], depletionDate: null, lowestBalance: 0, lowestBalanceDate: null };
  }

  const horizon = scenario.horizonMonths ?? DEFAULT_HORIZON_MONTHS;
  const startMonth = firstOfMonth(scenario.severanceStartDate);
  const gardenLeaveEndMonth = scenario.includeGardenLeave
    ? addMonths(startMonth, Math.round(scenario.noticePeriodMonths))
    : startMonth;

  let balance = 0;
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

    let monthDelta = monthlyNetCashFlow(phase, date, scenario.taxProfileByMember, scenario.taxYear);

    if (scenario.includeGardenLeave && date < gardenLeaveEndMonth) {
      monthDelta += scenario.gardenLeaveNetMonthly;
    }
    if (date === gardenLeaveEndMonth) {
      monthDelta += scenario.netSeveranceLumpSum;
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
    series.push({ date, balance });

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
