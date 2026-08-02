-- Savings/investment rules — set aside part of a severance package's net
-- lump sum (a fixed amount, or a % of it) and apply a return, accrued
-- monthly/quarterly/annually, added to the runway projection as income
-- (lib/runway/savings.ts). Per-package (not per-scenario) since the
-- allocation is validated against that specific person's own severance
-- payout — a two-package scenario needs independent headroom per person,
-- same reasoning as the ALG I claim inputs living on the package (see
-- DESIGN-financial-runway-app-v2.md §0.1).
create table severance_scenario_savings_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  package_id uuid not null references severance_scenario_packages(id) on delete cascade,
  name text not null,
  -- Exactly one of amount/percentage is set, per allocation_type — enforced
  -- app-side (Zod), same convention as severance_scenario_packages'
  -- gross_severance_override (a nullable alternative to a formula field,
  -- no DB check constraint).
  allocation_type text not null,
  amount numeric(12, 2),
  percentage numeric(5, 2),
  annual_return_pct numeric(6, 2) not null default 0,
  accrual_frequency text not null,
  created_at timestamptz not null default now()
);

create index severance_scenario_savings_rules_scenario_id_idx
  on severance_scenario_savings_rules(scenario_id);
create index severance_scenario_savings_rules_package_id_idx
  on severance_scenario_savings_rules(package_id);

alter table severance_scenario_savings_rules enable row level security;

create policy "severance_scenario_savings_rules_select_own" on severance_scenario_savings_rules
  for select using (user_id = auth.uid());
create policy "severance_scenario_savings_rules_insert_own" on severance_scenario_savings_rules
  for insert with check (user_id = auth.uid());
create policy "severance_scenario_savings_rules_update_own" on severance_scenario_savings_rules
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_scenario_savings_rules_delete_own" on severance_scenario_savings_rules
  for delete using (user_id = auth.uid());
