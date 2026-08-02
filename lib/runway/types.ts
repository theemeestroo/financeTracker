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
  name: string;
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
 *  then (optionally) ALG I income and a post-severance health-insurance
 *  cost, all on its own timeline. A scenario sums one or more of these. */
export type SeveranceStream = {
  householdMemberId: string;
  /** Display-only — used to label this stream's line items in a month breakdown. */
  householdMemberName: string;
  severanceStartDate: string;
  includeGardenLeave: boolean;
  noticePeriodMonths: number;
  gardenLeaveNetMonthly: number;
  /** Net severance (after tax) only — the scenario's starting balance is applied separately. */
  netSeveranceLumpSum: number;
  /** ALG I monthly net amount; 0 when not eligible/not claiming. */
  algMonthlyNet: number;
  /** Natural claim start (garden-leave end, or severance start) plus any deferral. Ignored when algMonthlyNet is 0. */
  algStartDate: string;
  /** algStartDate plus the eligible duration. Ignored when algMonthlyNet is 0. */
  algEndDate: string;
  /** Re-employment date, if known — truncates ALG I income and the health-insurance gap/ALG-I cost from this date on. */
  newJobStartDate: string | null;
  /** Monthly health-insurance cost during a self-funded gap (before ALG I starts, or if not claiming). */
  healthGapMonthly: number;
  /** Monthly health-insurance cost while on ALG I. */
  healthAlgMonthly: number;
  /** Gross equivalent of gardenLeaveNetMonthly (the package's own monthly
   *  base salary) — garden leave is ordinary wage income, so it feeds the
   *  annual tax summary's regular-income bracket bar. */
  gardenLeaveGrossMonthly: number;
};

/** One savings/investment rule, fully resolved (amount vs.
 *  percentage-of-severance already settled to a share — see
 *  `SeveranceScenarioSavingsRule`). The return is **not** a segregated pot
 *  compounding on its own — it's `allocationFraction` of the household's
 *  *actual* running balance, recalculated fresh every accrual period
 *  against that period's own opening balance (before that month's other
 *  cash flows), so it rises when income/lump sums land and falls as the
 *  household spends its runway down. Accrues from `startMonth` (the
 *  package's own severance-lump-sum month) at `accrualFrequency`, added to
 *  the projection as income. */
export type ResolvedSavingsRule = {
  id: string;
  /** The rule's own package's household member — whose tax profile (Soli/
   *  church-tax/married-allowance status) applies when netting the accrual
   *  via Abgeltungsteuer (lib/tax/capital-gains-tax.ts). */
  householdMemberId: string;
  /** Display-only — labels this rule's accrual line items in a month breakdown. */
  label: string;
  /** Share (0–1) of the household's running balance this rule assumes is
   *  invested — resolved once from amount/percentage at setup (percentage
   *  → straight fraction; amount → amount ÷ that package's own severance
   *  base, a one-time calibration), then reapplied every period against
   *  the real balance rather than tracked as its own fixed sum. */
  allocationFraction: number;
  annualReturnPct: number;
  accrualFrequency: "monthly" | "quarterly" | "annually";
  startMonth: string;
};

export type ResolvedSeveranceScenario = {
  /** Seeds the balance at month 0 (household savings/buffer, not tied to any one person's severance). */
  startingBalance: number;
  /** Always at least one. The projection starts at the earliest stream's severanceStartDate. */
  severances: SeveranceStream[];
  /** Sorted ascending by startDate; always at least one (the baseline phase). */
  phases: RunwayPhase[];
  events: RunwayEvent[];
  savingsRules: ResolvedSavingsRule[];
  taxProfileByMember: Map<string, TaxProfile>;
  taxYear: number;
  /** Months to project forward. Defaults to 120 (10 years). */
  horizonMonths?: number;
};

export type RunwayLineItem = {
  label: string;
  /** Always a positive magnitude — which bucket (inflows/outflows) it's in carries the sign. */
  amount: number;
  /** Who this line item belongs to — set only when unambiguous (income
   *  shared across 2+ people, or household-level items like savings
   *  accrual, are left unattributed). Used to attribute income to a
   *  person's annual tax summary (lib/tax/annual-tax-summary.ts), not
   *  shown directly in the cash-flow breakdown panel. */
  householdMemberId?: string;
  /** Gross equivalent of `amount` — undefined for outflows, tax-exempt
   *  income (see `taxExempt`), and income whose tax treatment is handled
   *  elsewhere (the severance lump sum, resolved via its own
   *  Fünftelregelung figures). Feeds the progressive wage-tax bracket bar
   *  unless `investmentIncome` redirects it to the flat-tax bucket instead. */
  grossAmount?: number;
  /** True for income that's tax-exempt at the wage-tax level (ALG I) — the
   *  German Progressionsvorbehalt effect (tax-free but still nudges the
   *  rate on other income) isn't modeled; this just keeps it out of the
   *  progressive-bracket view rather than mislabeling it as untaxed wages. */
  taxExempt?: boolean;
  /** True for savings/investment accrual — `grossAmount` here is capital
   *  income taxed under the flat Abgeltungsteuer (lib/tax/capital-gains-tax.ts),
   *  not the progressive wage-tax bands, so the annual tax summary routes
   *  it to its own bucket instead of the regular-income one. */
  investmentIncome?: boolean;
};

/** Every cash-flow line making up one month's balance change, split by
 *  direction so a UI can show a segmented bar plus an itemized list. */
export type RunwayMonthBreakdown = {
  inflows: RunwayLineItem[];
  outflows: RunwayLineItem[];
};

export type RunwayPoint = {
  date: string;
  balance: number;
  /** That month's recurring + one-off commitment spend (not net cash flow) —
   *  optional so callers plotting a plain {date,balance} series (e.g. the
   *  dashboard's historical trend) don't need to supply it. */
  monthlyCost?: number;
  /** Itemized income/outgoings behind that month's balance change. Optional
   *  for the same reason as monthlyCost — plain {date,balance} callers skip it. */
  breakdown?: RunwayMonthBreakdown;
};

export type RunwayResult = {
  series: RunwayPoint[];
  depletionDate: string | null;
  lowestBalance: number;
  lowestBalanceDate: string | null;
};
