export type Frequency = "monthly" | "quarterly" | "annual" | "one_off";

// One-off amounts aren't part of the ongoing monthly burn rate — they're
// totalled separately wherever that distinction matters (e.g. the
// commitments table's "monthly-equivalent" column).
export function toMonthlyEquivalent(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "annual":
      return amount / 12;
    case "one_off":
      return 0;
  }
}

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}
