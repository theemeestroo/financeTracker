export type HouseholdMember = {
  id: string;
  name: string;
  created_at: string;
  date_of_birth: string | null;
  statutory_health_insurance: boolean;
  health_insurance_addon_rate: number | null;
  private_health_insurance_monthly_premium: number | null;
  /** Only meaningful when statutory_health_insurance is false. Default true
   *  — see lib/finance/health-insurance-outgoing.ts for why the premium
   *  needs counting as an outgoing at all; this is the opt-out for anyone
   *  already tracking it some other way (e.g. a manual commitment). */
  count_private_health_insurance_as_outgoing: boolean;
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
  property_id: string | null;
  /** Snapshot of `amount` taken when this row was cloned into its profile
   *  (see cloneLivingProfile) — null for a row created fresh rather than
   *  cloned. Lets the profile detail page show how far `amount` has since
   *  been adjusted up/down from that starting point. */
  baseline_amount: number | null;
};

export type Property = {
  id: string;
  profile_id: string;
  name: string;
  address: string | null;
  notes: string | null;
  end_date: string | null;
};

/** Ownership split — same zero/one/many-row semantics as CommitmentSplit,
 *  but independent of any commitment's own split. */
export type PropertySplit = {
  id: string;
  property_id: string;
  household_member_id: string;
  percentage: number;
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

/** The literal `tax_profiles` table shape — Steuerklasse/filing setup only.
 *  Health-insurance fields live on `HouseholdMember` instead (always
 *  present, no tax profile required) — see `TaxProfile` below. */
export type TaxProfileRow = {
  id: string;
  household_member_id: string;
  tax_class: 1 | 2 | 3 | 4 | 5 | 6;
  church_tax: boolean;
  church_tax_state: string | null;
  has_children: boolean;
};

/** The calc-ready shape every `lib/tax`/`lib/finance`/`lib/runway` consumer
 *  uses — a `TaxProfileRow` merged with its household member's
 *  health-insurance fields (see `lib/finance/tax-profile-context.ts`). */
export type TaxProfile = TaxProfileRow &
  Pick<
    HouseholdMember,
    "statutory_health_insurance" | "health_insurance_addon_rate" | "private_health_insurance_monthly_premium"
  >;

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
  name: string;
  /** In `currency`, not necessarily EUR — converted via `exchange_rate_to_eur`
   *  before it feeds any gross/net figure or tax calculation. */
  gross_amount: number;
  currency: Currency;
  /** Manually entered: 1 unit of `currency` = this many EUR. Always 1 for
   *  EUR rows (enforced by the form, not the DB). */
  exchange_rate_to_eur: number;
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
  /** Rental-only — % of the raw rent held back for vacancy, maintenance,
   *  etc. The adjusted amount (gross_amount × (1 − pct/100)), not the raw
   *  rent, is what feeds gross/net income and gets taxed. Ignored for
   *  non-rental rows. */
  rental_overhead_pct: number;
  /** Snapshot of `gross_amount` taken when this row was cloned into its
   *  profile (see cloneLivingProfile) — null for a row created fresh rather
   *  than cloned. Lets the profile detail page show how far `gross_amount`
   *  has since been adjusted up/down from that starting point. */
  baseline_gross_amount: number | null;
};

/** Same zero/one/many-row semantics as CommitmentSplit/PropertySplit: zero
 *  rows = household (unattributed) income, one row at 100% = fully
 *  individual, two or more (summing to 100%) = shared by percentage. */
export type IncomeSplit = {
  id: string;
  income_id: string;
  household_member_id: string;
  percentage: number;
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

export type Currency = "EUR" | "GBP";

export const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
];

export type LivingProfile = {
  id: string;
  name: string;
  description: string | null;
  is_baseline: boolean;
  /** Only meaningful on the baseline row — seeds the "do-nothing" overlay
   *  (DESIGN v2 §2.5), null until the household sets it. */
  current_liquid_savings: number | null;
};

/** The household-level shell — a scenario holds one or more SeveranceScenarioPackages,
 *  one per person taking severance in it, each on its own timeline. */
export type SeveranceScenario = {
  id: string;
  name: string;
  starting_balance: number;
  notes: string | null;
};

/** One person's severance package within a scenario — salary/multiplier/notice-period/
 *  garden-leave inputs and their own severance_start_date. A scenario can have several,
 *  each running independently (e.g. both partners taking severance on different dates). */
