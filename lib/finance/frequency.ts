import type { Commitment, Currency } from "@/lib/types";

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

/** The shared ordering for every "costs" list in the app — largest
 *  monthly-equivalent cost first. */
export function sortCommitmentsByCost<T extends Pick<Commitment, "amount" | "frequency">>(
  commitments: T[]
): T[] {
  return [...commitments].sort(
    (a, b) => toMonthlyEquivalent(b.amount, b.frequency) - toMonthlyEquivalent(a.amount, a.frequency)
  );
}

/** Every total/aggregate in the app is EUR — this is only for showing an
 *  income row's amount back in the currency it was actually entered in. */
export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatEUR(amount: number): string {
  return formatCurrency(amount, "EUR");
}

/**
 * Compact EUR for dense card/list views: rounds to the nearest €1,000 and
 * renders as e.g. "346k €" (345.678 → 346k). Use only where the exact
 * figure isn't needed — detail pages keep the full `formatEUR`.
 */
export function formatEURThousands(amount: number): string {
  const thousands = Math.round(amount / 1000) || 0;
  return `${new Intl.NumberFormat("de-DE").format(thousands)}k €`;
}
