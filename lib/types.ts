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
export type Ownership = "shared" | "individual";
export type IncomeType = "salary" | "part_time" | "rental" | "other";

export type Commitment = {
  id: string;
  profile_id: string;
  name: string;
  category: CommitmentCategory;
  amount: number;
  frequency: CommitmentFrequency;
  essential: boolean;
  ownership: Ownership;
  household_member_id: string | null;
  start_date: string;
  end_date: string | null;
};

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
};

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
