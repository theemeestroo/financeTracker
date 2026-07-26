export type HouseholdMember = {
  id: string;
  name: string;
  created_at: string;
};

export type CommitmentCategory =
  | "housing"
  | "utilities"
  | "insurance"
  | "subscriptions"
  | "debt_loans"
  | "transport"
  | "childcare_education"
  | "healthcare"
  | "groceries_living"
  | "leisure_discretionary"
  | "savings_investment"
  | "one_off"
  | "other";

export type Frequency = "monthly" | "quarterly" | "annual";
export type CommitmentFrequency = Frequency | "one_off";
export type IncomeType = "salary" | "part_time" | "rental" | "other";

export type Commitment = {
  id: string;
  profile_id: string;
  name: string;
  category: CommitmentCategory;
  amount: number;
  frequency: CommitmentFrequency;
  essential: boolean;
  start_date: string;
  end_date: string | null;
};

/**
 * Who a commitment is attributed to, and in what proportion. Zero rows = a
 * general household cost attributed to no one in particular. One row at
 * 100% = fully individual. Two or more rows (summing to 100%) = shared,
 * split by percentage.
 */
export type CommitmentSplit = {
  id: string;
  commitment_id: string;
  household_member_id: string;
  percentage: number;
};

export type TaxProfile = {
  id: string;
  household_member_id: string;
  tax_class: 1 | 2 | 3 | 4 | 5 | 6;
  church_tax: boolean;
  church_tax_state: string | null;
  has_children: boolean;
  statutory_health_insurance: boolean;
  health_insurance_addon_rate: number | null;
};

export const TAX_CLASSES: { value: 1 | 2 | 3 | 4 | 5 | 6; label: string }[] = [
  { value: 1, label: "I — single" },
  { value: 2, label: "II — single parent" },
  { value: 3, label: "III — married, higher earner" },
  { value: 4, label: "IV — married, similar earners" },
  { value: 5, label: "V — married, lower earner" },
  { value: 6, label: "VI — second job" },
];

export const GERMAN_STATES: { value: string; label: string }[] = [
  { value: "BW", label: "Baden-Württemberg" },
  { value: "BY", label: "Bavaria" },
  { value: "BE", label: "Berlin" },
  { value: "BB", label: "Brandenburg" },
  { value: "HB", label: "Bremen" },
  { value: "HH", label: "Hamburg" },
  { value: "HE", label: "Hesse" },
  { value: "MV", label: "Mecklenburg-Vorpommern" },
  { value: "NI", label: "Lower Saxony" },
  { value: "NW", label: "North Rhine-Westphalia" },
  { value: "RP", label: "Rhineland-Palatinate" },
  { value: "SL", label: "Saarland" },
  { value: "SN", label: "Saxony" },
  { value: "ST", label: "Saxony-Anhalt" },
  { value: "SH", label: "Schleswig-Holstein" },
  { value: "TH", label: "Thuringia" },
];

export type Income = {
  id: string;
  profile_id: string;
  household_member_id: string;
  name: string;
  gross_amount: number;
  type: IncomeType;
  frequency: Frequency;
  start_date: string | null;
  end_date: string | null;
  tax_profile_id: string | null;
  /**
   * Salary-only compensation components, folded into gross/net by
   * lib/finance/income-gross.ts. Ignored for non-salary rows. Always 0 on
   * rows created before this feature — never retroactively defaulted to
   * the form's 100%/79% new-entry pre-fill.
   */
  christmas_bonus_pct: number;
  holiday_pay_pct: number;
  annual_bonus: number;
  /** How christmas_bonus_pct/holiday_pay_pct/annual_bonus show up: as one
   *  annual lump (gross+net computed separately from the recurring
   *  monthly figure) or smoothed into the recurring monthly gross/net. */
  bonus_distribution: BonusDistribution;
  /** Reference only — a non-cash benefit, excluded from gross/net entirely. */
  annual_car_allowance: number;
  /** Reference only — pre-tax deferred comp that never reaches the
   *  household as cash; excluded from gross/net, shown as its own total. */
  monthly_pension_contribution: number;
  /** A company car's monthly private-use cost — deducted straight from net
   *  pay (unlike the other components above, this one does reduce net).
   *  Distinct from `annual_car_allowance`, which is cash received. */
  monthly_company_car_cost: number;
};

