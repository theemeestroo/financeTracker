import type { Commitment, Frequency, Income, TaxProfile } from "@/lib/types";

export type ResolvedRunwayProfile = {
  commitments: Commitment[];
  income: Income[];
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

export type ResolvedSeveranceScenario = {
  severanceStartDate: string;
  includeGardenLeave: boolean;
  noticePeriodMonths: number;
  gardenLeaveNetMonthly: number;
  /** Net severance (after tax) + any additional buffer — applied as a lump sum once garden leave ends. */
  netSeveranceLumpSum: number;
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
};

export type RunwayResult = {
  series: RunwayPoint[];
  depletionDate: string | null;
  lowestBalance: number;
  lowestBalanceDate: string | null;
};
