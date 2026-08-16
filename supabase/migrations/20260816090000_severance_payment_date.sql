-- Separates "when employment ends" (severance_start_date — drives notice
-- period/garden leave/ALG I timing, unchanged) from "when the severance lump
-- sum is actually paid" (this new column). German severance is taxed in the
-- calendar year it's *received*, so a payment landing in a year after
-- employment has fully ended (no more salary that year) is usually taxed at
-- a meaningfully lower marginal rate than one landing the same year as a
-- full year's salary — see lib/tax/fuenftelregelung.ts's
-- compareSeverancePaymentTiming for the calculation this enables.
--
-- Nullable, no backfill: null means "not set separately" — the app falls
-- back to treating the payment as landing the same month garden leave ends
-- (today's existing assumption), so every pre-existing package keeps
-- computing identically to before this migration.
alter table severance_scenario_packages
  add column severance_payment_date date;
