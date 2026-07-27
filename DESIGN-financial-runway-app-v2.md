# Design & Implementation Plan v2: Life After Redundancy

Companion to [DESIGN-financial-runway-app.md](DESIGN-financial-runway-app.md) (v1 — Phases 0–8, complete) and [PRD-financial-runway-app.md](PRD-financial-runway-app.md). v1 built a real German tax engine, a severance package calculator, and a month-by-month runway projector. **All of Tier 1 — ALG I income, post-severance health insurance, and the Sperrzeit risk indicator — has since shipped** (§0.1 below), **Tier 2's scenario variant generator (§2.4) has too**, and **Tier 3's redundancy checklist (§2.7) has too**. This doc now tracks what's left: the do-nothing baseline overlay + sensitivity panel (rest of Tier 2), the tax refund estimator + reality check-ins (rest of Tier 3), and Tier 4's backlog.

## 0. The core gap (status: closed)

`lib/runway/project-runway.ts` walks forward from `severance_start_date`: garden-leave salary (if any), then the net severance lump sum, then an auto-injected Arbeitslosengeld I (ALG I) income stream and a per-regime health-insurance cost — shifted later if a Sperrzeit risk is flagged — then whatever `income` rows and `severance_scenario_events` you've manually typed in on top. Previously, the model assumed €0 income and unchanged costs the whole gap between the lump sum and a manually-added `recurring_income_start` event; that's closed now (§0.1).

### 0.1 What shipped (Tier 1, §2.1 + §2.2 + §2.3)

A new `lib/unemployment/` module exists (`eligibility.ts`, `leistungsentgelt.ts`, `health-coverage.ts`, `parameters.ts`, `index.ts`), unit-tested (`*.test.ts`, hand-computed fixtures, same convention as `lib/tax/*.test.ts`), and wired into `project-runway.ts` (`SeveranceStream` gained `algMonthlyNet`/`algStartDate`/`algEndDate`/`newJobStartDate`/`healthGapMonthly`/`healthAlgMonthly`, injected in the per-stream loop). A new `unemployment_benefit_parameters` table (year → jsonb) mirrors `tax_year_parameters`'s pattern, seeded for 2025/2026.

The implementation deviates from this doc's original spec in a few deliberate ways, all because a scenario can hold **two people's** packages independently and the original design didn't fully account for that:

