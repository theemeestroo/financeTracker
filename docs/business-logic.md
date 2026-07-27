# Business Logic

Everything under `lib/` is pure-function-first (inputs in, numbers out, no I/O) and unit-tested (`*.test.ts` alongside each module). Update this doc whenever the tax engine, severance calculator, unemployment-benefit modeling, or runway projection logic changes.

## `lib/tax` — German wage tax, social contributions, Fünftelregelung severance tax

Computes German wage/income tax, Soli, church tax, statutory social insurance contributions, and net income for a household member given a `TaxProfile` (tax class, church tax, health insurance status) and a tax year — plus the special §34 EStG severance tax rule.

All money-relevant legal constants live in `lib/tax/parameters.ts`, keyed by year (`TAX_YEAR_PARAMETERS`) — every calculation file imports from there rather than hardcoding rates, so adding a new year is a data change, not a logic change. Sourced from gesetze-im-internet.de (§32a EStG), finanz-tools.de, lohn-info.de (SV rates/Beitragsbemessungsgrenzen), and finanztip.de (allowances); mirrored into a `tax_year_parameters` DB table for reference (see `docs/data-model.md`).

| Function | File | What it computes |
|---|---|---|
| `getTaxYearParameters(year)` / `getCurrentTaxYear()` | `parameters.ts` | Central per-year rate/threshold table (Grundfreibetrag, tariff zone formulas, Soli Freigrenze/Milderungszone, church tax rates, SV contribution rates and Beitragsbemessungsgrenzen, employee allowances). Throws if a year is missing. `getCurrentTaxYear` clamps the current year to the newest year with data so the app never looks up an unconfigured year. |
| `calculateBaseIncomeTax(taxableIncome, year)` | `wage-tax.ts` | Implements the §32a EStG piecewise progressive formula (Grundfreibetrag → zone1 quadratic → zone2 quadratic → 42% flat → 45% Reichensteuer). No tax-class adjustment. |
| `calculateIncomeTaxForClass(taxableIncome, taxClass, year)` | `wage-tax.ts` | Applies the tax-class procedure on top of §32a: class III uses **Splittingverfahren** (tax on half income, doubled); classes I/II/IV use the base formula directly; classes V/VI are **approximated** as plain standard tariff — a documented, accepted v1 simplification (real V/VI withholding depends on the paired III return and drops the Grundfreibetrag entirely). |
| `calculateSocialContributions(grossMonthly, profile, year)` | `social-contributions.ts` | Employee-side Rentenversicherung + Arbeitslosenversicherung (half of total rate, capped at the RV/ALV ceiling) plus Kranken-/Pflegeversicherung (half of base+Zusatzbeitrag rate, capped at the KV/PV ceiling, plus Kinderlosenzuschlag if childless). Returns **0** for health/care if privately insured — private premiums are a fixed monthly cost that belongs in `commitments`, not the tax engine. |
| `calculateSoli(incomeTax, taxClass, year)` | `soli.ts` | Solidaritätszuschlag: 0 below the Freigrenze, then the lesser of flat 5.5% of tax or 11.9% of the excess over the Freigrenze (Milderungszone, avoids a cliff). |
| `calculateChurchTax(incomeTax, profile, year)` | `church-tax.ts` | 0 if not registered; else `incomeTax × rate` — 8% in Bavaria/Baden-Württemberg, 9% elsewhere. |
| `taxableWageIncome(grossAnnual, socialContributionsAnnual, profile, year)` | `taxable-income.ts` | Converts gross wage income to taxable income (zvE) for classes I/II/IV: subtracts Arbeitnehmer-Pauschbetrag, Sonderausgaben-Pauschbetrag, and actual social insurance contributions (used as a proxy for the Vorsorgepauschale), plus Entlastungsbetrag für Alleinerziehende for class II. Classes V/VI skip all deductions and return raw gross (floored at 0). |
| `calculateNetIncome(grossAmount, frequency, profile, year)` | `net-income.ts` | Top-level "net a recurring income row" entry point: annualizes the gross amount, computes SV contributions on the monthly-equivalent, derives zvE, then income tax, Soli, church tax, and nets it out — returns annual and monthly figures plus the full breakdown. The workhorse called throughout `lib/finance` and `lib/runway`. |
| `calculateSeveranceNet(grossSeverance, regularTaxableIncome, profile, year)` | `fuenftelregelung.ts` | Implements **Fünftelregelung (§34 EStG)**: taxes 1/5 of the severance stacked on top of regular taxable income, takes the tax delta, ×5, to get `taxOnSeverance` — prevents a lump sum from being pushed entirely into the top bracket. Also computes the marginal Soli/church-tax delta attributable to the severance, `netSeverance`, and (for comparison) `marginalTax`/`taxSaving` versus taxing the severance as ordinary income in one go. |

