-- Household Financial Runway Tracker — initial schema
-- Covers all tables in DESIGN-financial-runway-app.md §4.
-- Every user-owned table is scoped by user_id + RLS (auth.uid()).
-- Phase 1 only builds UI for household_members / living_profiles (implicit) /
-- commitments / income — the rest exist now so later phases are pure app work,
-- no further migrations needed for the base shape.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────
-- household_members
-- ─────────────────────────────────────────────────────────────────────────
create table household_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  created_at timestamptz not null default now()
);

create index household_members_user_id_idx on household_members(user_id);

alter table household_members enable row level security;

create policy "household_members_select_own" on household_members
  for select using (user_id = auth.uid());
create policy "household_members_insert_own" on household_members
  for insert with check (user_id = auth.uid());
create policy "household_members_update_own" on household_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "household_members_delete_own" on household_members
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- living_profiles
-- ─────────────────────────────────────────────────────────────────────────
create table living_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  description text,
  is_baseline boolean not null default false,
  created_at timestamptz not null default now()
);

create index living_profiles_user_id_idx on living_profiles(user_id);
-- exactly one baseline profile per user
create unique index living_profiles_one_baseline_per_user
  on living_profiles(user_id) where is_baseline;

alter table living_profiles enable row level security;

create policy "living_profiles_select_own" on living_profiles
  for select using (user_id = auth.uid());
create policy "living_profiles_insert_own" on living_profiles
  for insert with check (user_id = auth.uid());
create policy "living_profiles_update_own" on living_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "living_profiles_delete_own" on living_profiles
  for delete using (user_id = auth.uid() and not is_baseline);

-- ─────────────────────────────────────────────────────────────────────────
-- commitments
-- ─────────────────────────────────────────────────────────────────────────
create table commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  profile_id uuid not null references living_profiles(id) on delete cascade,
  name text not null,
  category text not null check (category in (
    'housing', 'utilities', 'insurance', 'subscriptions', 'debt_loans',
    'transport', 'childcare_education', 'healthcare', 'groceries_living',
    'leisure_discretionary', 'savings_investment', 'one_off', 'other'
  )),
  amount numeric(10,2) not null check (amount >= 0),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'annual', 'one_off')),
  essential boolean not null default true,
  ownership text not null default 'shared' check (ownership in ('shared', 'individual')),
  household_member_id uuid references household_members(id) on delete set null,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  constraint commitments_ownership_member_consistency check (
    (ownership = 'shared' and household_member_id is null) or
    (ownership = 'individual' and household_member_id is not null)
  ),
  constraint commitments_end_after_start check (end_date is null or end_date >= start_date)
);

create index commitments_user_id_idx on commitments(user_id);
create index commitments_profile_id_idx on commitments(profile_id);

alter table commitments enable row level security;

create policy "commitments_select_own" on commitments
  for select using (user_id = auth.uid());
create policy "commitments_insert_own" on commitments
  for insert with check (user_id = auth.uid());
create policy "commitments_update_own" on commitments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "commitments_delete_own" on commitments
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- tax_profiles (schema only in Phase 1 — used from Phase 3 onward)
-- ─────────────────────────────────────────────────────────────────────────
create table tax_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  household_member_id uuid not null references household_members(id) on delete cascade,
  tax_class int not null check (tax_class between 1 and 6),
  church_tax boolean not null default false,
  church_tax_state text,
  has_children boolean not null default false,
  statutory_health_insurance boolean not null default true,
  health_insurance_addon_rate numeric(4,3),
  created_at timestamptz not null default now()
);

create index tax_profiles_user_id_idx on tax_profiles(user_id);

alter table tax_profiles enable row level security;

create policy "tax_profiles_select_own" on tax_profiles
  for select using (user_id = auth.uid());
create policy "tax_profiles_insert_own" on tax_profiles
  for insert with check (user_id = auth.uid());
create policy "tax_profiles_update_own" on tax_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tax_profiles_delete_own" on tax_profiles
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- income
-- ─────────────────────────────────────────────────────────────────────────
create table income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  profile_id uuid not null references living_profiles(id) on delete cascade,
  household_member_id uuid not null references household_members(id) on delete cascade,
  name text not null,
  gross_amount numeric(10,2) not null check (gross_amount >= 0),
  type text not null check (type in ('salary', 'part_time', 'rental', 'other')),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'annual')),
  start_date date,
  end_date date,
  tax_profile_id uuid references tax_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint income_end_after_start check (end_date is null or start_date is null or end_date >= start_date)
);

