# Design & Implementation Plan: Household Financial Runway Tracker

Companion to [PRD-financial-runway-app.md](PRD-financial-runway-app.md). This document translates the PRD into a concrete architecture, data model, module design, and a phased build sequence.

## 1. Architecture Decision (resolves PRD open question #1)

**Option B — Hosted web app: Next.js + Supabase + Vercel.**

`claude.md` already commits this repo to Next.js App Router conventions (`loading.tsx`/`error.tsx` per route group), Tailwind + shadcn/ui, and Supabase-style RLS policies — so the hosting question in the PRD is effectively pre-decided by the existing project conventions. Documenting it here so it's explicit rather than implied:

- **Why B over A**: you get access from any device, and iteration (schema changes, new scenario logic) is much faster with a hosted Postgres + auth than a local SQLite file you'd have to sync yourself.
- **Mitigating the sensitivity concern (PRD §8 con)**: this stays a single-project, single-user Supabase instance (not shared infra), RLS locked to your user id on every table, no third-party analytics/tracking on financial pages, and Vercel env vars (not client bundles) hold any secrets. If this ever feels insufficient, the data model is portable enough to migrate to local Postgres/SQLite later — nothing in the design below is Supabase-proprietary beyond auth and RLS.

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Server Components for data-heavy pages, Server Actions for mutations |
| Language | TypeScript | strict mode |
| DB | Supabase Postgres | RLS on every table, scoped to `auth.uid()` |
| Auth | Supabase Auth | single allow-listed email (yours); no signup flow |
| Styling | Tailwind CSS + shadcn/ui | per `claude.md` design language |
| Charts | Recharts | depletion curve, category breakdown, scenario comparison |
| Forms | react-hook-form + zod | inline validation, `role="alert"` per `claude.md` |
| Hosting | Vercel | preview deployments per branch |
| Testing | Vitest | unit tests for tax engine, severance calculator & runway math (highest-risk logic) |

## 3. High-Level Architecture

```
Browser
  └─ Next.js App Router (Vercel)
       ├─ Server Components: read data via Supabase server client (RLS-scoped)
       ├─ Server Actions: mutations (create/update/delete commitments, income, severance scenarios)
       └─ Pure calculation modules (no I/O):
            ├─ lib/tax/           German tax engine (§5)
            ├─ lib/severance/     Severance package calculator (§6)
            └─ lib/runway/        Runway projection engine (§7)
  └─ Supabase
       ├─ Postgres (tables in §4)
       ├─ Auth (single user)
       └─ RLS policies (owner-only access on every table)
```

The tax engine, severance calculator, and runway engine are deliberately **pure functions with no DB/network access** — inputs in, numbers out. This matches the PRD's requirement (§6.4) that the tax module be reviewable/testable independently, and makes all three trivial to unit test.

## 4. Data Model

Expands the PRD's draft (§7) into actual Postgres DDL-level detail. All tables have `user_id uuid references auth.users not null default auth.uid()` and an RLS policy `user_id = auth.uid()` for all operations — omitted below per-table for brevity, stated once here.

