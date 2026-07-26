-- Rental-only overhead reserve: a % of the raw rent held back for vacancy,
-- maintenance, etc., so gross/net income (and the tax calculated on it)
-- reflects a realistic take-home figure rather than the headline rent.
-- 0 by default — every existing row (and every non-rental row going
-- forward) behaves exactly as before.
alter table income add column rental_overhead_pct numeric(5,2) not null default 0
  check (rental_overhead_pct >= 0 and rental_overhead_pct <= 100);
