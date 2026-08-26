-- Extends the global vs. scenario-scoped model (PRD: global-scenario-rules,
-- migrations 20260815090000/20260815100000) to a fourth item type: cost
-- phases. A scenario's "switch to this Living Profile from this date" row
-- can now also be marked scope='global' (the same switch applies to every
-- scenario by default) instead of belonging to exactly one scenario. Unlike
-- events/savings-rules/property-ends, a per-scenario override here supersedes
-- only `profile_id` — the trigger `start_date` always stays the global row's
-- own (a deliberate product decision, not a technical limitation).

-- ─────────────────────────────────────────────────────────────────────────
-- severance_scenario_phases — add scope
-- ─────────────────────────────────────────────────────────────────────────
alter table severance_scenario_phases
  add column scope text not null default 'scenario' check (scope in ('global', 'scenario')),
  alter column scenario_id drop not null;

alter table severance_scenario_phases
  add constraint severance_scenario_phases_scope_scenario_id_check check (
    (scope = 'scenario' and scenario_id is not null) or
    (scope = 'global' and scenario_id is null)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- severance_global_phase_overrides
-- ─────────────────────────────────────────────────────────────────────────
-- A per-scenario supersede of a global phase's own `profile_id` — doesn't
-- fork the item, just a scenario-local target profile that wins over the
-- global default there. `start_date`/`label` are never overridden, so this
-- table carries no date field, unlike severance_global_property_end_overrides.
-- Same `suppressed`/`orphaned_item_name`/`stale_since` mechanics as the other
-- three override tables — `global_phase_id` is ON DELETE SET NULL so a
-- deleted global phase's overrides are flagged for review instead of
-- silently vanishing.
--
-- `profile_id` itself is ON DELETE RESTRICT, not SET NULL — deliberately
-- different from the other override tables' convention, because it points at
-- living_profiles (an unrelated table), not at this feature's own item table.
-- severance_scenario_phases.profile_id already has this same RESTRICT
-- guarantee ("a Living Profile referenced by a phase can't be deleted");
-- borrowing SET NULL here instead would risk violating this table's own
-- profile_id-or-suppressed check at delete time for any live override.
create table severance_global_phase_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  global_phase_id uuid references severance_scenario_phases(id) on delete set null,
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  profile_id uuid references living_profiles(id) on delete restrict,
  suppressed boolean not null default false,
  orphaned_item_name text,
  stale_since timestamptz,
  created_at timestamptz not null default now(),
  constraint severance_global_phase_overrides_profile_id_or_suppressed check (
    profile_id is not null or suppressed
  )
);

-- Plain (non-partial) unique index, deliberately — same reasoning as the
-- other three override tables' unique indexes: NULL <> NULL under standard
-- SQL uniqueness, so this still allows any number of stale rows
-- (global_phase_id nulled out by the FK above) per scenario, while still
-- letting `upsert(..., { onConflict: "global_phase_id,scenario_id" })`
-- target it.
create unique index severance_global_phase_overrides_unique
  on severance_global_phase_overrides(global_phase_id, scenario_id);
create index severance_global_phase_overrides_scenario_id_idx
  on severance_global_phase_overrides(scenario_id);

alter table severance_global_phase_overrides enable row level security;

create policy "severance_global_phase_overrides_select_own" on severance_global_phase_overrides
  for select using (user_id = auth.uid());
create policy "severance_global_phase_overrides_insert_own" on severance_global_phase_overrides
  for insert with check (user_id = auth.uid());
create policy "severance_global_phase_overrides_update_own" on severance_global_phase_overrides
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_global_phase_overrides_delete_own" on severance_global_phase_overrides
  for delete using (user_id = auth.uid());
