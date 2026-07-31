-- "Do-nothing" baseline overlay (DESIGN-financial-runway-app-v2.md §2.5) needs
-- a starting point independent of any severance scenario's own
-- starting_balance. Only meaningful on the baseline living_profiles row
-- (is_baseline = true) — nullable since a household may not have set it yet,
-- in which case the overlay is simply not shown.
alter table living_profiles
  add column current_liquid_savings numeric(10, 2);
