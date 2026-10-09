import { toMonthlyEquivalent } from "@/lib/finance/frequency";
import { firstOfMonth, addMonths } from "@/lib/finance/date-utils";
import { calculateNetIncome, calculateCapitalGainsTax } from "@/lib/tax";
import { memberSharesOfAmount } from "@/lib/finance/splits";
import { isAccrualMonth, periodicAccrual, PERIODS_PER_YEAR } from "./savings";
import { activeProfileFor, monthlyIncomeItems, monthlyCommitmentItems } from "./monthly-items";
import type { TaxProfile } from "@/lib/types";
import type {
  ResolvedSeveranceScenario,
  RunwayResult,
  RunwayPoint,
  RunwayLineItem,
  RunwayEvent,
  PerMemberRunway,
} from "./types";

const DEFAULT_HORIZON_MONTHS = 120;

/** Folds `amount` into `memberDeltas` — a named member's own item goes
 *  straight to them, an unattributed one (no owner field exists at all for
 *  a one-off scenario event, say) divides evenly across `householdMemberIds`.
 *  Reuses `memberSharesOfAmount`'s same splits-or-even-fallback logic
 *  `monthly-items.ts` uses for commitments/income, just expressed as a
 *  single owner instead of a `Split[]`. */
/** A one-off event as one line per person with a share (labelled with
 *  their name and %), or a single household line when it has no split. */
function pushOneOffEvent(items: RunwayLineItem[], event: RunwayEvent, amount: number) {
  const splits = (event.memberSplits ?? []).filter((s) => s.percentage > 0);
  if (splits.length < 2) {
    items.push({ label: event.name, amount, householdMemberId: splits[0]?.household_member_id });
    return;
  }
  for (const s of splits) {
    items.push({
      label: `${event.name} — ${s.name ?? "Member"} (${Math.round(s.percentage * 100) / 100}%)`,
      amount: amount * (s.percentage / 100),
      householdMemberId: s.household_member_id,
    });
  }
}

function attributeToMember(
  memberDeltas: Map<string, number>,
  memberId: string | undefined,
  amount: number,
  householdMemberIds: string[],
  explicitSplits?: { household_member_id: string; percentage: number }[] | null
) {
  if (amount === 0) return;
  const splits =
    explicitSplits && explicitSplits.length > 0
      ? explicitSplits
      : memberId
        ? [{ household_member_id: memberId, percentage: 100 }]
        : [];
  for (const [id, share] of memberSharesOfAmount(amount, splits, householdMemberIds)) {
    memberDeltas.set(id, (memberDeltas.get(id) ?? 0) + share);
  }
}