**Documented simplifications:**
- V/VI withholding is approximated as the standard tariff — an accepted v1 gap, not the real class-V/VI mechanism.
- Social contributions are used as a Vorsorgepauschale proxy — "very close to the real mechanism for a standard employee case."
- Privately insured members get €0 health/care contributions in the payroll calc by design; premiums belong in `commitments`.
- Bonus netting uses a differential (marginal-stacking) method rather than a distinct "sonstige Bezüge" withholding timing (see `lib/finance/income-gross.ts` below).

**Dependencies:** foundation layer — depends only on `lib/types`. Consumed by `lib/finance`, `lib/unemployment`, `lib/runway` (indirectly), and `app/(app)/severance-scenarios/resolve-scenario.ts`.

## `lib/severance` — package sizing, statutory floor, redundancy checklist

Sizes a household member's gross severance package from a scenario's salary snapshot, computes the §1a KSchG statutory reference ceiling, and generates a redundancy admin checklist with target dates.

| Function | File | What it computes |
|---|---|---|
| `calculateSeverancePackage(input)` | `package-calculator.ts` | `monthlyBaseForCalc` = base salary + optionally bonus/12, car-benefit/12, Christmas bonus % of base (per include-flags). `formulaGross` = multiplier × years of service × that base. `severanceGross` = a manual override if set, else `formulaGross`. `noticePay` = notice-period months × base salary (informational — `project-runway.ts` recomputes garden-leave net pay itself rather than using this gross figure). Pure and self-contained: takes the scenario's own salary snapshot, not the household's live `income` table. |
| `statutoryFloor(monthlyBaseSalary, yearsOfService)` | `package-calculator.ts` | **§1a KSchG** rule-of-thumb severance ceiling: `0.5 × monthlyBaseSalary × yearsOfService`. A reference-only baseline (not what most negotiated packages actually pay) — also doubles as the severance-size half of the Sperrzeit safe-harbor test in `lib/unemployment/sperrzeit.ts`. |
| `pensionWartezeitDate(employmentStartDate)` | `pension-wartezeit.ts` | Germany's statutory pension qualifying period (Wartezeit, hardcoded 5 years): employment start date + 5 years. |
| `pensionWartezeitTimeline(employmentStartDate, fromDate)` | `pension-wartezeit.ts` | Builds a departure-timing table around the eligibility threshold (offsets at the threshold and ±6 months from "as of" date), each row flagged eligible/not. |
| `CHECKLIST_TEMPLATE`, `generateChecklistItems(anchorDate)` | `checklist.ts` | Static 5-item redundancy admin task template (register as job-seeking 90 days before, decide health insurance 14 days before, use Aufhebungsvertrag Bedenkzeit 7 days before, register unemployed + apply for ALG I on day 0, request Arbeitszeugnis on day 0), each offset from the scenario's anchor date (earliest `severance_start_date`). Documented as "reasonable planning defaults, not exact statutory deadlines" — e.g. real Meldepflicht timing depends on when you *learn* your end date, which this app doesn't separately track. Generated items become ordinary editable/deletable rows afterward, not re-derived from the template again. |

**Dependencies:** depends only on `lib/types` and `lib/finance/date-utils`. `statutoryFloor` is imported by `lib/unemployment/sperrzeit.ts`. `calculateSeverancePackage` and `statutoryFloor` are consumed by `resolve-scenario.ts`, paired with `lib/tax`'s Fünftelregelung to get net severance.

## `lib/unemployment` — ALG I eligibility, benefit amount, Sperrzeit risk, health-insurance coverage

Models Arbeitslosengeld I (unemployment benefit) — eligibility duration, monthly net benefit amount, Sperrzeit (benefit suspension) risk, and the health-insurance cost regime that applies once salary income stops.