```sql
-- Household members
household_members (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz default now()
)

-- Living Profiles: a reusable household cost/income snapshot representing a
-- given living situation — e.g. "Current (Munich)", "Thailand move",
-- "Downsized house". Every user has exactly one baseline profile representing
-- their actual current household; commitments/income CRUD (Phase 1) always
-- operates on the baseline by default, so this is invisible until you start
-- building alternate scenarios (see §7, §10 Phase 5).
living_profiles (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  is_baseline boolean not null default false, -- exactly one true row per user; cannot be deleted
  created_at timestamptz default now()
)

-- Commitments: all recurring AND one-off household outgoings
commitments (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid references living_profiles not null, -- which living situation this belongs to (defaults to the user's baseline)
  name text not null,
  category text not null,           -- housing | utilities | insurance | subscriptions | debt_loans |
                                     -- transport | childcare_education | healthcare | groceries_living |
                                     -- leisure_discretionary | savings_investment | one_off | other
  amount numeric(10,2) not null,
  frequency text not null,          -- monthly | quarterly | annual | one_off
  essential boolean not null default true,
  start_date date not null,         -- for one_off frequency, this is the single occurrence date; end_date ignored
  end_date date,                    -- nullable = ongoing (ignored for one_off)
  created_at timestamptz default now()
)

-- Who a commitment is attributed to, and in what proportion. Zero rows for a
-- commitment = a general household cost attributed to no one in particular.
-- One row at 100% = fully individual. Two or more rows (summing to 100%) =
-- shared, split by percentage — e.g. rent split 60/40 between two partners.
commitment_splits (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  commitment_id uuid references commitments not null,
  household_member_id uuid references household_members not null,
  percentage numeric(5,2) not null, -- 0 < percentage <= 100
  created_at timestamptz default now(),
  unique (commitment_id, household_member_id)
)

-- Income sources
income (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid references living_profiles not null, -- which living situation this belongs to (defaults to the user's baseline)
  household_member_id uuid references household_members not null,
  name text not null,
  gross_amount numeric(10,2) not null,
  type text not null,               -- salary | part_time | rental | other
  frequency text not null,          -- monthly | quarterly | annual
  start_date date,                  -- nullable = already active
  end_date date,                    -- nullable = ongoing / known last day
  tax_profile_id uuid references tax_profiles, -- which profile nets this income
  created_at timestamptz default now()
)

-- Tax profile: net-conversion parameters per household member
tax_profiles (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  household_member_id uuid references household_members not null,
  tax_class int not null,           -- Steuerklasse 1-6
  church_tax boolean not null default false,
  church_tax_state text,            -- determines 8% vs 9% rate
  has_children boolean default false, -- affects Pflegeversicherung surcharge + child allowance
  statutory_health_insurance boolean default true, -- vs private (affects contribution calc)
  health_insurance_addon_rate numeric(4,3), -- Zusatzbeitrag, defaults to avg if null
  created_at timestamptz default now()
)

-- Tax year parameters (versioned reference data, not user data — see §5)
tax_year_parameters (
  year int primary key,
  params jsonb not null             -- brackets, thresholds, contribution rates/caps
)

-- Severance Scenarios: named "what if I take this package" models.
-- Two ways to arrive at a gross severance figure — either let the package
-- calculator derive it, or override with a known/negotiated number.
severance_scenarios (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  household_member_id uuid references household_members not null, -- whose severance this is

  -- Package calculator inputs (see §6 Severance Package Calculator) —
  -- a self-contained salary snapshot, independent of the ongoing `income` table,
  -- since a scenario should stay stable even if current income later changes.
  employer_name text,                     -- free text, informational only
  years_of_service numeric(4,1),
  employment_start_date date,             -- drives the pension Wartezeit view
  monthly_base_salary numeric(10,2),
  holiday_pay_pct numeric(5,2),           -- e.g. 79 = 79% of one month; informational, not part of the formula
  annual_bonus numeric(10,2) default 0,
  annual_car_benefit numeric(10,2) default 0,
  monthly_pension_contribution numeric(10,2) default 0, -- BAV; informational only, excluded from severance calc
  severance_multiplier numeric(4,2) not null default 1, -- months of pay per year of service
  include_bonus_in_calc boolean not null default false,
  include_car_in_calc boolean not null default false,
  include_garden_leave boolean not null default false,
  notice_period_months numeric(4,1) default 6,
  gross_severance_override numeric(10,2), -- if set, skips the formula and uses this figure directly

  severance_start_date date,              -- when net severance lands / runway clock starts
  starting_balance numeric(10,2) not null default 0, -- net severance (+ net notice-period pay if applicable) + any existing buffer
  notes text,
  created_at timestamptz default now()
)

-- One-off events within a severance scenario (incl. new part-time job starts, lump-sum outflows)
severance_scenario_events (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  scenario_id uuid references severance_scenarios not null,
  name text not null,
  event_type text not null,         -- one_off_outflow | one_off_inflow | recurring_income_start
  amount numeric(10,2),             -- for one-off events
  date date not null,
  -- fields used only when event_type = recurring_income_start:
  recurring_gross_amount numeric(10,2),
  recurring_frequency text,
  recurring_tax_profile_id uuid references tax_profiles,
  recurring_end_date date,
  created_at timestamptz default now()
)

-- Timeline of which Living Profile is active during a severance scenario.
-- Every scenario has at least one phase, auto-created at severance_start_date
-- pointing at the baseline profile — simple scenarios never need to think
-- about phases at all. Additional phases model a switch to a different living
-- situation partway through (e.g. "move to Thailand in month 6", or "downsize
-- to a cheaper house" as a second phase after an initial holding period).
severance_scenario_phases (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null,
  scenario_id uuid references severance_scenarios not null,
  profile_id uuid references living_profiles not null,
  start_date date not null,        -- active until the next phase's start_date, or the runway horizon ends
  label text,                      -- optional override, e.g. "Move to Thailand"
  created_at timestamptz default now()
)
```

