-- Lets an income row be entered in a currency other than EUR (e.g. GBP
-- rental income), converted to EUR before it feeds any gross/net figure or
-- tax calculation. exchange_rate_to_eur is manually entered (1 unit of
-- `currency` = X EUR) — no live FX lookup, consistent with every other
-- figure in this app being a stored value the user enters/updates
-- themselves. Defaults (EUR, rate 1) are a no-op, so every existing row
-- behaves exactly as before.
alter table income add column currency text not null default 'EUR' check (currency in ('EUR', 'GBP'));
alter table income add column exchange_rate_to_eur numeric(10,6) not null default 1
  check (exchange_rate_to_eur > 0);
