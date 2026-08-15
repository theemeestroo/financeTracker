-- Global vs. scenario-scoped events & savings rules (PRD: global-scenario-rules).
-- A one-off event or savings rule can now be marked scope='global' (applies
-- to every scenario) instead of belonging to exactly one scenario. Global
-- savings rules key off household_member_id rather than package_id — a
-- package is inherently scenario-specific (one person's severance *within
-- one scenario*), so a global rule resolves against whichever package that
-- scenario itself has for the same household member (see
-- app/(app)/severance-scenarios/global-items.ts), same member-based remap
-- duplicate-actions.ts already does when cloning a scenario's rules.

-- ─────────────────────────────────────────────────────────────────────────
-- severance_scenario_events — add scope
-- ─────────────────────────────────────────────────────────────────────────
alter table severance_scenario_events
  add column scope text not null default 'scenario' check (scope in ('global', 'scenario')),
  alter column scenario_id drop not null;

alter table severance_scenario_events
  add constraint severance_scenario_events_scope_scenario_id_check check (
    (scope = 'scenario' and scenario_id is not null) or
    (scope = 'global' and scenario_id is null)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- severance_scenario_savings_rules — add scope + household_member_id
-- ─────────────────────────────────────────────────────────────────────────
alter table severance_scenario_savings_rules
  add column scope text not null default 'scenario' check (scope in ('global', 'scenario')),
  add column household_member_id uuid references household_members(id) on delete cascade,
  alter column scenario_id drop not null,
  alter column package_id drop not null;

alter table severance_scenario_savings_rules
  add constraint severance_scenario_savings_rules_scope_fields_check check (
    (scope = 'scenario' and scenario_id is not null and package_id is not null and household_member_id is null) or
    (scope = 'global' and scenario_id is null and package_id is null and household_member_id is not null)
  );

create index severance_scenario_savings_rules_household_member_id_idx
  on severance_scenario_savings_rules(household_member_id);

-- ─────────────────────────────────────────────────────────────────────────
-- severance_global_event_overrides
-- ─────────────────────────────────────────────────────────────────────────
-- A per-scenario supersede of a global event's own amount/recurring_gross_amount
-- (whichever applies for its event_type) — doesn't fork the item, just a
-- scenario-local number that wins over the global default there. `suppressed`
-- is set (value left null) when the scenario has instead been given its own
-- independent scope='scenario' copy via "duplicate into this scenario" — the
-- global item stops contributing to that one scenario's projection so the
-- duplicate doesn't double-count it, without this being a general
-- applies-to-a-subset-of-scenarios feature (PRD explicitly rules that out).
--
-- global_event_id is ON DELETE SET NULL rather than cascade: deleting the
-- global event doesn't delete these rows, it flags them (orphaned_item_name +
-- stale_since, set by the delete action just before the delete) so the user
-- can review which scenarios had an override tied to the now-deleted item.
create table severance_global_event_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  global_event_id uuid references severance_scenario_events(id) on delete set null,
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  value numeric(10, 2),
  suppressed boolean not null default false,
  orphaned_item_name text,
  stale_since timestamptz,
  created_at timestamptz not null default now(),
  constraint severance_global_event_overrides_value_or_suppressed check (
    value is not null or suppressed
  )
);

-- Plain (non-partial) unique index, deliberately — NULL <> NULL under
-- standard SQL uniqueness, so this still allows any number of stale rows
-- (global_event_id nulled out by the FK above) per scenario, while still
-- letting `upsert(..., { onConflict: "global_event_id,scenario_id" })`
-- target it — Postgres can't infer a *partial* unique index as an ON
-- CONFLICT target without repeating its predicate, which supabase-js upsert
-- has no way to pass.
create unique index severance_global_event_overrides_unique
  on severance_global_event_overrides(global_event_id, scenario_id);
create index severance_global_event_overrides_scenario_id_idx
  on severance_global_event_overrides(scenario_id);

alter table severance_global_event_overrides enable row level security;

create policy "severance_global_event_overrides_select_own" on severance_global_event_overrides
  for select using (user_id = auth.uid());
create policy "severance_global_event_overrides_insert_own" on severance_global_event_overrides
  for insert with check (user_id = auth.uid());
create policy "severance_global_event_overrides_update_own" on severance_global_event_overrides
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_global_event_overrides_delete_own" on severance_global_event_overrides
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- severance_global_savings_rule_overrides
-- ─────────────────────────────────────────────────────────────────────────
-- Same shape as severance_global_event_overrides, one row per (global rule,
-- scenario) — value supersedes whichever of amount/percentage the rule's own
-- allocation_type uses.
create table severance_global_savings_rule_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  global_rule_id uuid references severance_scenario_savings_rules(id) on delete set null,
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  value numeric(12, 2),
  suppressed boolean not null default false,
  orphaned_item_name text,
  stale_since timestamptz,
  created_at timestamptz not null default now(),
  constraint severance_global_savings_rule_overrides_value_or_suppressed check (
    value is not null or suppressed
  )
);

-- Plain (non-partial) unique index — same reasoning as
-- severance_global_event_overrides_unique above.
create unique index severance_global_savings_rule_overrides_unique
  on severance_global_savings_rule_overrides(global_rule_id, scenario_id);
create index severance_global_savings_rule_overrides_scenario_id_idx
  on severance_global_savings_rule_overrides(scenario_id);

alter table severance_global_savings_rule_overrides enable row level security;

create policy "severance_global_savings_rule_overrides_select_own" on severance_global_savings_rule_overrides
  for select using (user_id = auth.uid());
create policy "severance_global_savings_rule_overrides_insert_own" on severance_global_savings_rule_overrides
  for insert with check (user_id = auth.uid());
create policy "severance_global_savings_rule_overrides_update_own" on severance_global_savings_rule_overrides
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "severance_global_savings_rule_overrides_delete_own" on severance_global_savings_rule_overrides
  for delete using (user_id = auth.uid());