/**
 * Month-by-month balance projection for a severance scenario (DESIGN §7).
 *
 * Walks forward from the earliest severance stream's start date. Each stream
 * (one per person taking severance) contributes garden-leave pay for its own
 * notice window, then its own net severance lump sum at its own payment
 * month (`severancePaymentDate` — defaults to the same month garden leave
 * ends, but can land later when set separately, e.g. for a tax-year timing
 * choice), then — often a year or more later — its own Fünftelregelung
 * refund at `refundDate`, if any (2025+ law: the employer withholds at the
 * ordinary marginal rate, so the Fünftelregelung benefit only arrives once
 * the tax return is processed) — streams run independently and simply sum
 * together. Every month, whichever
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
    // Where the later Fünftelregelung refund lands, if any — independent
    // month from paymentMonth above, often a year or more later.
    refundMonth: s.refundDate ? firstOfMonth(s.refundDate) : null,
    algStartMonth: firstOfMonth(s.algStartDate),
    algEndMonth: firstOfMonth(s.algEndDate),
    newJobStartMonth: s.newJobStartDate ? firstOfMonth(s.newJobStartDate) : null,
  }));

  const householdMemberIds = scenario.householdMemberIds ?? [];
  let balance = scenario.startingBalance;
  // Each member's own prorated sub-balance, seeded from an even share of
  // the starting balance (there's no data attributing the household's
  // existing savings to one person over another) — every month's delta is
  // then divided the same way `items` themselves are attributed (see
  // `attributeToMember`/`monthly-items.ts`'s `memberDeltas`), so these
  // always sum back to `balance`. Empty when the scenario didn't supply a
  // roster — per-member tracking is then skipped entirely below.
  const memberBalances = new Map<string, number>(
    householdMemberIds.map((id) => [id, householdMemberIds.length > 0 ? balance / householdMemberIds.length : 0])
  );
  const memberDepletionDate = new Map<string, string | null>(householdMemberIds.map((id) => [id, null]));
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

    const { items: commitmentItems, memberDeltas: commitmentMemberDeltas } = monthlyCommitmentItems(
      phase,
      date,
      householdMemberIds
    );
    const { items: incomeItems, memberDeltas: incomeMemberDeltas } = monthlyIncomeItems(
      phase,
      date,
      scenario.taxProfileByMember,
      scenario.taxYear,
      householdMemberIds
    );
    const monthlyCost = -commitmentItems.reduce((sum, i) => sum + i.amount, 0);
    const items: RunwayLineItem[] = [...commitmentItems, ...incomeItems];

    // Commitments/income already come fully prorated (percentage-split
    // where set, evenly divided where not) — merge them in directly rather
    // than through `attributeToMember`, which only knows a single owner or
    // none and would collapse a real 70/30 split back down to an even one.
    const monthMemberDeltas = new Map<string, number>();
    for (const [id, amount] of commitmentMemberDeltas) {
      monthMemberDeltas.set(id, (monthMemberDeltas.get(id) ?? 0) + amount);
    }
    for (const [id, amount] of incomeMemberDeltas) {
      monthMemberDeltas.set(id, (monthMemberDeltas.get(id) ?? 0) + amount);
    }

    for (const stream of streams) {
      if (date < stream.startMonth) continue;
      if (stream.includeGardenLeave && date < stream.gardenLeaveEndMonth) {
        items.push({
          label: `${stream.householdMemberName} — garden leave (net)`,
          amount: stream.gardenLeaveNetMonthly,
          householdMemberId: stream.householdMemberId,
          grossAmount: stream.gardenLeaveGrossMonthly,
        });
        attributeToMember(monthMemberDeltas, stream.householdMemberId, stream.gardenLeaveNetMonthly, householdMemberIds);
      }
      if (date === stream.paymentMonth) {
        items.push({
          label: `${stream.householdMemberName} — severance lump sum (net)`,
          amount: stream.netSeveranceLumpSum,
          householdMemberId: stream.householdMemberId,
        });
        attributeToMember(monthMemberDeltas, stream.householdMemberId, stream.netSeveranceLumpSum, householdMemberIds);
      }
      if (stream.refundAmount !== 0 && stream.refundMonth && date === stream.refundMonth) {
        items.push({
          label: `${stream.householdMemberName} — Fünftelregelung refund (tax return)`,
          amount: stream.refundAmount,
          householdMemberId: stream.householdMemberId,
        });
        attributeToMember(monthMemberDeltas, stream.householdMemberId, stream.refundAmount, householdMemberIds);
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
          attributeToMember(monthMemberDeltas, stream.householdMemberId, stream.algMonthlyNet, householdMemberIds);
        }
        const healthCost = onAlg ? stream.healthAlgMonthly : stream.healthGapMonthly;
        if (healthCost) {
          items.push({
            label: `${stream.householdMemberName} — health insurance`,
            amount: -healthCost,
            householdMemberId: stream.householdMemberId,
          });
          attributeToMember(monthMemberDeltas, stream.householdMemberId, -healthCost, householdMemberIds);
        }
      }
    }

    for (const event of scenario.events) {
      const eventMonth = firstOfMonth(event.date);
      if (eventMonth !== date) continue;

      if (event.eventType === "one_off_outflow") {
        const amount = -(event.amount ?? 0);
        pushOneOffEvent(items, event, amount);
        attributeToMember(monthMemberDeltas, undefined, amount, householdMemberIds, event.memberSplits);
      } else if (event.eventType === "one_off_inflow") {
        const amount = (event.amount ?? 0);
        pushOneOffEvent(items, event, amount);
        attributeToMember(monthMemberDeltas, undefined, amount, householdMemberIds, event.memberSplits);
      } else if (event.eventType === "recurring_income_start" && event.recurringGrossAmount) {
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
      attributeToMember(monthMemberDeltas, rec.taxProfile?.household_member_id, amount, householdMemberIds);
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
      attributeToMember(monthMemberDeltas, rule.householdMemberId || undefined, netAccrued, householdMemberIds);
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

    // Each member's own sub-balance, updated by their own share of this
    // month's delta (already fully attributed above — commitments/income
    // via their own memberDeltas, everything else via attributeToMember) —
    // always sums to `balance` by construction.
    let balanceByMember: Record<string, number> | undefined;
    if (householdMemberIds.length > 0) {
      balanceByMember = {};
      for (const id of householdMemberIds) {
        const updated = (memberBalances.get(id) ?? 0) + (monthMemberDeltas.get(id) ?? 0);
        memberBalances.set(id, updated);
        balanceByMember[id] = updated;
        if (memberDepletionDate.get(id) === null && updated < 0) memberDepletionDate.set(id, date);
      }
    }

    const breakdown = {
      inflows: items.filter((i) => i.amount > 0),
      outflows: items.filter((i) => i.amount < 0).map((i) => ({ ...i, amount: -i.amount })),
    };
    series.push({ date, balance, monthlyCost, breakdown, balanceByMember });

    if (depletionDate === null && balance < 0) {
      depletionDate = date;
    }
    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestBalanceDate = date;
    }
  }

  const perMember: PerMemberRunway[] | undefined =
    householdMemberIds.length > 0
      ? householdMemberIds.map((id) => ({
          householdMemberId: id,
          depletionDate: memberDepletionDate.get(id) ?? null,
        }))
      : undefined;

  return { series, depletionDate, lowestBalance, lowestBalanceDate, perMember };
}
