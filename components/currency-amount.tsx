import { formatCurrency, formatEUR } from "@/lib/finance/frequency";
import type { Currency } from "@/lib/types";

/** Every income amount displays EUR first — the figure every calculation
 *  actually uses — with the raw as-entered currency amount underneath in
 *  small text when it isn't already EUR. */
export function CurrencyAmount({
  amount,
  currency,
  exchangeRateToEur,
}: {
  amount: number;
  currency: Currency;
  exchangeRateToEur: number;
}) {
  if (currency === "EUR") return <>{formatEUR(amount)}</>;

  return (
    <span className="flex flex-col items-end">
      <span>{formatEUR(amount * exchangeRateToEur)}</span>
      <span className="text-xs text-muted-foreground">({formatCurrency(amount, currency)})</span>
    </span>
  );
}