- **Claim/defer/eligibility-override inputs live on `severance_scenario_packages` (per person), not `severance_scenarios` (per scenario)** — `claim_unemployment_benefit`, `unemployment_benefit_defer_months`, `months_insured_override` (renamed from the spec'd `months_insured_last_30`). A two-package scenario needs independent ALG I assumptions per person; a scenario-level field couldn't express that.
- **Re-employment truncation uses an explicit `new_job_start_date` column on the package**, not a `recurring_income_start` scenario event. Events aren't attributed to a household member, so a shared event couldn't unambiguously end just one person's claim.
- **Health-insurance fields moved to `household_members`, not `tax_profiles`.** Shipped first on `tax_profiles.private_health_insurance_monthly_premium` per the original spec, then relocated (along with `statutory_health_insurance`/`health_insurance_addon_rate`, previously already on `tax_profiles` since v1) — health insurance type is a personal fact independent of Steuerklasse, and living on `tax_profiles` meant it silently defaulted to "statutory" for anyone who hadn't set up a tax profile yet. Now always present.
- **No separate "Unemployment benefit (ALG I)" card.** Its figures (monthly amount, duration, dates, deferral note) are folded into the existing per-person package-breakdown card instead, alongside a new scenario-wide "Assumed income & costs" tile listing every cash-flow assumption (garden leave, lump sum, ALG I, both health-insurance regimes) in one table.
- **Christmas-money (%) and its include-in-calc toggle were added to `severance_scenario_packages` in the same migration pass** — unrelated to this doc's scope (a separate user request), noted here only so the migration file doesn't look mysterious.
- **Sperrzeit (§2.3) needed no new schema**, as originally planned — `lib/unemployment/sperrzeit.ts`'s `assessSperrzeitRisk` is derived entirely from existing package fields (`monthly_base_salary`, `years_of_service`, `include_garden_leave`, `notice_period_months`) plus a new `statutoryFloor(monthlyBaseSalary, yearsOfService)` helper added to `lib/severance/package-calculator.ts` (the §2.11 formula, reused here rather than duplicated). "Notice period effectively observed" is proxied as `include_garden_leave && notice_period_months > 0` — a documented simplification (this app has no way to know if notice was *actually* worked/paid vs. just modeled), not a legal test. When at risk, the shift is applied in `resolve-scenario.ts` before `algStartDate` is ever handed to `project-runway.ts` — so the runway engine itself needed **no changes**, only the resolver. The legally-precise 12 weeks (`SPERRZEIT_WEEKS`) gets rounded to 3 months for the runway's month-granularity stepping. Surfaced as a `--status-critical`-styled banner on the package-breakdown card, plus a `(+ Sperrzeit shift)` note next to the ALG I date range when it's the reason the dates moved.
- **`leistungsentgelt.ts`'s deduction step was corrected after initial shipping** — the first version approximated the Bundesagentur's deduction as a flat 21% of gross, which (caught by the user cross-checking against §153 SGB III's real published methodology) produced an unrealistically high implied maximum (~€4,005/mo at the 2026 Beitragsbemessungsgrenze, childless — well above real published ALG I maximums). Replaced with the actual formula: 20% Sozialversicherungspauschale off the capped gross, then a *notional* Lohnsteuer + Soli computed with this codebase's real wage-tax engine (`calculateIncomeTaxForClass`/`calculateSoli`, always at Steuerklasse I regardless of the claimant's real class — the Bundesagentur's own Leistungsgruppen A–F system, which this app doesn't model, approximates to class I for the common case). The resulting maximum now falls out of the real formula (~€2,894/mo at the same 2026 ceiling, childless) instead of a guessed rate — no separate hardcoded "max ALG I" figure was needed once the deduction itself was accurate. Migration `20260727195200_alg1_leistungsentgelt_correction.sql` re-syncs the reference-data mirror (`standardizedNetWageDeductionRate` → `socialInsurancePauschaleRate`).

Everything else in this doc — Tier 2 onward — is still exactly as planned, unimplemented.

## 1. v2 Scope

### Goals
- Model the statutory income sources a redundancy actually triggers (ALG I — shipped) and the statutory costs/risks it carries (health insurance transitions — shipped; Sperrzeit — shipped), not just the negotiated severance figure.
- Turn scenario comparison from "manually build N scenarios" into "see the range of plausible outcomes for one scenario" and "see the do-nothing counterfactual."
- Extend the app from a calculator into a light companion for the redundancy process itself (the non-financial admin has real deadlines too).
- Keep every new module pure-function-first, matching the existing `lib/tax` / `lib/severance` / `lib/runway` / `lib/unemployment` pattern, so it stays unit-testable and independently reviewable per `claude.md`.

### Non-Goals (v2)
- Still no bank sync, categorization AI, or live investment/portfolio tracking (PRD §4 stands). Tier 4's "additional buffers" idea is a manually-entered lump sum with a rough tax haircut, not a portfolio tracker.
- Not a legal-advice product. The Sperrzeit indicator (shipped, Phase 2) is a heuristic risk flag sourced from published Bundesagentur für Arbeit rules of thumb — it says "verify with the Agentur / a lawyer," and means it.
- Not modeling every household's employment history precisely — ALG I eligibility is a documented simplification (see §7), same spirit as v1's accepted Steuerklasse V/VI gap. (Shipped this way: `months_insured_override` defaults to `years_of_service × 12` at the current employer.)
- No salary-growth/inflation-adjusted long-horizon net-worth projection. The "do-nothing baseline" (Phase 3) is *today's* surplus held flat, not a career-trajectory model.

## 2. Feature Catalog

### Tier 1 — Flagship: the missing income source, and the cost that moves with it

**2.1 Arbeitslosengeld I engine — ✅ Shipped.** See §0.1 for the as-built shape (package-level inputs, `lib/unemployment/eligibility.ts` + `leistungsentgelt.ts`, `unemployment_benefit_parameters` table).

**2.2 Post-severance health insurance coverage & cost — ✅ Shipped.** See §0.1. `lib/unemployment/health-coverage.ts` resolves the "gap" (self-funded) and "alg1" (on benefit) regimes; "employed/garden leave" needed no new code since `calculateSocialContributions` already priced it correctly.

**2.3 Sperrzeit / Ruhezeit risk indicator — ✅ Shipped.**
Taking a severance package (especially via an Aufhebungsvertrag — a mutually-agreed exit) can trigger a 12-week Sperrzeit (ALG I withheld, and the total entitlement duration shortened) unless specific conditions are met. `lib/unemployment/sperrzeit.ts`'s `assessSperrzeitRisk` implements the commonly-published safe-harbor heuristic: no Sperrzeit risk flagged if the notice period was effectively observed **and** the severance is at or below the statutory-formula ceiling (§1a KSchG: 0.5 months' pay × years of service, `statutoryFloor` — see 2.11). Outside that, it returns a risk reason string ("severance is 0.88× salary/year vs. the 0.5× safe-harbor formula — a Sperrzeit is possible; confirm with the Agentur für Arbeit before relying on this timeline").

Surfaced on the scenario detail page as a `--status-critical` banner on the per-person package-breakdown card, and — when triggered — shifts that package's `algStartDate` (and `algEndDate`, same duration) in `resolve-scenario.ts` by the Sperrzeit length (rounded to 3 months for the runway engine's month-granularity stepping — see §0.1), additively on top of any manual `unemployment_benefit_defer_months` (see §7 for why additive, not overlapping, is the deliberately conservative choice) — so the depletion chart and the "Assumed income & costs" tile both reflect the risk, not just a disclaimer nobody reads.

### Tier 2 — Natural extensions of the existing scenario/compare machinery

**2.4 Scenario variant generator (optimistic / base / pessimistic) — ✅ Shipped.**
Previously, modeling "what if the job search takes longer" meant manually cloning a scenario and hand-editing a `recurring_income_start` event's date. `app/(app)/severance-scenarios/variant-actions.ts`'s `generateScenarioVariants` takes three (months-until-offer, salary-%-of-previous) pairs — a `VariantGeneratorForm` defaults them to 3/6/9 months and 100%/90%/80%, all editable — deep-clones the source scenario's packages/phases/existing events/property-ends unchanged once per variant (the negotiated severance terms don't depend on re-employment timing), adds one new `recurring_income_start` event per variant sized off the combined `monthly_base_salary` across the source scenario's packages, then redirects to `compare/page.tsx?ids=...` with all three pre-selected (that page already accepted an `ids` query param, no changes needed there — the "reuses the existing comparison chart entirely" part of the original plan held exactly as written).