export type BonusDistribution = "one_time" | "spread";

export const INCOME_BONUS_DISTRIBUTIONS: { value: BonusDistribution; label: string }[] = [
  { value: "one_time", label: "One-time payment per year" },
  { value: "spread", label: "Spread evenly across each month" },
];

export const COMMITMENT_CATEGORIES: { value: CommitmentCategory; label: string }[] = [
  { value: "housing", label: "Housing" },
  { value: "utilities", label: "Utilities" },
  { value: "insurance", label: "Insurance" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "debt_loans", label: "Debt / Loans" },
  { value: "transport", label: "Transport" },
  { value: "childcare_education", label: "Childcare / Education" },
  { value: "healthcare", label: "Healthcare" },
  { value: "groceries_living", label: "Groceries & Living" },
  { value: "leisure_discretionary", label: "Leisure / Discretionary" },
  { value: "savings_investment", label: "Savings / Investment" },
  { value: "one_off", label: "One-off" },
  { value: "other", label: "Other" },
];

export const COMMITMENT_FREQUENCIES: { value: CommitmentFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "one_off", label: "One-off" },
];

export const INCOME_FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

export const INCOME_TYPES: { value: IncomeType; label: string }[] = [
  { value: "salary", label: "Salary" },
  { value: "part_time", label: "Part-time" },
  { value: "rental", label: "Rental" },
  { value: "other", label: "Other" },
];

export type LivingProfile = {
  id: string;
  name: string;
  description: string | null;
  is_baseline: boolean;
};

export type SeveranceScenario = {
  id: string;
  name: string;
  household_member_id: string;
  employer_name: string | null;
  years_of_service: number | null;
  employment_start_date: string | null;
  monthly_base_salary: number | null;
  holiday_pay_pct: number | null;
  annual_bonus: number;
  annual_car_benefit: number;
  monthly_pension_contribution: number;
  severance_multiplier: number;
  include_bonus_in_calc: boolean;
  include_car_in_calc: boolean;
  include_garden_leave: boolean;
  notice_period_months: number | null;
  gross_severance_override: number | null;
  severance_start_date: string | null;
  starting_balance: number;
  notes: string | null;
};

export type ScenarioEventType = "one_off_outflow" | "one_off_inflow" | "recurring_income_start";

export type SeveranceScenarioEvent = {
  id: string;
  scenario_id: string;
  name: string;
  event_type: ScenarioEventType;
  amount: number | null;
  date: string;
  recurring_gross_amount: number | null;
  recurring_frequency: Frequency | null;
  recurring_tax_profile_id: string | null;
  recurring_end_date: string | null;
};

export type SeveranceScenarioPhase = {
  id: string;
  scenario_id: string;
  profile_id: string;
  start_date: string;
  label: string | null;
};

export const SCENARIO_EVENT_TYPES: { value: ScenarioEventType; label: string }[] = [
  { value: "one_off_outflow", label: "One-off outflow" },
  { value: "one_off_inflow", label: "One-off inflow" },
  { value: "recurring_income_start", label: "New recurring income starts" },
];

/** UI helper only — picks a `severance_multiplier` value, not persisted as its own field. */
export const SEVERANCE_MULTIPLIER_PRESETS: { value: number; tag: string; description: string }[] = [
  { value: 1, tag: "Minimum", description: "Statutory floor for voluntary packages" },
  { value: 1.5, tag: "Standard", description: "Common for AT staff at large German corporates" },
  { value: 1.75, tag: "Good", description: "Achievable with negotiation at director level" },
  { value: 2, tag: "Strong", description: "Long-tenured senior staff range" },
  { value: 2.5, tag: "Best case", description: "Exceptional — requires strong leverage or legal pressure" },
];