Notes vs. PRD draft:
- Added `tax_profiles` as its own table (PRD §7 sketched it inline) since a household member needs one profile reused across their income entries and severance scenarios.
- Added `tax_year_parameters` — German tax brackets/rates change annually; hardcoding them defeats the "reviewable independently" goal in PRD §6.4. This table (or an equivalent versioned config module — see §5) lets a new year's rules be added without a code change to the calculation logic.
- Widened `commitments` beyond recurring bills: added a `one_off` frequency plus a broader category set, so a single purchase — not just recurring joint household bills — can be tracked alongside the rest.
- Added `commitment_splits` as a many-to-many join (commitment ↔ household member, with a percentage) rather than the simpler `shared`/`individual` + single `household_member_id` pair the first draft of this schema used. A binary flag can't express "rent split 60/40 between two partners" — only "shared" (unattributed) or "one person, 100%". The join table handles all three cases uniformly: zero rows = unattributed household cost, one row at 100% = individual, two or more rows summing to 100% = a percentage split. Every view that shows "whose cost is this" (commitments table, dashboard category breakdown, the owner filter) prorates by `percentage` when scoped to one person, rather than double-counting the full amount for everyone it's split between.
- Renamed `scenarios`/`scenario_events` to `severance_scenarios`/`severance_scenario_events` and expanded the scenario from a single manually-entered gross figure into a full **severance package calculator** (base salary, bonus, car benefit, years of service, multiplier, garden leave/notice pay, optional override) — modeled directly on the `severance-scenarios.jsx` mock — so the negotiation-sizing inputs are persisted and re-computable, not a one-off spreadsheet-style calculation done outside the app.
- `severance_scenario_events` folds "new part-time job" and "one-off cost" into one table with an `event_type` discriminator rather than two separate tables, since both are timeline events a scenario projection walks through in order.
- Added `living_profiles` plus a `profile_id` on both `commitments` and `income`, and a new `severance_scenario_phases` join table, so a scenario can model a wholesale change of living situation mid-timeline (e.g. drop all German outgoings and move to Thailand, or sell up and downsize) rather than only incremental one-off events. **Design choice**: generalized the existing `commitments`/`income` tables to belong to a profile (baseline = your real current household, by default) rather than building a separate scenario-only override system. This costs one FK on each table but means the exact same CRUD/UI built in Phase 1 is reused to build out an alternate profile — no parallel "scenario commitments" editor needed — and an alternate profile (e.g. "Thailand") is a reusable, nameable thing you can attach to more than one scenario. Profiles are **live, not snapshotted**: editing a profile's line items updates every scenario phase referencing it going forward, consistent with how editing a baseline commitment already changes today's dashboard — this intentionally differs from the severance package snapshot in §6, which *is* frozen per-scenario, because the two have different jobs (replaying a fixed negotiation input vs. iterating on a "what would this budget actually look like" estimate).

## 5. Tax Calculator Module (`lib/tax/`)

Pure, side-effect-free, and the highest-accuracy-risk part of the build (PRD target: ~99% vs. actual).

**Inputs**: gross amount, income type (regular salary vs. severance), a `TaxProfile`, and a `TaxYearParameters` object.
**Output**: net amount + a breakdown (income tax, soli, church tax, pension/health/care/unemployment insurance) for transparency/debugging.

Design:
- `calculateWageTax(taxableIncome, taxClass, year)` — implements the §32a EStG formula (piecewise: zero band under Grundfreibetrag, two progressive zones, two flat zones at 42%/45%), parameterized by year so 2024/2025/2026 coexist.
- `calculateSocialContributions(grossMonthly, profile, year)` — Rentenversicherung, Arbeitslosenversicherung, Krankenversicherung (+ Zusatzbeitrag), Pflegeversicherung (+ childless surcharge), each capped at its own Beitragsbemessungsgrenze.
- `calculateSoli(incomeTax, profile, year)` — applies the Freigrenze (most incomes below the high-earner threshold owe €0 since the 2021 reform).
- `calculateChurchTax(incomeTax, profile)` — 8% or 9% depending on state, only if `church_tax = true`.
- `calculateSeveranceNet(grossSeverance, regularAnnualTaxableIncome, profile, year)` — implements **Fünftelregelung**: `tax_on_severance = 5 × (tax(regular + severance/5) − tax(regular))`.
- `calculateMarginalTax(grossSeverance, regularAnnualTaxableIncome, profile, year)` — tax if the severance were instead taxed as ordinary income in one go; used only for the "tax saved via Fünftelregelung vs. marginal" comparison the severance calculator surfaces (§6).
- `netMonthlyIncome(income: Income, profile, year)` — orchestrates the above for a recurring income row.