Deviates from the original spec in one way: it does its own explicit field-by-field clone (mirroring `cloneLivingProfile`'s style) rather than literally reusing that function, since `cloneLivingProfile` clones a *Living Profile* (commitments/income) and a scenario clone needs a different set of child tables (packages/phases/events/property-ends) — "reuses `cloneLivingProfile`'s clone pattern" (fetch → map → insert, id-remapping only where a child table cross-references another cloned child) held, the function itself didn't. "Previous salary" is a combined-household sum across all packages — correct for the common single-earner case, a documented approximation for a two-package (couple) scenario, same spirit as the salary-cutoff note in `resolve-scenario.ts` (events aren't attributed to a household member).

**2.5 "Do-nothing" baseline overlay — not started.**
The dashboard already computes the household's current net monthly surplus/deficit — but nothing projects it forward as a reference line against a severance scenario's balance curve, so there's no visual answer to "at what point does taking the package start costing me money vs. just staying?" Add a straight reference line (today's surplus/deficit × months, from a starting point) to both the single-scenario `DepletionChart` and the multi-scenario `ComparisonChart`. Needs one small new input: a **current liquid savings figure** (a single number, distinct from any severance scenario's `starting_balance`, since "do nothing" has no severance) — proposed as a nullable field on the baseline `living_profiles` row.

**2.6 Runway sensitivity panel — not started.**
"If you cut X, how much longer does this last?" — for each discretionary (`essential = false`) category already surfaced by `categoryBreakdown`, re-run `projectRunway` with that category zeroed out and diff the depletion date. Purely derived — no new schema, one new `lib/runway` function (`sensitivityAnalysis`), a ranked list on the scenario detail page ("Cutting **Leisure/Discretionary** adds ~3.4 months").

### Tier 3 — Rounding out the redundancy-companion angle

**2.7 Redundancy checklist — ✅ Shipped.**
The financial model is half the picture; the admin has hard deadlines too. `lib/severance/checklist.ts`'s `CHECKLIST_TEMPLATE` covers five: register as job-seeking (Meldepflicht, -90d), decide on health insurance continuation (-14d), use the Aufhebungsvertrag consideration period (-7d), apply for ALG I (0d), and request a reference letter (Arbeitszeugnis, 0d) — all offsets in days from an anchor date, all editable/deletable once seeded (not re-derived from the template again). `scenario_checklist_items` (new table) stores them, `checklist-actions.ts` handles add/toggle/delete, and a "Redundancy checklist" card on the scenario detail page renders them (checkbox, label, due-date badge — a `--status-critical` "Overdue" state when `due_date < today` and not completed — delete button) plus an "Add item" form for custom items.

One deviation from the original spec: due dates are computed relative to the **earliest package's `severance_start_date`**, not "the scenario's own dates" — since the packages migration (shipped earlier this session, see §0.1), `severance_start_date` lives on `severance_scenario_packages`, not `severance_scenarios` itself, and a scenario has none of its own dates at creation time. So seeding happens the first time a package is added (`addScenarioPackage`, guarded so a second/third package added later doesn't reseed on top of items already checked off or deleted), not at scenario-creation time as the original phrasing implied.

**2.8 Next-year tax refund estimator — not started.**
German wage tax withholding assumes a full year at your current rate; ALG I is tax-free but subject to Progressionsvorbehalt (it raises the effective rate on the rest of the year's taxable income without being taxed itself). Someone who works 5 months then draws ALG I for the rest of the year very often gets a real refund the following spring. A `lib/tax` addition (`estimateProgressionsvorbehaltRefund`) using building blocks that already exist (`calculateBaseIncomeTax`, `taxableWageIncome`) — framed explicitly as an estimate for planning, not a filed-return number.

**2.9 Reality check-ins — not started.**
Respects the "no bank sync" non-goal on purpose: a small `runway_checkins` table (date, actual balance, optional note) you update by hand periodically, overlaid as a second line against the projected curve on the scenario detail page — so a plan that's drifting is visible before it's a surprise.

### Tier 4 — Backlog (specified lightly; sequence after Tier 1–3 prove out)

**2.10 Lightweight additional-buffers ledger — not started.** Named lump sums outside the severance itself (e.g. "Emergency fund," "Brokerage account") with an optional flat tax-haircut % for liquidation, feeding into `starting_balance` as a breakdown rather than one opaque number. Explicitly *not* holdings/price tracking.

**2.11 Statutory severance floor reference — function shipped, UI not started.** `statutoryFloor(monthlyBaseSalary, yearsOfService) = 0.5 × monthlyBaseSalary × yearsOfService` already exists in `lib/severance/package-calculator.ts` (added as part of 2.3, which needed it for the safe-harbor test — see §0.1) and is exported from `lib/severance`. What's still missing is showing it next to the negotiated multiplier as a sanity-check baseline on the package form/breakdown — "you're negotiating 1.75×; the statutory floor is 0.5×."

**2.12 Editable scenario phases/events — not started.** `phase-actions.ts` and `event-actions.ts` still only support add/delete (confirmed while writing this update); add update actions so correcting a date doesn't mean delete-and-recreate. Pure polish, bundle into whichever phase touches those files next.

**2.13 Wire up `recurring_tax_profile_id` — not started.** Already a column, already in the Zod schema, but `event-form.tsx` still renders no field for it, so a `recurring_income_start` event is always netted with no tax profile (gross fallback). Small, contained fix.

## 3. Data Model Additions

Already applied (§0.1, §2.7 — see migrations `20260727090100_alg1_health_insurance.sql`, `20260727090200_unemployment_benefit_parameters.sql`, `20260727093200_household_member_health_insurance.sql`, `20260727103600_scenario_checklist_items.sql`): `household_members.date_of_birth`, `household_members.{statutory_health_insurance, health_insurance_addon_rate, private_health_insurance_monthly_premium}`, `severance_scenario_packages.{claim_unemployment_benefit, unemployment_benefit_defer_months, months_insured_override, new_job_start_date}`, the `unemployment_benefit_parameters` table, and the `scenario_checklist_items` table (shape unchanged from the original spec below). Not repeated below.

Still needed, for the remaining features:

```sql
-- Sperrzeit (§2.3) needs no new schema — it's derived from data the
-- package/scenario already has (notice period observed, severance vs.
-- statutory-formula ceiling).

-- "Do-nothing" baseline (§2.5) needs a starting point independent of any
-- severance scenario. Only meaningful on the baseline living_profiles row.
alter table living_profiles add column current_liquid_savings numeric(10,2);

-- Reality check-ins (§2.9)
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
  unemployment/            -- SHIPPED (§0.1), mirrors lib/tax/ and lib/severance/
    eligibility.ts         -- ✅ alg1DurationMonths(insuredMonths, ageAtClaim, year)
    leistungsentgelt.ts    -- ✅ §153 SGB III Leistungsentgelt (20% SV-Pauschale +
                            --   notional Steuerklasse-I Lohnsteuer/Soli via the real
                            --   wage-tax engine) + 60%/67% Leistungssatz
    health-coverage.ts     -- ✅ monthlyHealthInsuranceCost(profile, "gap" | "alg1", year)
    parameters.ts          -- ✅ getUnemploymentBenefitYearParameters(year)
    index.ts               -- ✅
    sperrzeit.ts           -- ✅ assessSperrzeitRisk(pkg, severanceGross) — safe-harbor heuristic + risk reason string
  runway/
    project-runway.ts      -- EXTENDED (✅ ALG I stream + health-coverage outflow). The
                            --   Sperrzeit shift needed no changes here — applied to
                            --   algStartDate in resolve-scenario.ts before the stream
                            --   is built (§0.1).
    sensitivity.ts          -- NOT STARTED (§2.6): sensitivityAnalysis(scenario) → per-category runway delta
  severance/
    package-calculator.ts   -- ✅ EXTENDED: statutoryFloor(monthlyBaseSalary, yearsOfService) (§2.3/§2.11)
    checklist.ts            -- ✅ NEW (§2.7): CHECKLIST_TEMPLATE + generateChecklistItems(anchorDate)
  tax/
    progressionsvorbehalt.ts -- NOT STARTED (§2.8): estimateProgressionsvorbehaltRefund(...)
```

All new functions are pure (inputs in, numbers out) — no I/O — same testability bar v1 set and the same reason it was set (PRD §6.4).

## 5. Phased Implementation Plan

Ordered so the flagship gap (§0) closes first, and each phase ends in something demoable against a real scenario.

### Phase 1 — Arbeitslosengeld I Engine & Post-Severance Health Insurance — ✅ Shipped
See §0.1 for the as-built shape and its deliberate deviations from the original spec below (package-level vs. scenario-level inputs, `household_members` vs. `tax_profiles` placement, no standalone ALG I card).
- ~~`household_members.date_of_birth`, `tax_profiles.private_health_insurance_monthly_premium`, and `severance_scenarios.{claim_unemployment_benefit, months_insured_last_30, unemployment_benefit_defer_months}` migrations.~~ Shipped as described in §0.1 (package- and household-member-level, not scenario- and tax-profile-level).
- ~~`household-member-form.tsx` gets the birthdate field; `tax-profile-form.tsx` gets the PKV premium field~~ Shipped: `household-member-form.tsx` gets birthdate **and** the statutory/PKV-premium fields (moved off `tax-profile-form.tsx`); `package-form.tsx` gets the "Unemployment benefit (ALG I)" section (claim toggle, defer-months, insured-months override, return-to-work date).
- `unemployment_benefit_parameters` table + seed migration (2025/2026) — ✅ shipped, sourced/cited in `lib/unemployment/parameters.ts`'s header, flagged where the monetary figures (voluntary-GKV base, PKV subsidy ceiling) are best-effort pending verification.
- `lib/unemployment/eligibility.ts`, `leistungsentgelt.ts`, `health-coverage.ts` — ✅ shipped, unit-tested (Vitest, hand-computed fixtures).
- `project-runway.ts` — ✅ extended to inject the ALG I stream (respecting the deferral offset) and the per-regime health-insurance outflow, truncating on `new_job_start_date`.
- Scenario detail page — ✅ shipped, but as a merged package-breakdown card + a new "Assumed income & costs" tile rather than a standalone ALG I card (see §0.1).
- **Done when**: an existing scenario with no `recurring_income_start` event shows a materially longer runway than before this phase; the depletion chart visibly steps down (not to zero) after the severance lump sum, then to zero once ALG I is exhausted; setting a deferral shows a widened, correctly-costed gap (including the health-insurance outflow) before ALG I income begins. — confirmed via the unit-test suite (`lib/runway/project-runway.test.ts`'s ALG I/health-insurance cases); no live-scenario manual verification yet (no login credentials in this environment).

### Phase 2 — Sperrzeit / Ruhezeit Risk Indicator — ✅ Shipped
- `lib/unemployment/sperrzeit.ts` — ✅ shipped, unit-tested against the safe-harbor boundary cases (`sperrzeit.test.ts`).
- Risk banner on the scenario detail page (package-breakdown card) — ✅ shipped (`--status-critical` styling), with the specific reason and an explicit "confirm with the Agentur für Arbeit" disclaimer baked into `assessSperrzeitRisk`'s reason string.
- `resolve-scenario.ts`: when flagged, shifts `algStartDate`/`algEndDate` by the Sperrzeit length (rounded to 3 months), additively with any `unemployment_benefit_defer_months` — ✅ shipped. (Applied in the resolver, not `project-runway.ts` itself — see §0.1 for why that needed no engine changes.)
- **Done when**: a scenario with a severance multiplier above the statutory-floor test shows the risk banner and a visibly delayed ALG I start in the chart; one at/below the floor with notice observed shows no flag. — confirmed via `lib/unemployment/sperrzeit.test.ts`'s boundary cases; no live-scenario manual verification yet (no login credentials in this environment).

### Phase 3 — Baseline Comparison & Scenario Variants — partially shipped (2.4 done, 2.5 not started)
- ~~`living_profiles.current_liquid_savings` migration + a small input on the baseline profile page.~~ Not started (§2.5).
- ~~"Do-nothing" reference line on `DepletionChart` and `ComparisonChart`.~~ Not started (§2.5).
- "Generate variants" action (clone + parameterized `recurring_income_start` offset) on the scenario detail page, opening `compare/page.tsx` pre-selected — ✅ shipped (§2.4), see §2.4 for the as-built shape.
- **Done when**: comparing a scenario against the do-nothing baseline visually answers "does taking this package ever put me behind where I'd be otherwise?" (still open, §2.5), and three job-search-timing variants can be generated and compared in under a minute (PRD §9's "under a minute" bar, extended to this workflow) — ✅ met: "Generate variants" is one form submission from the scenario detail page straight to the compare results.

### Phase 4 — Runway Sensitivity Panel
- `lib/runway/sensitivity.ts` + unit tests.
- Ranked panel on the scenario detail page.
- **Done when**: for a scenario with ≥2 discretionary categories, the panel correctly ranks them by runway-months-if-cut against a hand-computed check.

### Phase 5 — Redundancy Checklist — ✅ Shipped
- `scenario_checklist_items` table + static template (Meldepflicht, ALG I application, health insurance decision, Aufhebungsvertrag consideration period, Arbeitszeugnis) with due-date rules relative to scenario dates — ✅ shipped, relative to the earliest package's `severance_start_date` rather than a scenario-level date (see §2.7 for why).
- CRUD actions + checklist section (checkable, custom items allowed) on the scenario detail page — ✅ shipped (add/toggle/delete; no separate "edit" action, matching the same add/delete-only CRUD level this codebase's other scenario child-entities — phases, events, property-ends — already have, per §2.12).
- **Done when**: creating a new scenario auto-populates a dated checklist, and items can be checked off and persist. — met, with the adjustment that "creating a new scenario" became "adding its first severance package" (see §2.7); checked-off state persists via `toggleChecklistItem` + `revalidatePath`. No live-scenario manual verification yet (no login credentials in this environment); `lib/severance/checklist.test.ts` covers the due-date math.

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

Same bar as v1 §11: `lib/unemployment/` and the `project-runway.ts`/`lib/tax` extensions are pure functions and get the primary correctness investment (Vitest, known-answer fixtures sourced from official Bundesagentur/BMF publications, not self-consistency checks). Shipped so far (`lib/unemployment/*.test.ts`, extended `lib/runway/project-runway.test.ts`) follows this. UI/CRUD stays manual-verification-in-browser per house convention — not yet possible in this environment (no login credentials).

## 7. Risks / Open Items

- **ALG I eligibility is a documented simplification**, same spirit as v1's Steuerklasse V/VI gap: real eligibility depends on the full Beschäftigungsverhältnis history in the Rahmenfrist (last 30 months), not just the current employer's `years_of_service`. Shipped as `months_insured_override` on the package — offered as an optional override precisely because the default (derived from the current job alone) will be wrong for anyone with a fragmented recent work history — this is flagged in the package form's helper text, not just here.
- **A long ALG I deferral risks real eligibility, not just timing.** Being "verfügbar" (available to the job market at short notice) is a condition of actually receiving ALG I once claimed, and extended travel before registering can jeopardize that — there's a limited, Agentur-approved allowance for absence (Ortsabwesenheit), not an open-ended one. The deferral input (shipped as `unemployment_benefit_defer_months` on the package) is a planning convenience, not a guarantee the full entitlement will actually be paid starting whenever you choose — worth surfacing in the UI wherever the deferral input appears, not just here (not yet done).
- **Sperrzeit and a voluntary deferral are modeled additively (shipped, §2.3), not as potentially overlapping** — in reality a Sperrzeit clock can run concurrently with a deferral (it's anchored to when employment ended, not to when you register), so the additive model likely *overstates* the delay before payments start, i.e. understates the runway rather than the reverse. Deliberately the conservative direction for a planning tool — not yet surfaced as an explicit note in the UI when both apply to the same scenario, worth adding.
- **Voluntary-GKV and PKV-subsidy figures (shipped, §2.2) are minimum/ceiling assumptions**, not individually underwritten numbers — actual voluntary GKV contributions and PKV Zuschuss amounts depend on specifics (declared income, existing PKV contract terms) this app doesn't and shouldn't try to fully model. Flagged in `lib/unemployment/parameters.ts`'s header and the seed migration's comment. Same disclaimer spirit as the Sperrzeit indicator below.
- **Sperrzeit is genuinely legally nuanced** — real determinations turn on facts this app doesn't and shouldn't try to fully capture (the specific "wichtiger Grund" exceptions, individual Agentur discretion, and this app's own "notice period observed" proxy — see §0.1 — which is a data-availability simplification, not a legal test). Shipped as a heuristic risk *indicator*, worded as such (`assessSperrzeitRisk`'s reason string always ends in "confirm with the Agentur für Arbeit before relying on this timeline"), not a determination. This is one of two areas in this doc (with the deferral/eligibility note above) where getting the disclaimer copy right matters as much as getting the math right.
- **Unemployment benefit parameters need the same yearly maintenance** `tax_year_parameters` already does (v1 §12) — bundle the update into the same annual pass now that both exist.
- **`current_liquid_savings` (§2.5, not yet built) will be self-reported and go stale** the moment real spending diverges from plan — Phase 7's check-ins are the intended mitigation, not a separate concern; consider surfacing "last updated" next to the figure once both exist, same spirit as v1 §12's living-profile staleness note.
- Tier 4 items are deliberately underspecified — they're backlog, not committed scope. Expand each into its own short design note if and when it's actually picked up.

## Appendix: Feature Backlog Table

| # | Feature | Tier | Phase | New schema? | Status |
|---|---|---|---|---|---|
| 2.1 | Arbeitslosengeld I engine (incl. claim deferral) | 1 | 1 | Yes | ✅ Shipped |
| 2.2 | Post-severance health insurance coverage & cost | 1 | 1 | Yes | ✅ Shipped |
| 2.3 | Sperrzeit / Ruhezeit risk indicator | 1 | 2 | No (reuses 2.1) | ✅ Shipped |
| 2.4 | Scenario variant generator | 2 | 3 | No | ✅ Shipped |
| 2.5 | Do-nothing baseline overlay | 2 | 3 | Yes (1 column) | Not started |
| 2.6 | Runway sensitivity panel | 2 | 4 | No | Not started |
| 2.7 | Redundancy checklist | 3 | 5 | Yes | ✅ Shipped |
| 2.8 | Next-year tax refund estimator | 3 | 6 | No | Not started |
| 2.9 | Reality check-ins | 3 | 7 | Yes | Not started |
| 2.10 | Additional-buffers ledger | 4 | 8 | Yes (backlog) | Not started |
| 2.11 | Statutory severance floor reference | 4 | 8 | No (backlog) | Function ✅, UI not started |
| 2.12 | Editable phases/events | 4 | 8 | No (backlog) | Not started |
| 2.13 | Wire up `recurring_tax_profile_id` | 4 | 8 | No (backlog) | Not started |