Legal constants live in `lib/unemployment/parameters.ts`, mirrored into an `unemployment_benefit_parameters` DB table. The Leistungssatz rates (60%/67%), the statutory duration table, and the 20% Sozialversicherungspauschale (§153 Abs. 1 Nr. 1 SGB III) are stable, published law. Two monetary fields — `voluntaryGkvMinimumMonthlyBase` and `pkvSubsidyCeilingMonthly` — are flagged as best-effort approximations that need periodic re-verification against current Bundesagentur/GKV-Spitzenverband publications.

| Function | File | What it computes |
|---|---|---|
| `alg1DurationMonths(insuredMonths, ageAtClaim, year)` | `eligibility.ts` | **§147 SGB III** duration: looks up the statutory insured-months → duration table (12→6, 16→8, 20→10, 24→12 months), then extends via an age-graduated bonus tier (50/30mo→15, 55/36mo→18, 58/48mo→24) when both age and insured months clear that tier's threshold. Returns 0 below the lowest tier. `insuredMonths` is expected to already reflect the "last 30 months" Rahmenfrist — in practice the caller derives it from `years_of_service × 12` unless `months_insured_override` is set, a caller-level approximation. |
| `alg1MonthlyNet(lastGrossMonthlySalary, hasChildren, year)` | `leistungsentgelt.ts` | **§153 SGB III "pauschaliertes Nettoentgelt" (Leistungsentgelt)** — not a flat % of take-home: (1) caps gross monthly salary at the RV/ALV Beitragsbemessungsgrenze; (2) deducts the statutory 20% Sozialversicherungspauschale; (3) deducts a **notional** Lohnsteuer + Soli computed via the real wage-tax engine always at **Steuerklasse I regardless of the claimant's actual tax class** (the Bundesagentur's own Leistungsgruppen A–F system, which this app doesn't model, approximates to class I for the common case — the one remaining simplification vs. the real LStDV table); (4) multiplies by 60% or 67% if the claimant has a qualifying child. |
| `monthlyHealthInsuranceCost(profile, regime, year)` | `health-coverage.ts` | Post-severance health-insurance outflow the runway projection has no other way to see, since nothing charges anything once salary income stops. **GKV**: `"gap"` (self-funded, pre-ALG I) prices voluntary continuation off the statutory minimum income base at the full combined rate (no employer half); `"alg1"` is €0 (Bundesagentur pays it in full). **PKV**: `"gap"` is the full unsubsidized premium; `"alg1"` is the premium minus the Bundesagentur's capped subsidy, floored at 0. "Employed" status needs no separate handling — already priced inside `calculateSocialContributions`. |
| `assessSperrzeitRisk(pkg, severanceGross)` | `sperrzeit.ts` | **Heuristic** Sperrzeit risk flag — explicitly not a legal determination. `SPERRZEIT_WEEKS = 12`, the commonly-published Sperrzeit length for a redundancy exit (**§159 SGB III**). Safe harbor (no risk) requires *both*: (a) notice period effectively observed — proxied as garden leave modeled with a positive notice period, since neither-modeled represents an immediate exit (the classic Sperrzeit trigger); and (b) severance ≤ the §1a KSchG ceiling from `lib/severance`'s `statutoryFloor`. Otherwise returns `atRisk: true` with a reason ending "confirm with the Agentur für Arbeit before relying on this timeline." A package's own `sperrzeit_safe_confirmed` flag bypasses the heuristic entirely — the user's own assertion (e.g. after a lawyer/Agentur already confirmed the exit-agreement wording), not a determination by this app. |

**Dependencies:** `leistungsentgelt.ts`/`health-coverage.ts` call into `lib/tax`. `sperrzeit.ts` calls `lib/severance`'s `statutoryFloor`. All of `lib/unemployment` is orchestrated by `resolve-scenario.ts`, which combines eligibility + benefit amount + Sperrzeit risk + health-insurance cost into the `SeveranceStream` objects fed to `lib/runway`.

## `lib/runway` — month-by-month balance projection engine

Given a fully-resolved severance scenario (starting balance, one or more severance "streams," phased household commitment/income profiles, one-off/recurring events), projects the household's cash balance forward month by month and reports the depletion date and lowest-balance point. Deliberately decoupled from the domain-specific severance/unemployment logic — it only understands generic `SeveranceStream` cash-flow shapes (dates + net amounts); all the German-law-specific reasoning happens once, upstream, in `resolve-scenario.ts`.