Reference data: seed `tax_year_parameters` with 2025 and 2026 brackets/thresholds/caps at build time (Phase 3). Each year's parameters are a data change, not a code change — this is the mechanism that keeps the module accurate as rules shift without needing a rewrite.

Testability: this module gets the most unit-test investment (Phase 3) — known gross→net pairs (e.g. from official Brutto-Netto-Rechner outputs) as fixtures, since correctness here directly determines whether every runway number downstream is trustworthy.

## 6. Severance Package Calculator (`lib/severance/`)

Also pure. Models `severance-scenarios.jsx` — sizing and negotiating the gross severance figure itself, upstream of the runway projection, which the PRD's original draft treated as a single manually-entered number (PRD §6.5).

**Inputs**: the package-calculator fields on `severance_scenarios` (§4).

- `calculateSeverancePackage(scenario)`:
  - `monthlyBase = monthly_base_salary + (include_bonus_in_calc ? annual_bonus / 12 : 0) + (include_car_in_calc ? annual_car_benefit / 12 : 0)`
  - `severanceGross = gross_severance_override ?? (severance_multiplier × years_of_service × monthlyBase)`
  - `noticePay = include_garden_leave ? notice_period_months × monthly_base_salary : 0`
  - `totalGrossPackage = severanceGross + noticePay`
- Net conversion delegates to the tax engine (§5): `calculateSeveranceNet(severanceGross, regularAnnualTaxableIncome, taxProfile, year)` via Fünftelregelung, plus `calculateMarginalTax` for the "tax saving vs. marginal rate" comparison the mock surfaces (mirrors its Tax Analysis view: gross, marginal tax, Fünftelregelung tax, tax saved, net — by multiplier).
- `regularAnnualTaxableIncome` for this calculation is derived from the scenario's **own** salary snapshot (`monthly_base_salary × 12 + annual_bonus`, minus standard SV/BAV deductions), not pulled from the live `income` table — a scenario should stay a stable, replayable snapshot even if the household's actual income records change later.
- `pensionWartezeit(employment_start_date)` — Germany's 5-year (Wartezeit) statutory pension qualifying period; returns the eligibility date (`employment_start_date + 5 years`) and a departure-timing table (mirrors the mock's "Departure timing vs. pension eligibility" view), so a garden-leave end date can be checked against it.

UI-layer reference data (not persisted — descriptive presets over the numeric fields, playing the same role as `MULTIPLIER_LABELS`/`SCENARIO_CONFIGS` in the mock):
- Multiplier presets with a tag + description (e.g. 1× "Minimum — statutory floor", 1.75× "Good — achievable with negotiation") to help pick a `severance_multiplier` value.
- Named toggle presets ("Base only", "+ Garden leave", "+ Bonus in base", "Full package") that just set `include_bonus_in_calc` / `include_car_in_calc` / `include_garden_leave` combinations — a UI shortcut, not a stored entity, since the underlying booleans are already persisted per scenario.

Output feeds two places: the scenario's `starting_balance` (net severance, plus net notice-period salary if `include_garden_leave`), and the runway engine's timeline (§7) — when garden leave is included, the notice period appears as continued net salary income before the severance lump sum lands, rather than being folded into the starting balance as if received on day one.

## 7. Runway Engine (`lib/runway/`)

Also pure. Takes a fully-resolved severance scenario (net severance and notice pay from §6, starting balance, recurring/one-off commitments, recurring income, one-off events) and produces a month-by-month balance series.

```
projectRunway(scenario: ResolvedSeveranceScenario): { date: string; balance: number }[]
```

