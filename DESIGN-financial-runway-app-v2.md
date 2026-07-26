# Design & Implementation Plan v2: Life After Redundancy

Companion to [DESIGN-financial-runway-app.md](DESIGN-financial-runway-app.md) (v1 — Phases 0–8, complete) and [PRD-financial-runway-app.md](PRD-financial-runway-app.md). v1 built a real German tax engine, a severance package calculator, and a month-by-month runway projector — and it works. This doc is about the next layer: not new charts or nicer forms, but closing the gap between *what the engine assumes* and *what actually happens to a household's cash flow after a German redundancy*.

## 0. The core gap

Today, `lib/runway/project-runway.ts` walks forward from `severance_start_date`: garden-leave salary (if any), then the net severance lump sum, then whatever `income` rows and `severance_scenario_events` you've manually typed in. **Between the lump sum landing and a `recurring_income_start` event you add yourself, the model assumes €0 income.** For most real redundancies in Germany, that's wrong: after garden leave/severance, the vast majority of people are eligible for **Arbeitslosengeld I (ALG I)** — 60% (67% with a child) of a standardized net wage, for 6 to 24 months depending on age and insured time — paid automatically once you register as unemployed. It's not an edge case; it's the default path.

The tell is already sitting in the codebase: `lib/tax/parameters.ts` seeds an `unemploymentRate` (2.6%) that `lib/tax/social-contributions.ts` uses to compute what a household **pays into** unemployment insurance every month they're employed. Nothing anywhere computes what that insurance **pays out** when they're not. v1 modeled the premium and forgot the policy.

The same blind spot has a sibling on the cost side: **health insurance**. `lib/tax/social-contributions.ts` computes what a household pays for statutory (GKV) health/care insurance *while employed*; for private (PKV) insurance it deliberately returns €0 and expects the premium tracked as a plain `commitment` instead. Neither path knows what happens the moment employment ends — and what happens is not "the same cost continues," it's a sequence of very different numbers (see §2.2).

Everything in Tier 1 below closes these two coupled gaps. Everything else extends the scenario/comparison machinery v1 already built, in directions that became obvious once it existed.

## 1. v2 Scope

### Goals
- Model the statutory income sources a redundancy actually triggers (ALG I) and the statutory costs/risks it carries (health insurance transitions, Sperrzeit), not just the negotiated severance figure.
- Turn scenario comparison from "manually build N scenarios" into "see the range of plausible outcomes for one scenario" and "see the do-nothing counterfactual."
- Extend the app from a calculator into a light companion for the redundancy process itself (the non-financial admin has real deadlines too).
- Keep every new module pure-function-first, matching the existing `lib/tax` / `lib/severance` / `lib/runway` pattern, so it stays unit-testable and independently reviewable per `claude.md`.

### Non-Goals (v2)
- Still no bank sync, categorization AI, or live investment/portfolio tracking (PRD §4 stands). Tier 4's "additional buffers" idea is a manually-entered lump sum with a rough tax haircut, not a portfolio tracker.
- Not a legal-advice product. The Sperrzeit indicator (Phase 2) is a heuristic risk flag sourced from published Bundesagentur für Arbeit rules of thumb — it will say "verify with the Agentur / a lawyer," and mean it.
- Not modeling every household's employment history precisely — ALG I eligibility here is a documented simplification (see §7), same spirit as v1's accepted Steuerklasse V/VI gap.
- No salary-growth/inflation-adjusted long-horizon net-worth projection. The "do-nothing baseline" (Phase 3) is *today's* surplus held flat, not a career-trajectory model.

## 2. Feature Catalog

### Tier 1 — Flagship: the missing income source, and the cost that moves with it

**2.1 Arbeitslosengeld I engine**
The single highest-value addition. A new pure module, `lib/unemployment/`, mirroring `lib/tax/`:
- `eligibility.ts` — `alg1DurationMonths(insuredMonths, age)`: the statutory duration table (12 months insured → 6 months benefit, up to 24 insured → 12 months benefit; extended to 15/18/24 months at ages 50/55/58 with enough insured time — §147 SGB III).
- `leistungsentgelt.ts` — computes the standardized net wage base (a fixed-deduction-rate approximation of net pay, distinct from the household's actual tax-class withholding — that's how the Bundesagentur does it too) from the last gross monthly salary, then applies the Leistungssatz: 67% with at least one child (`has_children` already exists on `TaxProfile`), else 60%. Capped at the same `pensionUnemploymentCeilingMonthly` already in `tax_year_parameters`.
- A new versioned `unemployment_benefit_parameters` table (year → jsonb), seeded the same way `tax_year_parameters` is — this is reference data that changes yearly, not a code change.