export type SeveranceScenarioPackage = {
  id: string;
  scenario_id: string;
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
  /** The *work end date* — when employment/notice ends. Drives garden
   *  leave, ALG I timing, and the salary/health-insurance cutoffs. Despite
   *  the name, this is not necessarily when the lump sum is paid — see
   *  `severance_payment_date`. */
  severance_start_date: string;
  /** When the severance lump sum is actually paid, if known — supersedes
   *  `severance_start_date`'s own landing date (garden leave end) purely
   *  for picking which calendar year the Fünftelregelung tax calc uses
   *  (`lib/tax/fuenftelregelung.ts`'s `compareSeverancePaymentTiming`).
   *  Null means "not set separately" — the app assumes the payment lands
   *  the same month garden leave ends, same as before this field existed. */
  severance_payment_date: string | null;
  christmas_bonus_pct: number | null;
  include_christmas_bonus_in_calc: boolean;
  claim_unemployment_benefit: boolean;
  unemployment_benefit_defer_months: number;
  months_insured_override: number | null;
  new_job_start_date: string | null;
  /** User-confirmed override: the exit agreement's wording avoids a Sperrzeit,
   *  so ALG I is modeled starting right after garden leave/notice ends
   *  instead of being shifted by the heuristic 12-week risk flag. */
  sperrzeit_safe_confirmed: boolean;
  /** This package's own override of the household's global pension-deposit
   *  default (see SeveranceGlobalSettings) — an amount carved out of this
   *  severance and diverted into a company pension instead of paid as cash,
   *  reducing the taxable severance base (lib/severance/pension-deposit.ts's
   *  resolvePensionDeposit). Null means "use the global default"; 0 means
   *  this package explicitly opts out. Distinct from monthly_pension_contribution
   *  above, which is an ongoing salary deferral, not a one-off severance carve-out. */
  pension_deposit_override: number | null;
};

/** Household-wide default for the pension-deposit-from-severance feature —
 *  one row per user (see SeveranceScenarioPackage's own pension_deposit_override
 *  for the per-package supersede). Null means "use the coded fallback"
 *  (lib/severance/pension-deposit.ts's SEVERANCE_PENSION_DEPOSIT_DEFAULT)
 *  rather than a value the household has explicitly chosen. */
export type SeveranceGlobalSettings = {
  user_id: string;
  pension_deposit_default: number | null;
};

export type SavingsAllocationType = "amount" | "percentage";
export type AccrualFrequency = "monthly" | "quarterly" | "annually";

