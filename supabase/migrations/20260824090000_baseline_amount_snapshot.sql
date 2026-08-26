-- Living Profiles: lets a cloned commitment/income row remember the value it
-- was cloned at, so the profile detail page can show how far the household
-- has since adjusted it from that baseline (up or down) instead of only
-- allowing deletion. Set once at clone time (see cloneLivingProfile) and left
-- null for rows that were never cloned (created fresh in any profile,
-- including the baseline itself) — a null means "no baseline to compare
-- against", not "unchanged".
alter table commitments
  add column baseline_amount numeric(10, 2);

alter table income
  add column baseline_gross_amount numeric(10, 2);
