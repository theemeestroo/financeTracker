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
 * notice window, then its own net severance lump sum at its own payment
 * month (`severancePaymentDate` — defaults to the same month garden leave
 * ends, but can land later when set separately, e.g. for a tax-year timing
 * choice) — streams run independently and simply sum together. Every month, whichever
 * phase's `startDate` is the most recent one at or before that month
 * supplies the active commitments/income — a wholesale profile swap, not an
 * incremental diff. One-off commitments and scenario events land in their
 * own occurrence month only. Savings/investment rules (`lib/runway/savings.ts`)
 * compound as their own segregated pot — seeded from `principal`, growing
 * on their own return each accrual boundary from their own start month —
 * so unrelated cash flows (salary, ALG I, another package's severance)
 * never inflate the accrued income. Each month's end, though, every pot is
 * capped to the household's actual balance (shrunk proportionally if it's
 * more than one pot), since invested money is still part of the same net
 * worth: if overall spending draws the real balance below what the pots
 * claim is invested, the shortfall must have come out of the pots too.
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
    // Where the lump sum itself lands — independent of gardenLeaveEndMonth
    // above, which still governs garden leave pay/ALG I/health-insurance
    // timing regardless of when the money is actually paid.
    paymentMonth: firstOfMonth(s.severancePaymentDate),
    algStartMonth: firstOfMonth(s.algStartDate),
    algEndMonth: firstOfMonth(s.algEndDate),
    newJobStartMonth: s.newJobStartDate ? firstOfMonth(s.newJobStartDate) : null,
  }));

  let balance = scenario.startingBalance;
  // Each savings rule's own segregated pot — seeded from its resolved
  // principal the moment its own `startMonth` arrives, not before (the
  // money isn't invested until the severance lump sum it comes from has
  // actually landed in `balance`) — then compounds on its own gross
  // accrual, independent of `balance` above (see ResolvedSavingsRule's own
  // comment for why). Seeding eagerly here would let an unfunded rule's
  // full principal count toward `totalPots` below for months before its
  // money exists, which — since real `balance` hasn't received that
  // severance yet either — would trip the "shrink pots to fit the real
  // balance" safeguard immediately and permanently, even though nothing
  // was ever actually overspent.
  const pots = new Map<string, number>();
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
      if (date === stream.paymentMonth) {
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

    // Each rule accrues against its own pot (seeded from principal, grown
    // by its own prior periods' gross return) — not `balance` above, so
    // this month's other income/commitments/lump sums never feed into it.
    for (const rule of scenario.savingsRules) {
      if (date >= rule.startMonth && !pots.has(rule.id)) pots.set(rule.id, rule.principal);
      if (!isAccrualMonth(rule, date)) continue;
      const potBalance = pots.get(rule.id) ?? rule.principal;
      const grossAccrued = periodicAccrual(rule, potBalance);
      if (grossAccrued === 0) continue;
      pots.set(rule.id, potBalance + grossAccrued);

      // Investment returns are taxable income (Abgeltungsteuer) — a real
      // gain is netted via the rule's own household member's tax profile;
      // a negative accrual (a loss on the pot) isn't a taxable event and
      // passes through unchanged, same as any other cost.
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

    // Invested money isn't a separate untouchable account — it's part of
    // the same net worth `balance` tracks. If this month's spending has
    // drawn the household's actual balance below what the pots claim is
    // invested, the shortfall can only have come out of the pots
    // themselves, so scale every pot down (proportionally, if there's more
    // than one) until their total fits inside the real balance — wiped to
    // 0 entirely if balance itself has gone negative. This only shrinks
    // pots going forward; it never rewrites a period's already-recorded
    // accrual, and a pot never grows back on its own once drawn down.
    const totalPots = Array.from(pots.values()).reduce((sum, v) => sum + v, 0);
    if (totalPots > 0 && balance < totalPots) {
      const scale = Math.max(0, balance) / totalPots;
      for (const [ruleId, potValue] of pots) {
        pots.set(ruleId, potValue * scale);
      }
    }

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
