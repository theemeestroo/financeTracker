-- Models diverting part of a severance lump sum into a company pension
-- (bAV/Entgeltumwandlung) instead of taking it as cash — reduces the
-- taxable severance base for the Fünftelregelung calc (see
-- lib/severance/pension-deposit.ts's resolvePensionDeposit and its use in
-- resolve-scenario.ts) and the cash that actually lands in the account.
--
-- severance_global_settings: one row per user, the household-wide default
-- deposit amount. Nullable — null means "use the coded fallback"
-- (SEVERANCE_PENSION_DEPOSIT_DEFAULT, ~the tax-free bAV ceiling) rather than
-- a value the user has explicitly chosen. No seed/backfill: the settings
-- form upserts this row the first time a household changes the default.
create table severance_global_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  pension_deposit_default numeric(10, 2)
);

alter table severance_global_settings enable row level security;

create policy "severance_global_settings_select_own" on severance_global_settings
  for select using (user_id = auth.uid());
create policy "severance_global_settings_insert_own" on severance_global_settings
  for insert with check (user_id = auth.uid());
create policy "severance_global_settings_update_own" on severance_global_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Per-package override of the resolved global default. Null = use the
-- global default; any value including 0 = this package's own explicit
-- amount (0 meaning "no pension deposit for this package").
alter table severance_scenario_packages
  add column pension_deposit_override numeric(10, 2);
