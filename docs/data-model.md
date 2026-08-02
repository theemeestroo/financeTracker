# Data Model

Source of truth: `supabase/migrations/*.sql`. This document reflects the **merged final schema** — later `ALTER TABLE` statements are folded in, dropped columns are omitted. Update it whenever a migration changes a table, column, or RLS policy.

## Conventions shared by almost every user-owned table

- `id uuid primary key default gen_random_uuid()` (via the `pgcrypto` extension)
- `user_id uuid not null references auth.users(id) on delete cascade default auth.uid()` — inserts don't need to pass `user_id` explicitly, it defaults from the session
- `created_at timestamptz not null default now()`
- RLS enabled with four near-identical policies per table: `<table>_select_own`, `<table>_insert_own`, `<table>_update_own`, `<table>_delete_own`, all gated on `user_id = auth.uid()`

Two tables break this pattern entirely — `tax_year_parameters` and `unemployment_benefit_parameters` are global reference data: no `user_id`, and only a `select`-for-`authenticated` policy (no insert/update/delete policy exists, so only a migration/service-role can write to them).

## Household & tax tables

### `household_members`

One row per person in the household. Central identity table referenced by nearly everything else.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK → `auth.users(id)` cascade |
| `name` | text | not null | — | |
| `created_at` | timestamptz | not null | `now()` | |
| `date_of_birth` | date | nullable | — | drives ALG I age-graduated duration |
| `statutory_health_insurance` | boolean | not null | `true` | GKV (statutory) vs PKV (private) |
| `health_insurance_addon_rate` | numeric(4,3) | nullable | — | GKV Zusatzbeitrag rate |
| `private_health_insurance_monthly_premium` | numeric(10,2) | nullable | — | PKV premium, used when not statutory |
| `count_private_health_insurance_as_outgoing` | boolean | not null | `true` | Only meaningful when not statutory — whether the PKV premium is synthesized as a monthly "Insurance" outgoing (`lib/finance/health-insurance-outgoing.ts`) on the Overview dashboard and in severance-scenario runway projections. Off is the escape hatch for a household already tracking the premium some other way (e.g. a manual commitment). |

Index: `household_members_user_id_idx (user_id)`. Standard 4 owner-only RLS policies.

Health-insurance fields were originally on `tax_profiles`; moved here because health insurance is a personal fact independent of whether a tax profile exists yet.

### `living_profiles`

A named household budget "scenario" of ongoing living costs/income (e.g. "Current", a post-move variant). The baseline profile is the default state for everything.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK → `auth.users(id)` cascade |
| `name` | text | not null | — | |
| `description` | text | nullable | — | |
| `is_baseline` | boolean | not null | `false` | |
| `current_liquid_savings` | numeric(10,2) | nullable | — | Only meaningful on the baseline row — seeds the "do-nothing" overlay (DESIGN v2 §2.5) on severance scenario charts. Null until the household sets it, in which case the overlay is simply not shown. |
| `created_at` | timestamptz | not null | `now()` | |

Indexes: `living_profiles_user_id_idx (user_id)`; unique partial index `living_profiles_one_baseline_per_user on (user_id) where is_baseline` — exactly one baseline profile per user.

RLS: select/insert/update are standard owner-only; **delete** additionally requires `not is_baseline` — the baseline profile can never be deleted.