Algorithm: walk month-by-month from `severance_start_date`:
1. Resolve the scenario's `severance_scenario_phases`, sorted by `start_date` ascending (always at least one — auto-created at scenario creation, pointing at the baseline `living_profile`).
2. If `include_garden_leave`, prepend `notice_period_months` of net monthly salary (via the tax engine, on `monthly_base_salary`) before the lump-sum starting balance applies.
3. Once the notice period (if any) ends, start the balance at `starting_balance` (net severance + any existing buffer).
4. Each month, determine the **active profile** — the phase with the latest `start_date <= current month` — and subtract/add *that profile's* commitments and income only. Switching profiles at a phase boundary is a wholesale swap of the recurring cost/income base (e.g. every German commitment drops off, a smaller Thailand set picks up), not an incremental diff against the previous phase.
5. Within the active profile, every commitment is subtracted at its **full amount** regardless of how its `commitment_splits` attribute it to household members (monthly-equivalent, respecting each commitment's own `start_date`/`end_date` *within* the profile — so e.g. a Thailand lease starting a month after landing doesn't need its own phase; `one_off` commitments apply in their occurrence month only), and income is added net (via the tax engine, respecting `start_date`/`end_date`). Splits only matter for *whose* view a cost shows up in (commitments table, dashboard), never for the household-wide runway total.
6. Apply any `severance_scenario_events` dated in that month (one-off in/outflows, or activate a `recurring_income_start` event from that month on) — these are scenario-level and apply regardless of which profile is active.
7. Record the running balance; stop either at a configurable horizon (e.g. 10 years) or once the trend makes depletion/non-depletion clear.
8. Depletion date = first month balance crosses zero (or `null` if it never does within the horizon — i.e., the scenario is sustainable).

Frequency normalization (quarterly/annual/one_off → monthly-equivalent) is a shared helper (`toMonthlyEquivalent(amount, frequency, date?)`) used by both this engine and the dashboard surplus/deficit calc (PRD §6.3), so the two stay consistent by construction.

## 8. API / Server Actions

No REST/GraphQL API surface needed — Server Actions colocated with routes, since this is a single-consumer app (PRD §5: solo tool, no external API consumers).

| Action | Purpose |
|---|---|
| `createCommitment` / `updateCommitment` / `deleteCommitment` | Commitments CRUD, incl. member splits + one-off entries |
| `createIncome` / `updateIncome` / `deleteIncome` | Income CRUD |
| `upsertTaxProfile` | Per-household-member tax parameters |
| `createLivingProfile` / `updateLivingProfile` / `deleteLivingProfile` | Living profile CRUD (baseline profile is seeded per user and cannot be deleted) |
| `cloneLivingProfile(profileId, newName)` | Duplicate an existing profile's commitments/income as a starting point (e.g. clone baseline, then strip it down for "Thailand") |
| `createSeveranceScenario` / `updateSeveranceScenario` / `deleteSeveranceScenario` | Severance scenario CRUD, incl. package calculator fields |
| `addSeveranceScenarioEvent` / `updateSeveranceScenarioEvent` / `deleteSeveranceScenarioEvent` | One-off events within a severance scenario |
| `addScenarioPhase` / `updateScenarioPhase` / `deleteScenarioPhase` | Manage the profile timeline (§7) within a severance scenario |
| `getDashboardSummary` (server component data fetch) | Surplus/deficit + category breakdown, filterable by owner |
| `calculateSeverancePackage(scenarioId)` | Gross/net package breakdown + pension Wartezeit timeline (§6) |
| `getSeveranceScenarioProjection(scenarioId)` | Resolves scenario (incl. package calc) + runs `projectRunway` |
| `compareSeveranceScenarios(scenarioIds[])` | Runs `projectRunway` per scenario, returns aligned series for chart overlay |

## 9. Frontend Structure

```
app/
  (dashboard)/
    page.tsx                 -- overview: surplus/deficit, category chart, owner filter
    loading.tsx / error.tsx
  commitments/
    page.tsx                 -- baseline Living Profile only; table + total monthly-equivalent, filterable by linked household member and category
    new/ [id]/edit
  income/
    page.tsx                 -- baseline Living Profile only
    new/ [id]/edit
  household/
    page.tsx                 -- members + tax profiles
  severance-scenarios/
    page.tsx                 -- list of named severance scenarios
    [id]/page.tsx             -- package calculator, tax breakdown, pension Wartezeit view, cost-phase timeline, depletion chart, events
    compare/page.tsx          -- multi-scenario comparison table/chart
components/
  ui/                        -- shadcn primitives
  charts/                    -- Recharts wrappers (depletion-chart, category-breakdown-chart, comparison-chart)
lib/
  tax/                       -- §5
  severance/                 -- §6
  runway/                    -- §7
  supabase/                  -- server/client helpers
```

