import type { Split } from "@/lib/finance/splits";
import type { Commitment, Frequency, Income, TaxProfile } from "@/lib/types";

/** An income row with its splits embedded — travels together instead of a
 *  second lookup map, since every consumer needs both at once. */
export type ResolvedIncome = Income & { splits: Split[] };

export type ResolvedRunwayProfile = {
  commitments: Commitment[];
  income: ResolvedIncome[];
};

export type RunwayPhase = {
  startDate: string;
  profile: ResolvedRunwayProfile;
};

export type RunwayEvent = {
  date: string;
  eventType: "one_off_outflow" | "one_off_inflow" | "recurring_income_start";
  amount: number | null;
  recurringGrossAmount: number | null;
  recurringFrequency: Frequency | null;
  recurringTaxProfile: TaxProfile | null;
  recurringEndDate: string | null;
};

/** One person's severance cash flow within a scenario — garden-leave pay
 *  (if any) for its own notice window, then its own net severance lump sum,
 *  all on its own timeline. A scenario sums one or more of these. */
export type SeveranceStream = {
  householdMemberId: string;
  severanceStartDate: string;
  includeGardenLeave: boolean;
  noticePeriodMonths: number;
  gardenLeaveNetMonthly: number;
  /** Net severance (after tax) only — the scenario's starting balance is applied separately. */
  netSeveranceLumpSum: number;
};

export type ResolvedSeveranceScenario = {
  /** Seeds the balance at month 0 (household savings/buffer, not tied to any one person's severance). */
  startingBalance: number;
  /** Always at least one. The projection starts at the earliest stream's severanceStartDate. */
  severances: SeveranceStream[];
  /** Sorted ascending by startDate; always at least one (the baseline phase). */
  phases: RunwayPhase[];
  events: RunwayEvent[];
  taxProfileByMember: Map<string, TaxProfile>;
  taxYear: number;
  /** Months to project forward. Defaults to 120 (10 years). */
  horizonMonths?: number;
};

export type RunwayPoint = {
  date: string;
  balance: number;
  /** That month's recurring + one-off commitment spend (not net cash flow) —
   *  optional so callers plotting a plain {date,balance} series (e.g. the
   *  dashboard's historical trend) don't need to supply it. */
  monthlyCost?: number;
};

export type RunwayResult = {
  series: RunwayPoint[];
  depletionDate: string | null;
  lowestBalance: number;
  lowestBalanceDate: string | null;
};
