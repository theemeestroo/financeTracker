-- Extends the global vs. scenario-scoped model (PRD: global-scenario-rules,
-- migration 20260815090000) to a third item type: property changes. A
-- scenario's "end this property" row can now also be marked scope='global'
-- (the property ends the same way in every scenario) instead of belonging
-- to exactly one scenario, with the same per-scenario override/duplicate/
-- stale-review mechanics events and savings rules already have — just
-- superseding `end_date` (a date) instead of a numeric amount.

-- ─────────────────────────────────────────────────────────────────────────
-- severance_scenario_property_ends — add scope
-- ─────────────────────────────────────────────────────────────────────────
alter table severance_scenario_property_ends
  add column scope text not null default 'scenario' check (scope in ('global', 'scenario')),
  alter column scenario_id drop not null;

alter table severance_scenario_property_ends
  add constraint severance_scenario_property_ends_scope_scenario_id_check check (
    (scope = 'scenario' and scenario_id is not null) or
    (scope = 'global' and scenario_id is null)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- severance_global_property_end_overrides
-- ─────────────────────────────────────────────────────────────────────────
-- A per-scenario supersede of a global property-end's own `end_date` —
-- doesn't fork the item, just a scenario-local date that wins over the
-- global default there. Same `suppressed`/`orphaned_item_name`/`stale_since`
-- mechanics as severance_global_event_overrides (see that table's own
-- comment in 20260815090000_global_scenario_rules.sql) — `global_property_end_id`
-- is ON DELETE SET NULL rather than cascade so a deleted global item's
-- overrides are flagged for review instead of silently vanishing.
create table severance_global_property_end_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  global_property_end_id uuid references severance_scenario_property_ends(id) on delete set null,
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  end_date date,
  suppressed boolean not null default false,
  orphaned_item_name text,
  stale_since timestamptz,
  created_at timestamptz not null default now(),
  constraint severance_global_property_end_overrides_end_date_or_suppressed check (
    end_date is not null or suppressed
  )
);

-- Plain (non-partial) unique index, deliberately — same reasoning as
-- severance_global_event_overrides_unique: NULL <> NULL under standard SQL
-- uniqueness, so this still allows any number of stale rows
-- (global_property_end_id nulled out by the FK above) per scenario, while
-- still letting `upsert(..., { onConflict: "global_property_end_id,scenario_id" })`
-- target it.
create unique index severance_global_property_end_overrides_unique
  on severance_global_property_end_overrides(global_property_end_id, scenario_id);
create index severance_global_property_end_overrides_scenario_id_idx
  on severance_global_property_end_overrides(scenario_id);

alter table severance_global_property_end_overrides enable row level security;

create policy "severance_global_property_end_overrides_select_own" on severance_global_property_end_overrides
  for select using (user_id = auth.uid());
create policy "severance_global_property_end_overrides_insert_own" on severance_global_property_end_overrides
  for insert with check (user_id = auth.uid());
create policy "severance_global_property_end_overrides_update_own" on severance_global_property_end_overrides
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_global_property_end_overrides_delete_own" on severance_global_property_end_overrides
  for delete using (user_id = auth.uid());