Every new user gets a baseline row (`name = 'Current'`) automatically via the `handle_new_user()` trigger (see [Functions & triggers](#functions--triggers)).

### `tax_profiles`

Per-household-member German tax/payroll classification, used by the wage-tax engine.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK → `auth.users(id)` cascade |
| `household_member_id` | uuid | not null | — | FK → `household_members(id)` cascade; **unique** — 1:1 with member |
| `tax_class` | int | not null | — | CHECK 1–6 (Steuerklasse) |
| `church_tax` | boolean | not null | `false` | |
| `church_tax_state` | text | nullable | — | drives church tax rate |
| `has_children` | boolean | not null | `false` | |
| `created_at` | timestamptz | not null | `now()` | |

Index: `tax_profiles_user_id_idx (user_id)`. Standard 4 owner-only RLS policies.

## Income tables

### `income`

An income stream (salary, part-time, rental, other) belonging to a Living Profile, with rich salary-only compensation components.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `profile_id` | uuid | not null | — | FK → `living_profiles(id)` cascade |
| `name` | text | not null | — | |
| `gross_amount` | numeric(10,2) | not null | — | CHECK ≥ 0 |
| `type` | text | not null | — | CHECK in `salary` / `part_time` / `rental` / `other` |
| `frequency` | text | not null | — | CHECK in `monthly` / `quarterly` / `annual` |
| `start_date` / `end_date` | date | nullable | — | table CHECK: end ≥ start when both set |
| `tax_profile_id` | uuid | nullable | — | FK → `tax_profiles(id)` **SET NULL** |
| `christmas_bonus_pct` | numeric(5,2) | not null | `0` | CHECK 0–300; salary-only, % of one month's base (Weihnachtsgeld) |
| `holiday_pay_pct` | numeric(5,2) | not null | `0` | CHECK 0–300; salary-only (Urlaubsgeld) |
| `annual_bonus` | numeric(10,2) | not null | `0` | CHECK ≥ 0 |
| `annual_car_allowance` | numeric(10,2) | not null | `0` | CHECK ≥ 0; cash received |
| `monthly_pension_contribution` | numeric(10,2) | not null | `0` | CHECK ≥ 0; pre-tax deferred comp |
| `bonus_distribution` | text | not null | `'one_time'` | CHECK in `one_time` / `spread` |
| `monthly_company_car_cost` | numeric(10,2) | not null | `0` | CHECK ≥ 0; private-use payroll deduction |
| `rental_overhead_pct` | numeric(5,2) | not null | `0` | CHECK 0–100; rental-only vacancy/maintenance reserve |
| `currency` | text | not null | `'EUR'` | CHECK in `EUR` / `GBP` |
| `exchange_rate_to_eur` | numeric(10,6) | not null | `1` | CHECK > 0 |
| `created_at` | timestamptz | not null | `now()` | |

Indexes: `income_user_id_idx`, `income_profile_id_idx`. Standard 4 owner-only RLS policies. `household_member_id` was dropped from this table — ownership now lives in `income_splits`.

### `income_splits`

Many-to-many ownership/percentage attribution of an income row to household members.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `income_id` | uuid | not null | — | FK → `income(id)` cascade |
| `household_member_id` | uuid | not null | — | FK → `household_members(id)` cascade |
| `percentage` | numeric(5,2) | not null | — | CHECK > 0 and ≤ 100 |
| `created_at` | timestamptz | not null | `now()` | |

Unique on `(income_id, household_member_id)`. Indexes on both FKs. Standard 4 owner-only RLS policies.

Semantics: zero rows = unattributed/household income; one row at 100% = fully individual; multiple rows summing to 100% = shared. The net-of-tax calc uses each split's own member's tax profile.

## Commitments & properties tables

### `commitments`

A recurring or one-off household expense line item.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `profile_id` | uuid | not null | — | FK → `living_profiles(id)` cascade |
| `name` | text | not null | — | |
| `category` | text | not null | — | CHECK in `housing` / `utilities` / `insurance` / `subscriptions` / `debt_loans` / `transport` / `childcare_education` / `healthcare` / `groceries_living` / `leisure_discretionary` / `savings_investment` / `one_off` / `other` |
| `amount` | numeric(10,2) | not null | — | CHECK ≥ 0 |
| `frequency` | text | not null | — | CHECK in `monthly` / `quarterly` / `annual` / `one_off` |
| `essential` | boolean | not null | `true` | |
| `start_date` | date | not null | — | table CHECK: end ≥ start |
| `end_date` | date | nullable | — | |
| `property_id` | uuid | nullable | — | FK → `properties(id)` **SET NULL** |
| `created_at` | timestamptz | not null | `now()` | |

Indexes: `commitments_user_id_idx`, `commitments_profile_id_idx`, `commitments_property_id_idx`. Standard 4 owner-only RLS policies.

Originally had `ownership text` + a single `household_member_id` FK; both were dropped in favor of `commitment_splits` (individual commitments became 100% splits, shared commitments became unattributed/zero splits).

### `commitment_splits`

Many-to-many percentage attribution of a commitment to household members. Same shape/semantics as `income_splits`: unique on `(commitment_id, household_member_id)`, `percentage` CHECK > 0 and ≤ 100, indexes on both FKs, standard RLS.

### `properties`

A physical-asset grouping for commitments (e.g. a house's mortgage + insurance + utilities bundled together).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `profile_id` | uuid | not null | — | FK → `living_profiles(id)` cascade |
| `name` | text | not null | — | |
| `address` | text | nullable | — | |
| `notes` | text | nullable | — | |
| `end_date` | date | nullable | — | |
| `created_at` | timestamptz | not null | `now()` | |

Indexes: `properties_user_id_idx`, `properties_profile_id_idx`. Standard 4 owner-only RLS policies.

### `property_splits`

Household/percentage ownership split for a property, independent of the splits on commitments linked to it. Identical shape/semantics to `commitment_splits`.

## Severance scenario tables

### `severance_scenarios`

Lightweight household-level shell for a redundancy/severance "what-if" scenario. Per-person severance detail lives in `severance_scenario_packages` — a scenario can model two people's severance running concurrently on independent timelines.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `name` | text | not null | — | |
| `starting_balance` | numeric(10,2) | not null | `0` | seeds the runway projection |
| `notes` | text | nullable | — | |
| `created_at` | timestamptz | not null | `now()` | |

Index: `severance_scenarios_user_id_idx`. Standard 4 owner-only RLS policies.

This table originally carried all the per-person severance fields directly (`household_member_id`, `employer_name`, `monthly_base_salary`, `severance_multiplier`, `include_garden_leave`, etc.) — all moved to `severance_scenario_packages` when two-person scenarios were added; existing scenarios were migrated forward as each becoming one package.

### `severance_scenario_packages`

One row per household member taking severance within a scenario — the per-person severance calculation inputs.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `scenario_id` | uuid | not null | — | FK → `severance_scenarios(id)` cascade |
| `household_member_id` | uuid | not null | — | FK → `household_members(id)` cascade |
| `employer_name` | text | nullable | — | |
| `years_of_service` | numeric(4,1) | nullable | — | |
| `employment_start_date` | date | nullable | — | drives pension Wartezeit view |
| `monthly_base_salary` | numeric(10,2) | nullable | — | |
| `holiday_pay_pct` | numeric(5,2) | nullable | — | |
| `annual_bonus` | numeric(10,2) | not null | `0` | |
| `annual_car_benefit` | numeric(10,2) | not null | `0` | |
| `monthly_pension_contribution` | numeric(10,2) | not null | `0` | reference only, excluded from severance calc |
| `severance_multiplier` | numeric(4,2) | not null | `1` | × months per year of service |
| `include_bonus_in_calc` / `include_car_in_calc` / `include_christmas_bonus_in_calc` | boolean | not null | `false` | which components feed the severance base |
| `christmas_bonus_pct` | numeric(5,2) | nullable | — | |
| `include_garden_leave` | boolean | not null | `false` | |
| `notice_period_months` | numeric(4,1) | nullable | `6` | garden-leave duration |
| `gross_severance_override` | numeric(10,2) | nullable | — | manual override of the computed gross severance |
| `severance_start_date` | date | not null | — | |
| `claim_unemployment_benefit` | boolean | not null | `true` | whether this package's holder claims ALG I |
| `unemployment_benefit_defer_months` | numeric(4,1) | not null | `0` | deferred ALG I claim start |
| `months_insured_override` | numeric(4,1) | nullable | — | overrides the insured-months figure feeding ALG I duration |
| `new_job_start_date` | date | nullable | — | re-employment date; ends ALG I/health-gap modeling for this person |
| `sperrzeit_safe_confirmed` | boolean | not null | `false` | user's own assertion that the exit agreement's wording avoids a Sperrzeit, bypassing the heuristic in `lib/unemployment/sperrzeit.ts` |
| `created_at` | timestamptz | not null | `now()` | |

Unique on `(scenario_id, household_member_id)`. Indexes on `scenario_id`, `household_member_id`. Standard 4 owner-only RLS policies.

### `severance_scenario_events`

Discrete one-off or recurring-income cash-flow events within a scenario's timeline (e.g. a lump-sum outflow, a new job's recurring income starting).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `scenario_id` | uuid | not null | — | FK → `severance_scenarios(id)` cascade |
| `name` | text | not null | — | |
| `event_type` | text | not null | — | CHECK in `one_off_outflow` / `one_off_inflow` / `recurring_income_start` |
| `amount` | numeric(10,2) | nullable | — | one-off event types |
| `date` | date | not null | — | |
| `recurring_gross_amount` | numeric(10,2) | nullable | — | `recurring_income_start` only |
| `recurring_frequency` | text | nullable | — | CHECK in `monthly` / `quarterly` / `annual` |
| `recurring_tax_profile_id` | uuid | nullable | — | FK → `tax_profiles(id)` **SET NULL** |
| `recurring_end_date` | date | nullable | — | |
| `created_at` | timestamptz | not null | `now()` | |

Index: `severance_scenario_events_scenario_id_idx`. Standard 4 owner-only RLS policies.

### `severance_scenario_phases`

Lets a scenario switch to a different (wholesale) Living Profile from a given date, modeling e.g. a post-severance lifestyle change.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `scenario_id` | uuid | not null | — | FK → `severance_scenarios(id)` cascade |
| `profile_id` | uuid | not null | — | FK → `living_profiles(id)` **RESTRICT** — the only restrictive FK in the schema; a Living Profile referenced by a phase can't be deleted |
| `start_date` | date | not null | — | |
| `label` | text | nullable | — | |
| `created_at` | timestamptz | not null | `now()` | |

Index: `severance_scenario_phases_scenario_id_idx`. Standard 4 owner-only RLS policies.

### `severance_scenario_property_ends`

Lets a scenario end a specific property (and every commitment linked to it) from a given date, without a full profile phase swap.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `scenario_id` | uuid | not null | — | FK → `severance_scenarios(id)` cascade |
| `property_id` | uuid | not null | — | FK → `properties(id)` cascade |
| `end_date` | date | not null | — | |
| `created_at` | timestamptz | not null | `now()` | |

Unique on `(scenario_id, property_id)`. Index on `scenario_id`. Standard 4 owner-only RLS policies.

## Checklist table

### `scenario_checklist_items`

Redundancy admin checklist items for a scenario (e.g. "notify health insurer"), seeded from a static task template when a scenario's first severance package is added.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `scenario_id` | uuid | not null | — | FK → `severance_scenarios(id)` cascade |
| `template_key` | text | nullable | — | null = custom (user-added) item; non-null = seeded from the template |
| `label` | text | not null | — | |
| `due_date` | date | nullable | — | computed from `severance_start_date` at seed time |
| `completed` | boolean | not null | `false` | |
| `completed_at` | timestamptz | nullable | — | |
| `created_at` | timestamptz | not null | `now()` | |

Index: `scenario_checklist_items_scenario_id_idx`. Standard 4 owner-only RLS policies.

### `severance_scenario_savings_rules`

Sets aside part of one severance package's net lump sum (a fixed amount, or a % of it — resolved to a share of the household's *running balance*, not a fixed side-account) and applies a return every `accrual_frequency` to that period's actual opening balance, added as income in that package's runway projection (`lib/runway/savings.ts`) — it rises when income/a lump sum lands and falls as the household spends its runway down. Per-package, not per-scenario — a two-package scenario validates allocation headroom independently per person, same reasoning as the ALG I claim inputs living on `severance_scenario_packages`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` | PK |
| `user_id` | uuid | not null | `auth.uid()` | FK cascade |
| `scenario_id` | uuid | not null | — | FK → `severance_scenarios(id)` cascade |
| `package_id` | uuid | not null | — | FK → `severance_scenario_packages(id)` cascade |
| `name` | text | not null | — | e.g. "Index fund" |
| `allocation_type` | text | not null | — | `'amount'` \| `'percentage'` — exactly one of `amount`/`percentage` is set, app-side (Zod), same convention as `severance_scenario_packages.gross_severance_override` (no DB check constraint) |
| `amount` | numeric(12,2) | nullable | — | set when `allocation_type = 'amount'` |
| `percentage` | numeric(5,2) | nullable | — | 0–100, set when `allocation_type = 'percentage'` |
| `annual_return_pct` | numeric(6,2) | not null | `0` | e.g. `5.00` = 5%/yr |
| `accrual_frequency` | text | not null | — | `'monthly'` \| `'quarterly'` \| `'annually'` |
| `created_at` | timestamptz | not null | `now()` | |

Indexes: `severance_scenario_savings_rules_scenario_id_idx`, `severance_scenario_savings_rules_package_id_idx`. Standard 4 owner-only RLS policies.

## Reference / seed data tables

Both tables below are global (no `user_id`), RLS-enabled with **only** a `select`-for-`authenticated` policy — rows can only be written via a migration (service role bypasses RLS). Application code reads its working parameters directly from TypeScript (`lib/tax/parameters.ts`, `lib/unemployment/parameters.ts`), **not** from these tables — they're a durable, queryable mirror for reference/audit/future-admin-UI purposes, not the live read path. Keep them in sync with the TypeScript constants when either changes.

### `tax_year_parameters`

German income tax / social insurance / church tax parameters, keyed by year (seeded: 2025, 2026).

```json
{
  "incomeTax": {
    "basicAllowance": number,
    "zone1End": number, "zone2End": number, "zone3End": number,
    "zone1": { "a": number, "b": number },
    "zone2": { "a": number, "b": number, "base": number },
    "zone3Rate": number, "zone3Subtract": number,
    "zone4Rate": number, "zone4Subtract": number
  },
  "soli": {
    "rate": number, "milderungszoneRate": number,
    "freigrenzeSingle": number, "freigrenzeMarried": number
  },
  "churchTax": { "defaultRate": number, "lowRateStates": string[], "lowRate": number },
  "socialInsurance": {
    "pensionRate": number, "unemploymentRate": number,
    "healthBaseRate": number, "healthAvgAddOnRate": number,
    "careRate": number, "careChildlessSurcharge": number,
    "pensionUnemploymentCeilingMonthly": number,
    "healthCareCeilingMonthly": number
  },
  "allowances": {
    "employeeFlatRate": number,
    "specialExpensesFlatRate": number,
    "singleParentRelief": number
  }
}
```

### `unemployment_benefit_parameters`

Arbeitslosengeld I (ALG I) parameters — Leistungssatz rates, statutory duration table, age bonuses, voluntary-insurance/PKV-subsidy figures — keyed by year (seeded: 2025, 2026).

```json
{
  "year": number,
  "leistungssatzStandard": number,
  "leistungssatzWithChildren": number,
  "socialInsurancePauschaleRate": 0.20,
  "durationTable": [{ "insuredMonths": number, "durationMonths": number }],
  "ageDurationBonuses": [{ "minAge": number, "minInsuredMonths": number, "durationMonths": number }],
  "voluntaryGkvMinimumMonthlyBase": number,
  "pkvSubsidyCeilingMonthly": number
}
```

`socialInsurancePauschaleRate` (0.20 = the §153 SGB III 20% Sozialversicherungspauschale) replaced an earlier flat-rate approximation (`standardizedNetWageDeductionRate`, was 0.21) once the deduction was corrected to the real formula — see `docs/business-logic.md`. `voluntaryGkvMinimumMonthlyBase` and `pkvSubsidyCeilingMonthly` are flagged in migration comments as best-effort approximations that need periodic re-verification against current Bundesagentur/GKV-Spitzenverband publications.

## Functions & triggers

### `public.handle_new_user()`

```sql
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
```

`SECURITY DEFINER` is required because it fires from the `auth` schema before/without a session RLS context and must write into `public` tables regardless. Trigger: `on_auth_user_created` — `after insert on auth.users for each row execute procedure public.handle_new_user()`.

Effect: every newly-created auth user automatically gets one baseline `living_profiles` row (`'Current'`) and one `household_members` row (`'You'`).

No other functions, triggers, or views exist — everything else is plain tables + RLS policies + indexes.

## Entity-relationship summary

```
auth.users (Supabase managed)
  └─< household_members
        ├─< tax_profiles (1:1, unique household_member_id)
        ├─< commitment_splits >─┐
        ├─< property_splits   >─┤
        ├─< income_splits     >─┤
        └─< severance_scenario_packages

  └─< living_profiles (1 baseline per user)
        ├─< commitments ──> properties (nullable, SET NULL)
        ├─< income
        ├─< properties
        └─< severance_scenario_phases (ON DELETE RESTRICT)

commitments ──< commitment_splits >── household_members
properties  ──< property_splits   >── household_members
income      ──< income_splits     >── household_members

severance_scenarios
  ├─< severance_scenario_packages >── household_members
  │     └─< severance_scenario_savings_rules
  ├─< severance_scenario_events ──> tax_profiles (nullable, SET NULL)
  ├─< severance_scenario_phases ──> living_profiles (RESTRICT)
  ├─< severance_scenario_property_ends ──> properties
  └─< scenario_checklist_items

tax_year_parameters (global reference, keyed by year)
unemployment_benefit_parameters (global reference, keyed by year)
```

**ON DELETE behavior worth remembering:**

- Almost everything cascades from `auth.users` and from its immediate parent (household member / scenario / commitment / property / income), so deleting a user or a top-level entity cleans up its whole subtree.
- Exceptions: `commitments.property_id`, `income.tax_profile_id`, `severance_scenario_events.recurring_tax_profile_id` are `ON DELETE SET NULL` (soft unlink rather than cascade delete).
- `severance_scenario_phases.profile_id` is `ON DELETE RESTRICT` — the only restrictive FK in the schema.
