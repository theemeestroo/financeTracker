-- Splits severance_scenarios into a lightweight household-level shell
-- (name/starting_balance/notes) plus severance_scenario_packages — one row
-- per household member taking severance in that scenario, each with its own
-- salary/multiplier/notice-period/garden-leave/severance_start_date. This
-- lets a scenario model two people's severance running concurrently on
-- independent timelines, instead of exactly one.

create table severance_scenario_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
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
  severance_start_date date not null,

  created_at timestamptz not null default now(),
  unique (scenario_id, household_member_id)
);

create index severance_scenario_packages_scenario_id_idx on severance_scenario_packages(scenario_id);
create index severance_scenario_packages_household_member_id_idx on severance_scenario_packages(household_member_id);

alter table severance_scenario_packages enable row level security;

create policy "severance_scenario_packages_select_own" on severance_scenario_packages
  for select using (user_id = auth.uid());
create policy "severance_scenario_packages_insert_own" on severance_scenario_packages
  for insert with check (user_id = auth.uid());
create policy "severance_scenario_packages_update_own" on severance_scenario_packages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_scenario_packages_delete_own" on severance_scenario_packages
  for delete using (user_id = auth.uid());

-- Carry every existing scenario's single package forward as its first
-- (only) severance_scenario_packages row before the source columns
-- disappear — no existing scenario loses data.
insert into severance_scenario_packages (
  user_id, scenario_id, household_member_id, employer_name, years_of_service,
  employment_start_date, monthly_base_salary, holiday_pay_pct, annual_bonus,
  annual_car_benefit, monthly_pension_contribution, severance_multiplier,
  include_bonus_in_calc, include_car_in_calc, include_garden_leave,
  notice_period_months, gross_severance_override, severance_start_date
)
select
  user_id, id, household_member_id, employer_name, years_of_service,
  employment_start_date, monthly_base_salary, holiday_pay_pct, annual_bonus,
  annual_car_benefit, monthly_pension_contribution, severance_multiplier,
  include_bonus_in_calc, include_car_in_calc, include_garden_leave,
  notice_period_months, gross_severance_override, severance_start_date
from severance_scenarios
where severance_start_date is not null;

alter table severance_scenarios drop column household_member_id;
alter table severance_scenarios drop column employer_name;
alter table severance_scenarios drop column years_of_service;
alter table severance_scenarios drop column employment_start_date;
alter table severance_scenarios drop column monthly_base_salary;
alter table severance_scenarios drop column holiday_pay_pct;
alter table severance_scenarios drop column annual_bonus;
alter table severance_scenarios drop column annual_car_benefit;
alter table severance_scenarios drop column monthly_pension_contribution;
alter table severance_scenarios drop column severance_multiplier;
alter table severance_scenarios drop column include_bonus_in_calc;
alter table severance_scenarios drop column include_car_in_calc;
alter table severance_scenarios drop column include_garden_leave;
alter table severance_scenarios drop column notice_period_months;
alter table severance_scenarios drop column gross_severance_override;
alter table severance_scenarios drop column severance_start_date;