export const ACCRUAL_FREQUENCIES: { value: AccrualFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

/** Whether a one-off event/savings rule belongs to one scenario, or applies
 *  to all of them from a single shared object (see
 *  app/(app)/severance-scenarios/global-items.ts for how the two merge into
 *  a scenario's projection). Set once at creation — not editable afterward,
 *  since the "editing" surface for a global item is only its values. */
export type ScenarioItemScope = "global" | "scenario";

export const SCENARIO_ITEM_SCOPES: { value: ScenarioItemScope; label: string }[] = [
  { value: "scenario", label: "This scenario only" },
  { value: "global", label: "All scenarios" },
];

/** Sets aside part of one person's own net severance lump sum (a fixed
 *  amount, or a % of it — exactly one of `amount`/`percentage` is set, per
 *  `allocation_type`) and applies `annual_return_pct`, compounding every
 *  `accrual_frequency` — the accrued return (not the principal, which is
 *  already counted once via the lump sum itself) shows up as income in the
 *  runway projection. Scenario-scoped rows (`scope: "scenario"`) validate
 *  the allocation against one package's own severance payout (`package_id`
 *  set, `household_member_id` null). Global rows (`scope: "global"`) instead
 *  carry `household_member_id` (`scenario_id`/`package_id` null) — a package
 *  is inherently scenario-specific, so a global rule resolves per-scenario
 *  against *that scenario's own* package for the same member. */
export type SeveranceScenarioSavingsRule = {
  id: string;
  scope: ScenarioItemScope;
  scenario_id: string | null;
  package_id: string | null;
  household_member_id: string | null;
  name: string;
  allocation_type: SavingsAllocationType;
  amount: number | null;
  percentage: number | null;
  annual_return_pct: number;
  accrual_frequency: AccrualFrequency;
};

export type ScenarioEventType = "one_off_outflow" | "one_off_inflow" | "recurring_income_start";

/** `scenario_id` is null exactly when `scope === "global"`. */
export type SeveranceScenarioEvent = {
  id: string;
  scope: ScenarioItemScope;
  scenario_id: string | null;
  name: string;
  event_type: ScenarioEventType;
  amount: number | null;
  date: string;
  recurring_gross_amount: number | null;
  recurring_frequency: Frequency | null;
  recurring_tax_profile_id: string | null;
  recurring_end_date: string | null;
};

/** A per-scenario supersede of a global event's own amount/recurring_gross_amount
 *  (never both — the merge logic reads whichever the event's own `event_type`
 *  uses). `suppressed` (value left null) means this scenario has its own
 *  independent scope="scenario" copy instead ("duplicate into this
 *  scenario") — the global event stops contributing here so the two don't
 *  double-count. `global_event_id`/`orphaned_item_name`/`stale_since`: see
 *  `SeveranceGlobalSavingsRuleOverride`'s own comment — identical shape. */
export type SeveranceGlobalEventOverride = {
  id: string;
  global_event_id: string | null;
  scenario_id: string;
  value: number | null;
  suppressed: boolean;
  orphaned_item_name: string | null;
  stale_since: string | null;
};

/** A per-scenario supersede of a global savings rule's own amount/percentage
 *  (whichever its `allocation_type` uses). `global_rule_id` is `ON DELETE SET
 *  NULL` — deleting the global rule doesn't delete this row, it flags it
 *  (`orphaned_item_name` + `stale_since`, set by the delete action just
 *  before deleting) so the user can review which scenarios had an override
 *  tied to the now-deleted rule instead of it silently vanishing. */
export type SeveranceGlobalSavingsRuleOverride = {
  id: string;
  global_rule_id: string | null;
  scenario_id: string;
  value: number | null;
  suppressed: boolean;
  orphaned_item_name: string | null;
  stale_since: string | null;
};

/** `scenario_id` is null exactly when `scope === "global"` — a global phase
 *  switches every scenario's timeline to `profile_id` the same way, same
 *  scope model as `SeveranceScenarioEvent`/`SeveranceScenarioPropertyEnd`. */
export type SeveranceScenarioPhase = {
  id: string;
  scope: ScenarioItemScope;
  scenario_id: string | null;
  profile_id: string;
  start_date: string;
  label: string | null;
};

/** Ends a property (and everything linked to it) from a date, without
 *  touching the property or its commitments outside where this applies.
 *  `scenario_id` is null exactly when `scope === "global"` — a global row
 *  ends the property the same way in every scenario (see
 *  `lib/severance/global-items.ts`'s `mergeScenarioPropertyEnds`), same
 *  scope model as `SeveranceScenarioEvent`. */
export type SeveranceScenarioPropertyEnd = {
  id: string;
  scope: ScenarioItemScope;
  scenario_id: string | null;
  property_id: string;
  end_date: string;
};

/** A per-scenario supersede of a global property-end's own `end_date`.
 *  `suppressed` (end_date left null) means this scenario has its own
 *  independent scope="scenario" copy instead ("duplicate into this
 *  scenario") — the global item stops contributing here so the two don't
 *  double-count. `global_property_end_id`/`orphaned_item_name`/`stale_since`:
 *  see `SeveranceGlobalSavingsRuleOverride`'s own comment — identical shape. */
export type SeveranceGlobalPropertyEndOverride = {
  id: string;
  global_property_end_id: string | null;
  scenario_id: string;
  end_date: string | null;
  suppressed: boolean;
  orphaned_item_name: string | null;
  stale_since: string | null;
};

/** A per-scenario supersede of a global cost phase's own `profile_id` —
 *  unlike the other three override types, `start_date`/`label` are never
 *  overridden (a deliberate product decision), so there's no date/value
 *  field here, just `profile_id`. `suppressed`/`global_phase_id`/
 *  `orphaned_item_name`/`stale_since`: see `SeveranceGlobalPropertyEndOverride`'s
 *  own comment — identical shape/semantics. */
export type SeveranceGlobalPhaseOverride = {
  id: string;
  global_phase_id: string | null;
  scenario_id: string;
  profile_id: string | null;
  suppressed: boolean;
  orphaned_item_name: string | null;
  stale_since: string | null;
};

/** Redundancy admin checklist item — template_key null for a custom
 *  (user-added) item, set for one seeded from the static template. */
export type ScenarioChecklistItem = {
  id: string;
  scenario_id: string;
  template_key: string | null;
  label: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
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