Alternate Living Profiles (Thailand, downsized house, etc.) have no dedicated top-level nav entry — they're created and edited inline from a severance scenario's "Cost Phases" section (clone-from-baseline or start blank, then edit commitments/income scoped to that profile using the same forms as the top-level Commitments/Income pages), keeping the common case (one household, no alternate profiles) exactly as simple as before.

Sidebar sections (Linear-style, per `claude.md`): Overview, Commitments, Income, Household, Severance Scenarios.

## 10. Phased Implementation Plan

Each phase ends in a usable, demo-able state. Ordered so the riskiest/most load-bearing logic (tax engine, severance calculator, runway engine) lands before the polish work, and so you have something answering real PRD questions as early as possible.

### Phase 0 — Scaffolding & Infra
- Next.js app init (TypeScript, App Router), Tailwind + shadcn/ui installed and themed per `claude.md`.
- Supabase project: schema migration for all tables in §4, RLS policies, single-user auth (allow-listed email).
- New-user init creates the one baseline `living_profiles` row; all commitments/income created in later phases default to it via `profile_id`.
- Base layout: sidebar nav, auth gate middleware, empty dashboard shell.
- Vercel deployment wired up (preview + prod).
- **Done when**: you can log in and see an empty, styled shell deployed at a URL.

### Phase 1 — Commitments & Income CRUD
- Full CRUD for `household_members`, `income` (forms with zod validation, tables per `claude.md` conventions).
- Commitments CRUD covering all household outgoings — recurring **and** one-off — with a `commitment_splits` percentage split across zero, one, or several household members, and the expanded category set (housing, utilities, insurance, subscriptions, debt/loans, transport, childcare/education, healthcare, groceries & living, leisure/discretionary, savings/investment, one-off, other).
- `toMonthlyEquivalent` helper; commitments table shows total monthly-equivalent cost, filterable by linked household member and category, with per-member amounts prorated by their split percentage.
- All commitments/income created here are implicitly scoped to the baseline `living_profile` — the `profile_id` field exists from day one (§4) but stays invisible until Phase 5 introduces alternate profiles.
- **Done when**: PRD §6.1/§6.2 fully usable — you can enter your actual current commitments (joint and personal, recurring and one-off) and income sources.

### Phase 2 — Dashboard / Overview
- Monthly surplus/deficit card (gross figures for now — net comes in Phase 3).
- Category breakdown chart (Recharts), with an owner filter (whole household / unattributed / per household member, prorated by split percentage).
- Empty states with CTAs where no data yet.
- **Done when**: PRD success criterion "what's our monthly surplus right now?" is answerable at a glance — with the caveat it's still gross, flagged in the UI until Phase 3 lands.

### Phase 3 — German Tax Calculator (`lib/tax/`)
- Implement wage tax, soli, church tax, social contributions, and Fünftelregelung as in §5.
- Seed `tax_year_parameters` for 2025/2026.
- Unit tests (Vitest) against known gross→net reference figures — this phase is not "done" until those pass, since every later number depends on it.
- Wire `tax_profiles` into the household/income UI; dashboard surplus/deficit switches from gross to net.
- **Done when**: PRD success criterion "net figures used throughout" is true for current income/commitments (severance scenarios come next).

