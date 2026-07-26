-- Income splits — the same zero/one/many-row ownership model as
-- commitment_splits/property_splits, now for income: zero rows = household
-- (unattributed) income, one row at 100% = fully individual, two or more
-- (summing to 100%) = shared by percentage — e.g. rental income split
-- between two people. Net-of-tax calculations key off each split's own
-- member's tax profile (see lib/finance/income-gross.ts).

create table income_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  income_id uuid not null references income(id) on delete cascade,
  household_member_id uuid not null references household_members(id) on delete cascade,
  percentage numeric(5,2) not null check (percentage > 0 and percentage <= 100),
  created_at timestamptz not null default now(),
  unique (income_id, household_member_id)
);

create index income_splits_income_id_idx on income_splits(income_id);
create index income_splits_household_member_id_idx on income_splits(household_member_id);

alter table income_splits enable row level security;

create policy "income_splits_select_own" on income_splits
  for select using (user_id = auth.uid());
create policy "income_splits_insert_own" on income_splits
  for insert with check (user_id = auth.uid());
create policy "income_splits_update_own" on income_splits
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "income_splits_delete_own" on income_splits
  for delete using (user_id = auth.uid());

-- Every existing income row already has exactly one owner — carry it
-- forward as a 100% split before the source column disappears.
insert into income_splits (user_id, income_id, household_member_id, percentage)
select user_id, id, household_member_id, 100
from income;

alter table income drop column household_member_id;
