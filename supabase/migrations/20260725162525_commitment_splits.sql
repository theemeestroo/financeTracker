-- Replaces the binary shared/individual + single household_member_id model
-- on commitments with a proper many-to-many percentage split: a commitment
-- can be linked to zero (a general household cost), one (fully individual),
-- or several household members (shared, split by percentage).

create table commitment_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  commitment_id uuid not null references commitments(id) on delete cascade,
  household_member_id uuid not null references household_members(id) on delete cascade,
  percentage numeric(5,2) not null check (percentage > 0 and percentage <= 100),
  created_at timestamptz not null default now(),
  unique (commitment_id, household_member_id)
);

create index commitment_splits_commitment_id_idx on commitment_splits(commitment_id);
create index commitment_splits_household_member_id_idx on commitment_splits(household_member_id);

alter table commitment_splits enable row level security;

create policy "commitment_splits_select_own" on commitment_splits
  for select using (user_id = auth.uid());
create policy "commitment_splits_insert_own" on commitment_splits
  for insert with check (user_id = auth.uid());
create policy "commitment_splits_update_own" on commitment_splits
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "commitment_splits_delete_own" on commitment_splits
  for delete using (user_id = auth.uid());

-- Carry forward existing individual attributions as a 100% split before the
-- source columns disappear. Existing 'shared' commitments (no member) become
-- unattributed (zero split rows) — the new equivalent of the old default.
insert into commitment_splits (user_id, commitment_id, household_member_id, percentage)
select user_id, id, household_member_id, 100
from commitments
where ownership = 'individual' and household_member_id is not null;

alter table commitments drop constraint if exists commitments_ownership_member_consistency;
alter table commitments drop column ownership;
alter table commitments drop column household_member_id;