**Runway integration**: `lib/runway/project-runway.ts` grows an auto-injected income stream — after garden leave and the severance lump sum, if `claim_unemployment_benefit` is true, ALG I income applies from `severance_start_date` (or later — see the deferral input and 2.3's Sperrzeit shift) for its eligible duration, and is **truncated early** the moment a `recurring_income_start` event fires (re-employment ends the claim — this mirrors reality and needs to be explicit in the projection logic, not just in a comment).

**New input needed**: age. `household_members` currently has no birthdate — add `date_of_birth`. It's the one new piece of personal data this whole feature needs, and it's directly usable later for anything else age-dependent.

**Deferring the claim.** The natural claim start (garden leave/severance end, shifted later if 2.3 flags a Sperrzeit) isn't always when the claim should actually begin — e.g. self-funding a few months of travel before registering as job-seeking. `severance_scenarios.unemployment_benefit_defer_months` (numeric, default 0) adds a further delay on top of that natural start date; during the deferred window the projection shows no ALG I income, same as any other pre-claim gap, and 2.2's "self-funded gap" health-insurance costing applies to it too. This composes *additively* with a Sperrzeit rather than modeling the two as potentially overlapping — see §7 for why that's the conservative (not the most realistic) choice, and for a real eligibility caveat worth knowing before planning extended travel around this.

**2.2 Post-severance health insurance coverage & cost**
Tightly coupled to 2.1 — what health insurance costs a household each month depends entirely on which ALG I state applies that month — so it belongs in the same phase, not a separate one. Confirmed while writing this doc, not a hypothetical gap: `lib/tax/social-contributions.ts` computes the *employee's* statutory (GKV) health/care contribution while employed; for anyone on private insurance (`statutory_health_insurance = false` on `TaxProfile`) it deliberately returns `health = care = 0` and expects the premium tracked as an ordinary `commitment` instead (v1 §12, working as designed) — but **neither path changes anything once employment ends**, and in reality both should:

- **GKV (statutory)**: while actually drawing ALG I, the Bundesagentur für Arbeit pays the health/care contribution in full — cost drops to €0. During any gap before that (a Sperrzeit, or the new travel deferral above), voluntary (freiwillige) GKV continuation applies instead, priced off a statutory minimum income base — a real, non-trivial monthly cost the app currently has no way to compute.
- **PKV (private)**: full premium, no employer subsidy, from the moment employment ends. Once ALG I starts, the Bundesagentur pays a capped monthly subsidy (Zuschuss) toward it — partial relief, not free. During any gap, it's the full premium, unsubsidized. Today's "track it as a commitment" approach can represent a flat premium but has no way to reflect any of these transitions.

New input: `tax_profiles.private_health_insurance_monthly_premium` (nullable numeric) — doesn't exist today, and it's the one piece of data needed to cost PKV through the transition rather than guessing from a static commitment. New versioned parameters, folded into `unemployment_benefit_parameters.params` alongside 2.1's (same Bundesagentur-administered, yearly-changing source): `voluntaryGkvMinimumMonthlyBase` and `pkvSubsidyCeilingMonthly`.

`lib/unemployment/health-coverage.ts` resolves, per month of a scenario's runway, which of three regimes applies (employed/garden leave — unchanged from today; self-funded gap — new voluntary-GKV or full-PKV cost; on ALG I — €0 GKV or PKV-minus-Zuschuss) and returns a monthly outflow that `project-runway.ts` adds alongside the existing commitment/income handling. This changes the actual depletion date, not just a display card — a PKV household with a 3-month travel deferral (2.1) is looking at several months of a real premium with zero subsidy, exactly the kind of number this app exists to surface before it's a surprise.

**2.3 Sperrzeit / Ruhezeit risk indicator**
Fast-follow on 2.1, same module. Taking a severance package (especially via an Aufhebungsvertrag — a mutually-agreed exit) can trigger a 12-week Sperrzeit (ALG I withheld, and the total entitlement duration shortened) unless specific conditions are met. `sperrzeit.ts` implements the commonly-published safe-harbor heuristic: no Sperrzeit risk flagged if the notice period was effectively observed **and** the severance is at or below the statutory-formula ceiling (§1a KSchG: 0.5 months' pay × years of service — see 2.11). Outside that, flag a risk banner with the specific reason ("severance is 1.75× salary/year vs. the 0.5× safe-harbor formula — a Sperrzeit is possible; confirm with the Agentur für Arbeit before relying on this timeline").

Surfaced on the scenario detail page next to the package breakdown, and (if triggered) shifts the ALG I start date in the runway projection by 12 weeks — so the depletion chart reflects the risk, not just a disclaimer nobody reads.

### Tier 2 — Natural extensions of the existing scenario/compare machinery

**2.4 Scenario variant generator (optimistic / base / pessimistic)**
Today, modeling "what if the job search takes longer" means manually cloning a scenario and hand-editing a `recurring_income_start` event's date. This feature is mostly UI orchestration, not new math: a "Generate variants" action on a scenario takes a re-employment assumption (months-until-offer, expected salary as % of previous) and produces three cloned scenarios (e.g. 3/6/9 months, 100%/90%/80% salary — all editable), then opens `compare/page.tsx` with all three pre-selected. Reuses `cloneLivingProfile`'s clone pattern and the existing comparison chart entirely.

**2.5 "Do-nothing" baseline overlay**
The dashboard already computes the household's current net monthly surplus/deficit — but nothing projects it forward as a reference line against a severance scenario's balance curve, so there's no visual answer to "at what point does taking the package start costing me money vs. just staying?" Add a straight reference line (today's surplus/deficit × months, from a starting point) to both the single-scenario `DepletionChart` and the multi-scenario `ComparisonChart`. Needs one small new input: a **current liquid savings figure** (a single number, distinct from any severance scenario's `starting_balance`, since "do nothing" has no severance) — proposed as a nullable field on the baseline `living_profiles` row.

**2.6 Runway sensitivity panel**
"If you cut X, how much longer does this last?" — for each discretionary (`essential = false`) category already surfaced by `categoryBreakdown`, re-run `projectRunway` with that category zeroed out and diff the depletion date. Purely derived — no new schema, one new `lib/runway` function (`sensitivityAnalysis`), a ranked list on the scenario detail page ("Cutting **Leisure/Discretionary** adds ~3.4 months").

### Tier 3 — Rounding out the redundancy-companion angle

**2.7 Redundancy checklist**
The financial model is half the picture; the admin has hard deadlines too — registering as job-seeking within 3 days of learning your end date (Meldepflicht), the ALG I application itself, deciding on health insurance continuation, the statutory consideration period on an Aufhebungsvertrag, requesting a reference letter (Arbeitszeugnis). A new `scenario_checklist_items` table, seeded from a static task template with due dates computed relative to the scenario's own dates (`severance_start_date`, notice period), each checkable and editable (custom items allowed, not just the template).

**2.8 Next-year tax refund estimator**
German wage tax withholding assumes a full year at your current rate; ALG I is tax-free but subject to Progressionsvorbehalt (it raises the effective rate on the rest of the year's taxable income without being taxed itself). Someone who works 5 months then draws ALG I for the rest of the year very often gets a real refund the following spring. A `lib/tax` addition (`estimateProgressionsvorbehaltRefund`) using building blocks that already exist (`calculateBaseIncomeTax`, `taxableWageIncome`) — framed explicitly as an estimate for planning, not a filed-return number.

**2.9 Reality check-ins**
Respects the "no bank sync" non-goal on purpose: a small `runway_checkins` table (date, actual balance, optional note) you update by hand periodically, overlaid as a second line against the projected curve on the scenario detail page — so a plan that's drifting is visible before it's a surprise.

### Tier 4 — Backlog (specified lightly; sequence after Tier 1–3 prove out)

**2.10 Lightweight additional-buffers ledger** — named lump sums outside the severance itself (e.g. "Emergency fund," "Brokerage account") with an optional flat tax-haircut % for liquidation, feeding into `starting_balance` as a breakdown rather than one opaque number. Explicitly *not* holdings/price tracking.

**2.11 Statutory severance floor reference** — `lib/severance/package-calculator.ts` grows `statutoryFloor(monthlyBaseSalary, yearsOfService) = 0.5 × monthlyBaseSalary × yearsOfService` (the §1a KSchG rule-of-thumb ceiling that's also 2.3's safe-harbor test), shown next to the negotiated multiplier as a sanity-check baseline — "you're negotiating 1.75×; the statutory floor is 0.5×."

**2.12 Editable scenario phases/events** — `phase-actions.ts` and `event-actions.ts` currently only support add/delete (confirmed while surveying for this doc); add update actions so correcting a date doesn't mean delete-and-recreate. Pure polish, bundle into whichever phase touches those files next.

**2.13 Wire up `recurring_tax_profile_id`** — already a column, already in the Zod schema, but `event-form.tsx` renders no field for it, so a `recurring_income_start` event is always netted with no tax profile (gross fallback). Small, contained fix.

## 3. Data Model Additions

```sql
-- Age-graduated ALG I duration needs an age. Nullable — every existing row
-- still works, features gate on presence.
alter table household_members add column date_of_birth date;

-- Versioned reference data, same role as tax_year_parameters: Leistungssatz
-- rates, the insured-months/age duration table, contribution ceiling, and
-- (§2.2) the voluntary-GKV minimum base + PKV subsidy ceiling.
create table unemployment_benefit_parameters (
  year int primary key,
  params jsonb not null
);
-- read-only to authenticated users, same policy shape as tax_year_parameters

-- ALG I assumptions per scenario, incl. the voluntary travel/registration
-- deferral (§2.1).
alter table severance_scenarios add column claim_unemployment_benefit boolean not null default true;
alter table severance_scenarios add column months_insured_last_30 int; -- null = assume satisfied (years_of_service >= 1)
alter table severance_scenarios add column unemployment_benefit_defer_months numeric(4,1) not null default 0;

-- Post-severance health insurance costing (§2.2) needs the actual PKV
-- premium — GKV needs no new column, it's derived from existing rate
-- parameters against a minimum base.
alter table tax_profiles add column private_health_insurance_monthly_premium numeric(10,2);

-- "Do-nothing" baseline needs a starting point independent of any severance
-- scenario. Only meaningful on the baseline living_profiles row.
alter table living_profiles add column current_liquid_savings numeric(10,2);

-- Redundancy checklist (Phase 5 / §2.7)
create table scenario_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  template_key text,           -- null for a custom (user-added) item
  label text not null,
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Reality check-ins (Phase 7 / §2.9)
create table runway_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scenario_id uuid not null references severance_scenarios(id) on delete cascade,
  check_date date not null,
  actual_balance numeric(10,2) not null,
  note text,
  created_at timestamptz not null default now()
);
```

All new tables follow the existing per-table RLS pattern (§4 of the v1 doc) — owner-only via `user_id = auth.uid()`, omitted here for brevity as v1 does.

## 4. New/Extended Modules

```
lib/
  unemployment/            -- NEW, mirrors lib/tax/ and lib/severance/
    eligibility.ts         -- alg1DurationMonths(insuredMonths, age)
    leistungsentgelt.ts    -- standardized net wage base + 60%/67% Leistungssatz
    health-coverage.ts     -- monthly health-insurance outflow per coverage regime (§2.2)
    sperrzeit.ts           -- safe-harbor heuristic + risk reason string
    parameters.ts          -- getUnemploymentBenefitYearParameters(year)
    index.ts
  runway/
    project-runway.ts      -- EXTENDED: auto-inject/truncate ALG I stream (incl.
                            --   the deferral offset), apply Sperrzeit start-date
                            --   shift, add the health-coverage monthly outflow
    sensitivity.ts          -- NEW: sensitivityAnalysis(scenario) → per-category runway delta
  severance/
    package-calculator.ts   -- EXTENDED: statutoryFloor(...)
  tax/
    progressionsvorbehalt.ts -- NEW: estimateProgressionsvorbehaltRefund(...)
```

All new functions are pure (inputs in, numbers out) — no I/O — same testability bar v1 set and the same reason it was set (PRD §6.4).

## 5. Phased Implementation Plan

Ordered so the flagship gap (§0) closes first, and each phase ends in something demoable against a real scenario.

### Phase 1 — Arbeitslosengeld I Engine & Post-Severance Health Insurance
- `household_members.date_of_birth`, `tax_profiles.private_health_insurance_monthly_premium`, and `severance_scenarios.{claim_unemployment_benefit, months_insured_last_30, unemployment_benefit_defer_months}` migrations.
- `household-member-form.tsx` gets the birthdate field; `tax-profile-form.tsx` gets the PKV premium field (shown only when `statutory_health_insurance` is off); `scenario-form.tsx` gets an "Unemployment benefit" section incl. the deferral input.
- `unemployment_benefit_parameters` table + seed migration (2025/2026) — Leistungssatz rates, duration table, voluntary-GKV minimum base, PKV subsidy ceiling — sourced from official Bundesagentur/gesetze-im-internet publications, same rigor as `tax_year_parameters`.
- `lib/unemployment/eligibility.ts`, `leistungsentgelt.ts`, `health-coverage.ts`, unit-tested against published worked examples (Vitest, mirrors `lib/tax/*.test.ts` conventions).
- `project-runway.ts` extended to inject the ALG I stream (respecting the deferral offset) and the per-regime health-insurance outflow, truncating the ALG I stream on re-employment.
- Scenario detail page: new "Unemployment benefit (ALG I)" card (eligibility, monthly amount, duration, total, deferral applied) and a health-insurance line within the existing package/cost breakdown.
- **Done when**: an existing scenario with no `recurring_income_start` event shows a materially longer runway than before this phase; the depletion chart visibly steps down (not to zero) after the severance lump sum, then to zero once ALG I is exhausted; setting a deferral shows a widened, correctly-costed gap (including the health-insurance outflow) before ALG I income begins.

### Phase 2 — Sperrzeit / Ruhezeit Risk Indicator
- `lib/unemployment/sperrzeit.ts`, unit-tested against the safe-harbor boundary cases.
- Risk banner on the scenario detail page (package breakdown area), with the specific reason and an explicit "verify with the Agentur für Arbeit" disclaimer.
- `project-runway.ts`: when flagged, shift the injected ALG I start date by the Sperrzeit length (additively with any deferral from Phase 1 — see §7).
- **Done when**: a scenario with a severance multiplier above the statutory-floor test shows the risk banner and a visibly delayed ALG I start in the chart; one at/below the floor with notice observed shows no flag.

### Phase 3 — Baseline Comparison & Scenario Variants
- `living_profiles.current_liquid_savings` migration + a small input on the baseline profile page.
- "Do-nothing" reference line on `DepletionChart` and `ComparisonChart`.
- "Generate variants" action (clone + parameterized `recurring_income_start` offset) on the scenario detail page, opening `compare/page.tsx` pre-selected.
- **Done when**: comparing a scenario against the do-nothing baseline visually answers "does taking this package ever put me behind where I'd be otherwise?", and three job-search-timing variants can be generated and compared in under a minute (PRD §9's "under a minute" bar, extended to this workflow).

### Phase 4 — Runway Sensitivity Panel
- `lib/runway/sensitivity.ts` + unit tests.
- Ranked panel on the scenario detail page.
- **Done when**: for a scenario with ≥2 discretionary categories, the panel correctly ranks them by runway-months-if-cut against a hand-computed check.

### Phase 5 — Redundancy Checklist
- `scenario_checklist_items` table + static template (Meldepflicht, ALG I application, health insurance decision, Aufhebungsvertrag consideration period, Arbeitszeugnis) with due-date rules relative to scenario dates.
- CRUD actions + checklist section (checkable, custom items allowed) on the scenario detail page.
- **Done when**: creating a new scenario auto-populates a dated checklist, and items can be checked off and persist.

### Phase 6 — Next-Year Tax Refund Estimator
- `lib/tax/progressionsvorbehalt.ts` + unit tests against hand-computed examples.
- Estimate card on the scenario detail page, clearly labeled as a planning estimate.
- **Done when**: a scenario spanning a partial working year + ALG I months produces a plausible non-zero refund estimate, sanity-checked against a manual calculation.

### Phase 7 — Reality Check-ins
- `runway_checkins` table + CRUD + overlay line (actual vs. projected) on the scenario detail page.
- **Done when**: logging an actual balance shows immediately as a second series against the projected curve, with the variance visible at a glance.

### Phase 8 — Backlog Cleanup
- §2.10 (buffers ledger), §2.11 (statutory floor reference), §2.12 (editable phases/events), §2.13 (wire up `recurring_tax_profile_id`).
- **Done when**: each is either shipped or explicitly deferred with a reason — this phase is a checkpoint, not a hard requirement to complete before calling v2 "done."

## 6. Testing Strategy Addendum

Same bar as v1 §11: `lib/unemployment/` and the `project-runway.ts`/`lib/tax` extensions are pure functions and get the primary correctness investment (Vitest, known-answer fixtures sourced from official Bundesagentur/BMF publications, not self-consistency checks). UI/CRUD stays manual-verification-in-browser per house convention.

## 7. Risks / Open Items

- **ALG I eligibility is a documented simplification**, same spirit as v1's Steuerklasse V/VI gap: real eligibility depends on the full Beschäftigungsverhältnis history in the Rahmenfrist (last 30 months), not just the current employer's `years_of_service`. `months_insured_last_30` is offered as an optional override precisely because the default (derived from the current job alone) will be wrong for anyone with a fragmented recent work history — flag this clearly in the UI, not just here.
- **A long ALG I deferral risks real eligibility, not just timing.** Being "verfügbar" (available to the job market at short notice) is a condition of actually receiving ALG I once claimed, and extended travel before registering can jeopardize that — there's a limited, Agentur-approved allowance for absence (Ortsabwesenheit), not an open-ended one. The deferral input (2.1) is a planning convenience, not a guarantee the full entitlement will actually be paid starting whenever you choose — this needs to be visible in the UI wherever the deferral input appears, not just here.
- **Sperrzeit and a voluntary deferral are modeled additively (2.1), not as potentially overlapping** — in reality a Sperrzeit clock can run concurrently with a deferral (it's anchored to when employment ended, not to when you register), so the additive model likely *overstates* the delay before payments start, i.e. understates the runway rather than the reverse. Deliberately the conservative direction for a planning tool, but worth a short note wherever both apply to the same scenario.
- **Voluntary-GKV and PKV-subsidy figures (2.2) are minimum/ceiling assumptions**, not individually underwritten numbers — actual voluntary GKV contributions and PKV Zuschuss amounts depend on specifics (declared income, existing PKV contract terms) this app doesn't and shouldn't try to fully model. Same disclaimer spirit as the Sperrzeit indicator.
- **Sperrzeit is genuinely legally nuanced** — real determinations turn on facts this app doesn't and shouldn't try to fully capture (the specific "wichtiger Grund" exceptions, individual Agentur discretion). Phase 2 ships a heuristic risk *indicator*, worded as such, not a determination. This is one of two features in this doc (with the deferral/eligibility note above) where getting the disclaimer copy right matters as much as getting the math right.
- **Unemployment benefit parameters need the same yearly maintenance** `tax_year_parameters` already does (v1 §12) — bundle the update into the same annual pass once both exist.
- **`current_liquid_savings` (§2.5) is self-reported and goes stale** the moment real spending diverges from plan — Phase 7's check-ins are the intended mitigation, not a separate concern; consider surfacing "last updated" next to the figure once both exist, same spirit as v1 §12's living-profile staleness note.
- Tier 4 items are deliberately underspecified — they're backlog, not committed scope. Expand each into its own short design note if and when it's actually picked up.

## Appendix: Feature Backlog Table

| # | Feature | Tier | Phase | New schema? |
|---|---|---|---|---|
| 2.1 | Arbeitslosengeld I engine (incl. claim deferral) | 1 | 1 | Yes |
| 2.2 | Post-severance health insurance coverage & cost | 1 | 1 | Yes |
| 2.3 | Sperrzeit / Ruhezeit risk indicator | 1 | 2 | No (reuses 2.1) |
| 2.4 | Scenario variant generator | 2 | 3 | No |
| 2.5 | Do-nothing baseline overlay | 2 | 3 | Yes (1 column) |
| 2.6 | Runway sensitivity panel | 2 | 4 | No |
| 2.7 | Redundancy checklist | 3 | 5 | Yes |
| 2.8 | Next-year tax refund estimator | 3 | 6 | No |
| 2.9 | Reality check-ins | 3 | 7 | Yes |
| 2.10 | Additional-buffers ledger | 4 | 8 | Yes (backlog) |
| 2.11 | Statutory severance floor reference | 4 | 8 | No (backlog) |
| 2.12 | Editable phases/events | 4 | 8 | No (backlog) |
| 2.13 | Wire up `recurring_tax_profile_id` | 4 | 8 | No (backlog) |
