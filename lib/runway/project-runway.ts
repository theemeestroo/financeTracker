import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { firstOfMonth, addMonths } from "@/lib/finance/date-utils";
import { calculateNetIncome, calculateCapitalGainsTax } from "@/lib/tax";
import { isAccrualMonth, periodicAccrual, PERIODS_PER_YEAR } from "./savings";
import { activeProfileFor, monthlyIncomeItems, monthlyCommitmentItems } from "./monthly-items";
import type { TaxProfile } from "@/lib/types";
import type {
  ResolvedSeveranceScenario,
  RunwayResult,
  RunwayPoint,
  RunwayLineItem,
} from "./types";

const DEFAULT_HORIZON_MONTHS = 120;

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
 * own occurrence month only. Savings/investment rules (`lib/runway/savings.ts`)
 * apply their own return rate to a share of the *actual* running balance on
 * each accrual boundary from their own start month — not a segregated pot
 * compounding independently, so the accrued income rises and falls with the
 * household's real cash position.
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
          householdMemberId: stream.householdMemberId,
          grossAmount: stream.gardenLeaveGrossMonthly,
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
          items.push({
            label: `${stream.householdMemberName} — ALG I (net)`,
            amount: stream.algMonthlyNet,
            householdMemberId: stream.householdMemberId,
            taxExempt: true,
          });
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
      const grossMonthly = toMonthlyEquivalent(rec.grossAmount, rec.frequency);
      const amount = rec.taxProfile
        ? calculateNetIncome(rec.grossAmount, rec.frequency, rec.taxProfile, scenario.taxYear).netMonthly
        : grossMonthly;
      items.push({
        label: rec.name,
        amount,
        householdMemberId: rec.taxProfile?.household_member_id,
        grossAmount: rec.taxProfile ? grossMonthly : undefined,
      });
    }

    // `balance` here is still this month's *opening* value — it isn't
    // mutated until `balance += monthDelta` below, so every savings rule
    // sees the same "start amount" for the month regardless of where in
    // this item-building sequence it runs, including relative to this same
    // month's own lump sum/income/commitments.
    for (const rule of scenario.savingsRules) {
      if (!isAccrualMonth(rule, date)) continue;
      const grossAccrued = periodicAccrual(rule, balance);
      if (grossAccrued === 0) continue;

      // Investment returns are taxable income (Abgeltungsteuer) — a real
      // gain is netted via the rule's own household member's tax profile;
      // a negative accrual (interest cost on a negative balance) isn't a
      // taxable event and passes through unchanged, same as any other cost.
      // The Sparerpauschbetrag is an *annual* allowance, so this
      // annualizes the period's own gross first (same steady-state
      // approximation `calculateNetIncome` already uses for wage income)
      // rather than letting each accrual period claim a fresh one.
      const profile = scenario.taxProfileByMember.get(rule.householdMemberId);
      let netAccrued = grossAccrued;
      if (profile && grossAccrued > 0) {
        const periodsPerYear = PERIODS_PER_YEAR[rule.accrualFrequency];
        const netAnnual = calculateCapitalGainsTax(grossAccrued * periodsPerYear, profile, scenario.taxYear).netAnnual;
        netAccrued = netAnnual / periodsPerYear;
      }

      items.push({
        label: `${rule.label} — investment return`,
        amount: netAccrued,
        householdMemberId: rule.householdMemberId || undefined,
        grossAmount: grossAccrued,
        investmentIncome: true,
      });
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