### Phase 4 — Severance Scenarios & Runway Engine
- Severance package calculator (`lib/severance/`) implemented per §6 — base salary, bonus, car benefit, years of service, multiplier, garden leave/notice pay, override option — plus the pension Wartezeit eligibility view, both modeled on `severance-scenarios.jsx`.
- `lib/runway/projectRunway` (§7) implemented and unit-tested against hand-computed scenarios, including the garden-leave-then-lump-sum timeline.
- Severance scenario CRUD UI: package calculator inputs (with the multiplier/toggle presets as UI helpers), or a direct gross override.
- Scenario detail page: package breakdown (gross/net/tax saved, mirroring the mock's Tax Analysis view), pension Wartezeit timeline, depletion chart (Recharts), remaining-balance-over-time.
- `severance_scenario_events` CRUD: one-off in/outflows and "new income starts on date X" events.
- **Done when**: PRD success criteria "if I take severance today, when does it run out?" and "what changes with a part-time job in month X?" are answerable directly in the app for a single scenario — and the severance figure itself can be sized/negotiated in-app rather than pre-computed elsewhere.

### Phase 5 — Life & Location Scenarios (Living Profiles & Phases)
- `living_profiles` CRUD + `cloneLivingProfile` (typically: clone the baseline, then strip/replace line items for the new situation — e.g. drop the mortgage and German subscriptions, add cheaper Thailand rent and higher travel insurance).
- Alternate-profile commitments/income editing reuses the Phase 1 forms/tables scoped by `profile_id`, surfaced inline within a severance scenario rather than as new top-level pages (§9).
- "Cost Phases" section on the severance scenario detail page: timeline UI to add/edit/remove `severance_scenario_phases` (pick a profile + a start date), with the auto-created baseline phase always present as phase one.
- `lib/runway/projectRunway` extended to resolve the active profile per month (§7 step 4) and unit-tested against a multi-phase scenario (e.g. baseline for 6 months, then a cheaper profile for the remainder).
- **Done when**: you can take an existing severance scenario and add a phase like "move to Thailand from month 6" or "downsize house from month 12," and see the depletion chart reflect the changed burn rate from that point on.

### Phase 6 — Severance Scenario Comparison
- `compareSeveranceScenarios` action + comparison page: overlay chart of multiple scenarios' balance curves, plus a summary table (end date, lowest balance point, monthly burn) per PRD §6.6.
- **Done when**: you can hold e.g. "Full severance, no new income" vs. "Severance + part-time from month 4" vs. "Severance + move to Thailand from month 6" side by side.

### Phase 7 — Polish & Trend View
- Historical trend view on the dashboard if/when historical data exists (PRD §6.3).
- Loading/error boundaries audited across all route groups.
- Responsive pass (PRD non-goal excludes native mobile, but responsive web is required).
- CSV export of commitments/income (lightweight backup, given Option B's hosted-data tradeoff).
- **Done when**: every PRD §9 success criterion holds, and updating a commitment or running a new severance scenario takes under a minute end-to-end.

### Phase 8 — Hardening (optional, post-v1)
- Expand tax engine test fixtures to more edge cases (multiple tax classes, private health insurance, high earners crossing the soli threshold).
- Accessibility pass (table `aria-label`s, `scope="col"`, form `role="alert"` — per `claude.md`, verify rather than assume).
- Yearly maintenance doc: how to add next year's `tax_year_parameters` when German rates change.

## 11. Testing Strategy

- **Tax engine, severance calculator & runway engine**: unit tests are the primary correctness gate (Vitest), since these are pure functions with no UI dependency — this is where the PRD's "~99% accuracy" target has to be verified, not asserted.
- **CRUD/UI**: manual verification per feature during each phase (per house convention of testing in-browser before calling a UI change done); no e2e suite planned for v1 given single-user scope.

## 12. Risks / Open Items

- **Tax rule accuracy** is the main technical risk — German wage tax + social insurance has real edge cases (private health insurance, multiple tax classes, high-earner soli threshold, capped contribution bases). Phase 3 scope is deliberately the standard-case-done-properly bar the PRD sets, not bulletproof edge-case coverage. Concretely: tax classes I/II/III/IV are computed properly (including the Splittingverfahren for III and the Entlastungsbetrag for II); classes V and VI are a documented approximation (standard tariff, no allowances) since their real withholding procedure depends on the paired spouse's return (V) or drops the Grundfreibetrag in a way that isn't a simple closed-form (VI) — see `lib/tax/wage-tax.ts`. The §32a formula itself is verified against independently-published reference figures in `lib/tax/wage-tax.test.ts`, not just self-consistency.
- **Severance multiplier is a negotiation input, not a statutory formula** — beyond the small statutory minimum, the multiplier/garden-leave terms in §6 are what you're aiming to negotiate, not a guaranteed entitlement. The calculator sizes and compares "what if" packages; it doesn't predict what an employer will actually agree to.
- **`tax_year_parameters` maintenance**: this needs a manual update once a year when official figures are published (typically ~Nov/Dec for the following year). Worth a short runbook note at the end of Phase 8.
- **Living profiles are live, not snapshotted** (§4) — editing an alternate profile's line items changes the projected numbers for every scenario phase referencing it, including ones you already reviewed. Intentional (you're iterating on "what would this budget look like"), but worth a visible "last edited" indicator in Phase 5 so an old scenario comparison isn't silently stale.
- Everything else in the PRD's Non-Goals (§4) is intentionally out of scope for this plan too — no bank sync, no multi-currency, no native mobile.
