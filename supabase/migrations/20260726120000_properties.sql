-- Properties: a physical-asset grouping for commitments (e.g. a house's
-- mortgage + insurance + utilities), with its own household/percentage
-- ownership split (mirrors commitment_splits) independent of the splits on
-- the commitments linked to it.
--
-- severance_scenario_property_ends lets a scenario end a property (and thus
-- every commitment linked to it) from a given date without cloning a whole
-- Living Profile — scenarios elsewhere only support wholesale profile swaps
-- via severance_scenario_phases.

create table properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  profile_id uuid not null references living_profiles(id) on delete cascade,
  name text not null,
  address text,
  notes text,
  end_date date,
  created_at timestamptz not null default now()
);

create index properties_user_id_idx on properties(user_id);
create index properties_profile_id_idx on properties(profile_id);

alter table properties enable row level security;

create policy "properties_select_own" on properties
  for select using (user_id = auth.uid());
create policy "properties_insert_own" on properties
  for insert with check (user_id = auth.uid());
create policy "properties_update_own" on properties
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "properties_delete_own" on properties
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- property_splits — same zero/one/many-row semantics as commitment_splits:
-- zero rows = unattributed, one row at 100% = fully individual, several
-- summing to 100% = shared ownership.
-- ─────────────────────────────────────────────────────────────────────────
create table property_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  property_id uuid not null references properties(id) on delete cascade,
  household_member_id uuid not null references household_members(id) on delete cascade,
  percentage numeric(5,2) not null check (percentage > 0 and percentage <= 100),
  created_at timestamptz not null default now(),
  unique (property_id, household_member_id)
);

create index property_splits_property_id_idx on property_splits(property_id);
create index property_splits_household_member_id_idx on property_splits(household_member_id);

alter table property_splits enable row level security;

create policy "property_splits_select_own" on property_splits
  for select using (user_id = auth.uid());
create policy "property_splits_insert_own" on property_splits
  for insert with check (user_id = auth.uid());
create policy "property_splits_update_own" on property_splits
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "property_splits_delete_own" on property_splits
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- commitments.property_id — nullable; a commitment can still exist with no
-- property (a general/household or individual cost, as today).
-- ─────────────────────────────────────────────────────────────────────────
alter table commitments add column property_id uuid references properties(id) on delete set null;
create index commitments_property_id_idx on commitments(property_id);

-- ─────────────────────────────────────────────────────────────────────────
-- severance_scenario_property_ends
-- ─────────────────────────────────────────────────────────────────────────
create table severance_scenario_property_ends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  end_date date not null,
  created_at timestamptz not null default now(),
  unique (scenario_id, property_id)
);

create index severance_scenario_property_ends_scenario_id_idx
  on severance_scenario_property_ends(scenario_id);

alter table severance_scenario_property_ends enable row level security;

create policy "severance_scenario_property_ends_select_own" on severance_scenario_property_ends
  for select using (user_id = auth.uid());
create policy "severance_scenario_property_ends_insert_own" on severance_scenario_property_ends
  for insert with check (user_id = auth.uid());
create policy "severance_scenario_property_ends_update_own" on severance_scenario_property_ends
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_scenario_property_ends_delete_own" on severance_scenario_property_ends
  for delete using (user_id = auth.uid());