create index income_user_id_idx on income(user_id);
create index income_profile_id_idx on income(profile_id);

alter table income enable row level security;

create policy "income_select_own" on income
  for select using (user_id = auth.uid());
create policy "income_insert_own" on income
  for insert with check (user_id = auth.uid());
create policy "income_update_own" on income
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "income_delete_own" on income
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- tax_year_parameters — global versioned reference data, not user-owned.
-- Read-only to authenticated users; only managed via migrations/dashboard.
-- ─────────────────────────────────────────────────────────────────────────
create table tax_year_parameters (
  year int primary key,
  params jsonb not null
);

alter table tax_year_parameters enable row level security;

create policy "tax_year_parameters_select_authenticated" on tax_year_parameters
  for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────
-- severance_scenarios
-- ─────────────────────────────────────────────────────────────────────────
create table severance_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  household_member_id uuid not null references household_members(id) on delete cascade,

  employer_name text,
  years_of_service numeric(4,1),
  employment_start_date date,
  monthly_base_salary numeric(10,2),
  holiday_pay_pct numeric(5,2),
  annual_bonus numeric(10,2) not null default 0,
  annual_car_benefit numeric(10,2) not null default 0,
  monthly_pension_contribution numeric(10,2) not null default 0,
  severance_multiplier numeric(4,2) not null default 1,
  include_bonus_in_calc boolean not null default false,
  include_car_in_calc boolean not null default false,
  include_garden_leave boolean not null default false,
  notice_period_months numeric(4,1) default 6,
  gross_severance_override numeric(10,2),

  severance_start_date date,
  starting_balance numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index severance_scenarios_user_id_idx on severance_scenarios(user_id);

alter table severance_scenarios enable row level security;

create policy "severance_scenarios_select_own" on severance_scenarios
  for select using (user_id = auth.uid());
create policy "severance_scenarios_insert_own" on severance_scenarios
  for insert with check (user_id = auth.uid());
create policy "severance_scenarios_update_own" on severance_scenarios
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_scenarios_delete_own" on severance_scenarios
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- severance_scenario_events
-- ─────────────────────────────────────────────────────────────────────────
create table severance_scenario_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  name text not null,
  event_type text not null check (event_type in ('one_off_outflow', 'one_off_inflow', 'recurring_income_start')),
  amount numeric(10,2),
  date date not null,
  recurring_gross_amount numeric(10,2),
  recurring_frequency text check (recurring_frequency in ('monthly', 'quarterly', 'annual')),
  recurring_tax_profile_id uuid references tax_profiles(id) on delete set null,
  recurring_end_date date,
  created_at timestamptz not null default now()
);

create index severance_scenario_events_scenario_id_idx on severance_scenario_events(scenario_id);

alter table severance_scenario_events enable row level security;

create policy "severance_scenario_events_select_own" on severance_scenario_events
  for select using (user_id = auth.uid());
create policy "severance_scenario_events_insert_own" on severance_scenario_events
  for insert with check (user_id = auth.uid());
create policy "severance_scenario_events_update_own" on severance_scenario_events
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_scenario_events_delete_own" on severance_scenario_events
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- severance_scenario_phases
-- ─────────────────────────────────────────────────────────────────────────
create table severance_scenario_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  profile_id uuid not null references living_profiles(id) on delete restrict,
  start_date date not null,
  label text,
  created_at timestamptz not null default now()
);

create index severance_scenario_phases_scenario_id_idx on severance_scenario_phases(scenario_id);

alter table severance_scenario_phases enable row level security;

create policy "severance_scenario_phases_select_own" on severance_scenario_phases
  for select using (user_id = auth.uid());
create policy "severance_scenario_phases_insert_own" on severance_scenario_phases
  for insert with check (user_id = auth.uid());
create policy "severance_scenario_phases_update_own" on severance_scenario_phases
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_scenario_phases_delete_own" on severance_scenario_phases
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- New-user init: baseline Living Profile + a default "You" household member,
-- created automatically the moment a user signs in for the first time.
-- SECURITY DEFINER is required because this fires from the auth schema and
-- must be able to write into public tables regardless of the (not yet
-- existing) session's RLS context.
-- ─────────────────────────────────────────────────────────────────────────
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.living_profiles (user_id, name, is_baseline)
  values (new.id, 'Current', true);

  insert into public.household_members (user_id, name)
  values (new.id, 'You');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
