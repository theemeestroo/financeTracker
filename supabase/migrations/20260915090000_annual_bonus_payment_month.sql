-- annual_bonus so far has no timing of its own — compareSeverancePaymentTiming
-- (lib/tax/fuenftelregelung.ts) always folded the full annual_bonus into the
-- departure year's "regular taxable income" whenever that year's outcome
-- included a salary base at all, regardless of whether the bonus's real
-- payment date falls before or after the member has actually left. A bonus
-- that pays out *after* departure (e.g. paid every July, member leaves in
-- February with no garden leave) is never actually received, so including
-- it overstated that year's tax and, via the timing comparison, overstated
-- how much a deferred severance payment would save.
--
-- This column lets a package say which calendar month the bonus is paid in
-- (1-12), so resolve-scenario.ts can compare it against naturalAlgStart's
-- month and only count the bonus in the departure year when it would
-- actually land before employment ends.
--
-- Nullable, no backfill: null means "not set" — resolve-scenario.ts keeps
-- assuming the bonus is received in the departure year regardless of
-- timing, the same as every package computed before this column existed.
alter table severance_scenario_packages
  add column annual_bonus_payment_month integer
    check (annual_bonus_payment_month between 1 and 12);