Key types (`types.ts`): `SeveranceStream` (one person's garden-leave pay, lump sum, optional ALG I income window, re-employment cutoff, and gap/ALG-I health-insurance costs), `ResolvedSeveranceScenario` (starting balance, `severances[]`, `phases[]`, `events[]`, tax profiles, tax year, optional `horizonMonths` — default 120 months), `RunwayPoint` (`date, balance, monthlyCost?, breakdown?`), `RunwayMonthBreakdown` (`inflows`/`outflows`, itemized).

`projectRunway(scenario)` walks forward from the earliest severance stream's start month for `horizonMonths`. Each month:

1. Picks the active `RunwayPhase` — latest `startDate` ≤ current month (a full profile swap, not an incremental diff).
2. Adds negative line items for that phase's commitments (monthly-equivalent, plus one-offs landing exactly that month).
3. Adds positive line items for that phase's income, netted per split share — recurring-only, deliberately excluding one-time annual bonuses since they aren't timed to a specific month in this data model. Falls back to gross if a split share has no tax profile yet, so the runway never silently drops real cash flow.
4. Per severance stream: garden-leave net pay while before the garden-leave-end month; the net severance lump sum exactly on that month; ALG I net income while active and within its date window; the applicable health-insurance cost (on-ALG-I or gap) from garden-leave-end onward. All of this stops the moment a known re-employment date is reached — garden leave/lump sum are unaffected since they're already-earned money landing on a fixed date.
5. Applies one-off scenario events on their exact month; accumulates/starts recurring-income-start events.
6. Sums everything into `monthDelta`, updates the running balance, records the month's itemized breakdown, and tracks the depletion date (first month balance goes negative) and lowest-balance point.

**Dependencies:** uses `lib/finance` (`toMonthlyEquivalent`, `isActiveOn`, `incomeBreakdownPerSplit`) and `lib/tax` (`calculateNetIncome`) only — it does **not** import `lib/severance` or `lib/unemployment` directly. `resolve-scenario.ts` is the orchestration layer that calls all three domain modules to assemble the `ResolvedSeveranceScenario`, applies the Sperrzeit-conservative date shift (`SPERRZEIT_MONTHS = round(12 weeks × 7 / 30)`, additive on top of any manual deferral — deliberately conservative, likely overstates rather than understates the delay), caps a departing member's own salary income the day before their severance start (only when that salary row is single-owned), and applies scenario-scoped property end-date overrides — then hands the result to `projectRunway`.

## `lib/finance` — dashboard aggregation, income breakdowns, frequency/date utilities

The household-facing aggregation layer — turns raw `commitments`/`income`/`splits`/`tax_profiles` rows into monthly totals, category breakdowns, historical trends, and gross/net income breakdowns per household member. No barrel `index.ts` — files are imported individually.

**`dashboard.ts`**
- `activeCommitments`/`activeIncome` — filter to rows active on a given date.
- `totalMonthlyCommitments` — sum of monthly-equivalent commitments.
- `totalMonthlyIncome` — sum of **gross** monthly-equivalent income.
- `totalMonthlyNetIncome` — nets each income row per split share via that person's own tax profile; shares with no tax profile (or unattributed rows) are **excluded from the total, not approximated as gross**, and counted in `missingProfileCount` for the UI to flag — silently mixing gross and net would make the headline number wrong in a way that's not visible. Recurring-only (one-time bonuses excluded so a December Christmas bonus doesn't inflate every month's steady-state figure).
- `categoryBreakdown` — monthly-equivalent spend grouped by category, sorted descending; an optional weight function lets a caller prorate to one member's split share.
- `todayISO` — current date as `YYYY-MM-DD`.

**`income-gross.ts`**
- `incomeGrossBreakdown` — converts to EUR, splits compensation into `recurringMonthlyGross`, `oneTimeAnnualGross` (Christmas/holiday/discretionary bonus lump, only in "one_time" distribution mode), `bonusAnnualTotal`, reference-only `annualCarAllowance`/`annualPensionContribution`, and `monthlyCompanyCarCost` (the one benefit field that reduces *net* pay, not gross, since it's a payroll deduction). Rental rows reduce the base by an overhead-reserve % before taxing.
- `incomeNetBreakdown` — nets via a **differential method**: taxes recurring gross alone, then recurring+bonus together, attributes the difference to the bonus — a better approximation of the bonus's real marginal rate than netting it independently, since German wage tax is progressive. Same annual-blend simplification as the rest of `lib/tax` (no distinct "sonstige Bezüge" withholding timing).
- `incomeBreakdownPerSplit` — the foundational per-share view: zero splits → one entry for the whole row with `net: null`; splits → one scaled entry per split, netted via that person's own tax profile if present.
- `incomeGrossBreakdownForRow` / `incomeNetBreakdownForRow` — row-level totals across all shares.

**`frequency.ts`** — `toMonthlyEquivalent` (monthly/quarterly/annual → monthly; one-off → 0), `sortCommitmentsByCost` (the shared ordering for every "costs" list in the app), `formatCurrency`/`formatEUR` (`Intl.NumberFormat("de-DE", ...)`).

**`date-utils.ts`** — `isActiveOn`, `firstOfMonth`, `addMonths`, `addDays`, `ageInYears`, `formatDateDisplay`/`formatMonthDisplay` (display-only; storage/wire format stays ISO).

**`splits.ts`** — `shareForMember`, `memberShareOfAmount`, `splitLabel`, `splitPercentageTotal` — shared split-percentage math, works identically for commitment/property/income splits.

**`tax-profile-context.ts`** — `toTaxProfile(row, member)` joins a raw `tax_profiles` row with the household member's health-insurance fields (which live on `household_members`, not `tax_profiles`) into the calc-ready `TaxProfile` shape every consumer expects; falls back to statutory-GKV defaults if the member is missing.

**`property-splits.ts`** — `propertiesWithSplits(supabase, profileId)`: data-access helper (not pure business logic) that fetches properties + ownership splits for a commitment form's property picker.

**`baseline-profile.ts`** — `getBaselineProfile`/`getBaselineProfileId`: fetches the user's one baseline Living Profile; new commitments/income attach here by default.

**`trend.ts`** — `trendMonthsAvailable` (capped at 12) and `computeHistoricalTrend` reconstruct past months' net surplus/deficit by re-running the dashboard aggregation functions against each past date, since there's no stored historical-balance table.

**`csv.ts`** — `toCSV`: generic RFC-4180-style CSV serializer, not domain-specific.

**Dependencies:** depends on `lib/tax` (`calculateNetIncome`) for all net-income math; not on `lib/severance`/`lib/unemployment`/`lib/runway`. Consumed by `lib/runway/project-runway.ts` and by `resolve-scenario.ts`.

## Cross-module dependency summary

```
lib/tax            (foundation — no deps on other lib/* business modules)
   ▲       ▲    ▲
   │       │    │
lib/finance │  lib/unemployment (calls lib/tax for notional Lohnsteuer/Soli, GKV/PV rates)
   ▲         \    ▲
   │          \   │  (sperrzeit.ts also calls lib/severance's statutoryFloor)
   │           \  │
   │        lib/severance
   │             ▲
   │             │
   └── lib/runway (project-runway.ts uses lib/finance + lib/tax only;
                    does NOT import lib/severance/lib/unemployment directly)
                    ▲
                    │
   app/(app)/severance-scenarios/resolve-scenario.ts
   — the orchestration layer: calls lib/severance (package sizing) +
     lib/tax (Fünftelregelung net severance, garden-leave net pay,
     regular taxable income) + lib/unemployment (ALG I duration/amount,
     Sperrzeit risk → shifts ALG I start date, health-insurance cost per
     regime) + lib/finance (active commitments/income, monthly burn,
     date utils, tax-profile join) to assemble a ResolvedSeveranceScenario
     (SeveranceStream[] + phases + events), which it then hands to
     lib/runway's projectRunway() to produce the month-by-month balance
     series, depletion date, and lowest-balance point.
```

Keep `lib/runway` law-agnostic: it should only ever gain generic cash-flow concepts (dates + amounts), never German-tax/benefit-specific fields. New tax-year data goes in `lib/tax/parameters.ts` / `lib/unemployment/parameters.ts`, not scattered across the calculators.
