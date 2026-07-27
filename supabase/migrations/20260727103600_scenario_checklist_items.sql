-- Redundancy admin checklist (DESIGN v2 §2.7) — seeded from a static task
-- template when a scenario's first severance package is added (that's the
-- first point a severance_start_date exists to compute due dates from;
-- scenario creation itself has none yet). template_key is null for a
-- custom (user-added) item.
create table scenario_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  template_key text,
  label text not null,
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index scenario_checklist_items_scenario_id_idx on scenario_checklist_items(scenario_id);

alter table scenario_checklist_items enable row level security;

create policy "scenario_checklist_items_select_own" on scenario_checklist_items
  for select using (user_id = auth.uid());
create policy "scenario_checklist_items_insert_own" on scenario_checklist_items
  for insert with check (user_id = auth.uid());
create policy "scenario_checklist_items_update_own" on scenario_checklist_items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "scenario_checklist_items_delete_own" on scenario_checklist_items
  for delete using (user_id = auth.uid());
