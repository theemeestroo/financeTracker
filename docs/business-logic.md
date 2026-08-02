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
| `calculateSocialContributions(grossMonthly, profile, year)` | `social-contributions.ts` | Employee-side Rentenversicherung + Arbeitslosenversicherung (half of total rate, capped at the RV/ALV ceiling) plus Kranken-/Pflegeversicherung (half of base+Zusatzbeitrag rate, capped at the KV/PV ceiling, plus Kinderlosenzuschlag if childless). Returns **0** for health/care if privately insured — a fixed PKV premium doesn't belong in a payroll-percentage calculation. That 0 is *not* the end of the story: `lib/finance/health-insurance-outgoing.ts` synthesizes the premium back in as a monthly outgoing wherever commitments are aggregated (Overview dashboard, severance-scenario runway) — see that module's own doc entry below. Omitting that step would silently overstate a PKV household's net income (the employer subsidy that lets this be 0 already shows up as extra net pay). |
| `calculateSoli(incomeTax, taxClass, year)` | `soli.ts` | Solidaritätszuschlag: 0 below the Freigrenze, then the lesser of flat 5.5% of tax or 11.9% of the excess over the Freigrenze (Milderungszone, avoids a cliff). |
| `calculateChurchTax(incomeTax, profile, year)` | `church-tax.ts` | 0 if not registered; else `incomeTax × rate` — 8% in Bavaria/Baden-Württemberg, 9% elsewhere. |
| `taxableWageIncome(grossAnnual, socialContributionsAnnual, profile, year)` | `taxable-income.ts` | Converts gross wage income to taxable income (zvE) for classes I/II/IV: subtracts Arbeitnehmer-Pauschbetrag, Sonderausgaben-Pauschbetrag, and actual social insurance contributions (used as a proxy for the Vorsorgepauschale), plus Entlastungsbetrag für Alleinerziehende for class II. Classes V/VI skip all deductions and return raw gross (floored at 0). |
| `calculateNetIncome(grossAmount, frequency, profile, year)` | `net-income.ts` | Top-level "net a recurring income row" entry point: annualizes the gross amount, computes SV contributions on the monthly-equivalent, derives zvE, then income tax, Soli, church tax, and nets it out — returns annual and monthly figures plus the full breakdown. The workhorse called throughout `lib/finance` and `lib/runway`. |
| `calculateSeveranceNet(grossSeverance, regularTaxableIncome, profile, year)` | `fuenftelregelung.ts` | Implements **Fünftelregelung (§34 EStG)**: taxes 1/5 of the severance stacked on top of regular taxable income, takes the tax delta, ×5, to get `taxOnSeverance` — prevents a lump sum from being pushed entirely into the top bracket. Also computes the marginal Soli/church-tax delta attributable to the severance, `netSeverance`, and (for comparison) `marginalTax`/`taxSaving` versus taxing the severance as ordinary income in one go. |
| `clampToAvailableTaxYear(year)` | `parameters.ts` | Clamps an arbitrary calendar year down to the latest year with real §32a parameters — a 10-year runway horizon routinely reaches years with no published formula yet, so those years compute at today's rates rather than throwing (the same assumption `project-runway.ts` already makes with one fixed `scenario.taxYear` for its whole horizon). Callers keep the real calendar year separately for display. |
| `taxBracketBreakdown(taxableIncome, taxClass, year)` | `annual-tax-summary.ts` | Steps a taxable income through *all five* §32a zones — always five entries, in a fixed order, regardless of how far the income actually reaches — each carrying `reached`/`amountInZone`/`taxInZone` (0/false for zones not reached). The data behind the Tax tab's full tax-bracket ladder: every zone is always present so the UI can show the whole 0–45% structure, not just the filled portion. Class III computes on half the income and scales amounts/tax back up by 2 (Splittingverfahren). The last *reached* zone absorbs any floor-rounding remainder so the steps always sum exactly to `calculateIncomeTaxForClass`'s own total. |
| `annualPersonTaxSummary(householdMemberId, year, incomeSources, taxFreeIncome, profile, severance?, investmentIncomeGross?)` | `annual-tax-summary.ts` | One household member's full-year tax position: every regular income source (already combined — see `combinedIncomeBreakdown` below) taxed together via `taxableWageIncome`/`calculateIncomeTaxForClass`/`calculateSoli`/`calculateChurchTax`, plus `bracketSteps` from `taxBracketBreakdown`, plus an optional severance segment — passed through as-is from the scenario's own Fünftelregelung figures rather than retaxed here, so a scenario's Tax tab always agrees with its Cash Flow tab. `taxFreeIncome` (ALG I) adds to the gross/net totals but never to taxable income (Progressionsvorbehalt isn't modeled). `investmentIncomeGross` is taxed separately via `calculateCapitalGainsTax` (below) — kept out of `taxableIncome`/`bracketSteps` entirely (a different regime) but folded into `totalGrossAll`/`totalTaxAll`/`totalNetAll`. Feeds the severance scenario detail page's Tax tab. |
| `calculateCapitalGainsTax(grossAnnual, profile, year)` | `capital-gains-tax.ts` | Abgeltungsteuer on capital income (interest, dividends, investment/savings accrual): 25% flat on the amount over the annual Sparerpauschbetrag allowance (€1,000 single / €2,000 married — `tax_class === 3` reused as the "married" proxy, same convention `calculateSoli` already uses), plus a straight 5.5% Soli on that flat tax (no Freigrenze — Abgeltungsteuer is a final withholding tax, not run through the annual assessment's exemption test) and church tax if registered. A non-positive `grossAnnual` (e.g. interest cost on a negative balance) passes through untaxed. |

**Documented simplifications:**
- V/VI withholding is approximated as the standard tariff — an accepted v1 gap, not the real class-V/VI mechanism.
- Social contributions are used as a Vorsorgepauschale proxy — "very close to the real mechanism for a standard employee case."
- Privately insured members get €0 health/care contributions in the payroll calc by design; premiums belong in `commitments`.
- Bonus netting uses a differential (marginal-stacking) method rather than a distinct "sonstige Bezüge" withholding timing (see `lib/finance/income-gross.ts` below).
- `annualPersonTaxSummary`'s ALG I handling doesn't model Progressionsvorbehalt (tax-free income still nudging the rate on other income).
- `calculateCapitalGainsTax` doesn't model the Günstigerprüfung (comparing Abgeltungsteuer against the marginal wage-tax rate, in case the latter is lower) or church tax's slight base-reduction mechanic — flat rate + straight Soli/church-tax percentage only.
- The Fünftelregelung's own "regular taxable income" base folds in a severed member's non-salary income (rental/part-time/other, via `combinedIncomeBreakdown`) but *not* garden-leave pay combined with it on a month-by-month basis — garden leave and any concurrent non-salary income are still netted independently for display in the runway breakdown, a narrower remaining gap than the one this fixed (a rental row taxed as if it were a severed member's *only* income for the year, even in a year a large severance lump sum also lands).

**Dependencies:** foundation layer — depends only on `lib/types`. Consumed by `lib/finance`, `lib/unemployment`, `lib/runway` (indirectly), and `app/(app)/severance-scenarios/resolve-scenario.ts`.

## `lib/severance` — package sizing, statutory floor, redundancy checklist

Sizes a household member's gross severance package from a scenario's salary snapshot, computes the §1a KSchG statutory reference ceiling, and generates a redundancy admin checklist with target dates.

| Function | File | What it computes |
|---|---|---|
| `calculateSeverancePackage(input)` | `package-calculator.ts` | `monthlyBaseForCalc` = base salary + optionally bonus/12, car-benefit/12, (Christmas bonus % of base)/12 (per include-flags) — Christmas bonus is a once-a-year lump sized as a % of one month's salary, so it's amortized over 12 months same as the other bonus components. `formulaGross` = multiplier × years of service × that base. `severanceGross` = a manual override if set, else `formulaGross`. `noticePay` = notice-period months × base salary (informational — `project-runway.ts` recomputes garden-leave net pay itself rather than using this gross figure). Pure and self-contained: takes the scenario's own salary snapshot, not the household's live `income` table. |
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
| `monthlyHealthInsuranceCost(profile, regime, year)` | `health-coverage.ts` | Post-severance health-insurance outflow the runway projection has no other way to see, since nothing charges anything once salary income stops. **GKV**: `"gap"` (self-funded, pre-ALG I) prices voluntary continuation off the statutory minimum income base at the full combined rate (no employer half); `"alg1"` is €0 (Bundesagentur pays it in full). **PKV**: `"gap"` is the full unsubsidized premium; `"alg1"` is the premium minus the Bundesagentur's capped subsidy, floored at 0. "Employed" status (still on payroll or garden leave) is out of scope for *this* function on purpose — GKV is already priced inside `calculateSocialContributions`, but PKV isn't (see that function's entry above), so the employed-state PKV cost is handled by a different module entirely (below), not a third regime here. |
| `assessSperrzeitRisk(pkg, severanceGross)` | `sperrzeit.ts` | **Heuristic** Sperrzeit risk flag — explicitly not a legal determination. `SPERRZEIT_WEEKS = 12`, the commonly-published Sperrzeit length for a redundancy exit (**§159 SGB III**). Safe harbor (no risk) requires *both*: (a) notice period effectively observed — proxied as garden leave modeled with a positive notice period, since neither-modeled represents an immediate exit (the classic Sperrzeit trigger); and (b) severance ≤ the §1a KSchG ceiling from `lib/severance`'s `statutoryFloor`. Otherwise returns `atRisk: true` with a reason ending "confirm with the Agentur für Arbeit before relying on this timeline." A package's own `sperrzeit_safe_confirmed` flag bypasses the heuristic entirely — the user's own assertion (e.g. after a lawyer/Agentur already confirmed the exit-agreement wording), not a determination by this app. |

**Dependencies:** `leistungsentgelt.ts`/`health-coverage.ts` call into `lib/tax`. `sperrzeit.ts` calls `lib/severance`'s `statutoryFloor`. All of `lib/unemployment` is orchestrated by `resolve-scenario.ts`, which combines eligibility + benefit amount + Sperrzeit risk + health-insurance cost into the `SeveranceStream` objects fed to `lib/runway`.

## `lib/runway` — month-by-month balance projection engine

Given a fully-resolved severance scenario (starting balance, one or more severance "streams," phased household commitment/income profiles, one-off/recurring events), projects the household's cash balance forward month by month and reports the depletion date and lowest-balance point. Deliberately decoupled from the domain-specific severance/unemployment logic — it only understands generic `SeveranceStream` cash-flow shapes (dates + net amounts); all the German-law-specific reasoning happens once, upstream, in `resolve-scenario.ts`.

Key types (`types.ts`): `SeveranceStream` (one person's garden-leave pay, lump sum, optional ALG I income window, re-employment cutoff, and gap/ALG-I health-insurance costs — `gardenLeaveGrossMonthly` alongside the net figure, since garden leave is ordinary wage income and feeds the annual tax summary below), `ResolvedSavingsRule` (one savings/investment rule, amount-vs-percentage already resolved to an `allocationFraction` — a share, 0–1, of the household's *actual running balance*, not a fixed EUR sum — plus its own `householdMemberId`, whose tax profile applies when netting the accrual via Abgeltungsteuer), `ResolvedSeveranceScenario` (starting balance, `severances[]`, `phases[]`, `events[]`, `savingsRules[]`, tax profiles, tax year, optional `horizonMonths` — default 120 months), `RunwayPoint` (`date, balance, monthlyCost?, breakdown?`), `RunwayMonthBreakdown` (`inflows`/`outflows`, itemized). `RunwayLineItem` carries `amount` (net, always) plus four optional fields that only matter for the Tax tab, not the cash-flow breakdown panel itself: `householdMemberId` (who this belongs to — set only when unambiguous), `grossAmount` (gross equivalent), `taxExempt` (ALG I — tax-free, kept out of the bracket view rather than mislabeled), `investmentIncome` (routes `grossAmount` to the flat-tax capital-gains bucket instead of the progressive wage-income one).

`projectRunway(scenario)` walks forward from the earliest severance stream's start month for `horizonMonths`. Each month:

1. Picks the active `RunwayPhase` — latest `startDate` ≤ current month (a full profile swap, not an incremental diff).
2. Adds negative line items for that phase's commitments (monthly-equivalent, plus one-offs landing exactly that month).
3. Adds positive line items for that phase's income, netted per row via `combinedIncomeBreakdown` (see `lib/finance` below) — every active income row/share for the same household member is taxed *together*, not row-by-row, so a second income source (e.g. rental alongside a salary) shares that person's real tax position instead of getting its own fresh allowance. Recurring-only, deliberately excluding one-time annual bonuses since they aren't timed to a specific month in this data model. Falls back to gross if a split share has no tax profile yet, so the runway never silently drops real cash flow. Each item also carries its gross equivalent and (when unambiguous) its owning household member — see `RunwayLineItem` above.
4. Per severance stream: garden-leave net pay while before the garden-leave-end month; the net severance lump sum exactly on that month; ALG I net income while active and within its date window; the applicable health-insurance cost (on-ALG-I or gap) from garden-leave-end onward. All of this stops the moment a known re-employment date is reached — garden leave/lump sum are unaffected since they're already-earned money landing on a fixed date.
5. Applies one-off scenario events on their exact month; accumulates/starts recurring-income-start events.
6. Per savings/investment rule: on each of its own accrual boundaries (`lib/runway/savings.ts`'s `isAccrualMonth`, counted from the rule's own `startMonth`, not the scenario's), computes `allocationFraction × this month's opening balance × periodic rate` as the gross accrual (`periodicAccrual`) — **not** a segregated pot compounding on its own. "Opening balance" is `balance` as it stands before this same month's other items are summed in, so the return tracks the household's real cash position: it rises when income or a lump sum lands, and falls as the household spends its runway down (including going negative against a negative balance). A positive accrual is then netted via `calculateCapitalGainsTax` (Abgeltungsteuer) using the rule's own household member's tax profile — annualized first (periods/year × this period's gross) since the Sparerpauschbetrag is an annual allowance, then the resulting net de-annualized back to this period's share; a negative accrual (interest cost against a negative balance) isn't a taxable event and passes through unchanged. No tax profile yet falls back to gross, same convention as income elsewhere.
7. Sums everything into `monthDelta`, updates the running balance, records the month's itemized breakdown, and tracks the depletion date (first month balance goes negative) and lowest-balance point.

**Dependencies:** uses `lib/finance` (`toMonthlyEquivalent`, `isActiveOn`, `combinedIncomeBreakdown`) and `lib/tax` (`calculateNetIncome`) only — it does **not** import `lib/severance` or `lib/unemployment` directly. `resolve-scenario.ts` is the orchestration layer that calls all three domain modules to assemble the `ResolvedSeveranceScenario`, applies the Sperrzeit-conservative date shift (`SPERRZEIT_MONTHS = round(12 weeks × 7 / 30)`, additive on top of any manual deferral — deliberately conservative, likely overstates rather than understates the delay), caps a departing member's own salary income the day before their severance start (only when that salary row is single-owned), injects `lib/finance/health-insurance-outgoing.ts`'s synthesized PKV commitment into every phase (cut off at each severed member's own `gardenLeaveEndDate`, ongoing for anyone else in the household), resolves each `severance_scenario_savings_rules` row into a `ResolvedSavingsRule`'s `allocationFraction` — percentage-type is the fraction directly; amount-type is `amount ÷ (netSeverance ?? severanceGross)` of its own package, a one-time calibration against the severance base, after which only the resulting fraction matters — anchored at that same `gardenLeaveEndDate`, and applies scenario-scoped property end-date overrides — then hands the result to `projectRunway`.

`isAccrualMonth(rule, date)` / `periodicAccrual(rule, openingBalance)` (`savings.ts`) — the two pure functions behind step 6 above. `isAccrualMonth` counts elapsed months from the rule's own `startMonth` (not the scenario's projection start), true every 1/3/12 months for monthly/quarterly/annually. `periodicAccrual` divides `annualReturnPct` by periods/year (simple division, same "no geometric effective-rate conversion" simplicity as `toMonthlyEquivalent` elsewhere) and applies `allocationFraction × that rate` to whatever `openingBalance` the caller passes — `project-runway.ts` passes its own running `balance`, unmutated so far that iteration, so the return is always based on the real household balance at the start of the month, never an independently-tracked sum.

`projectDoNothingBaseline(dates, startingBalance, monthlySurplus)` (`baseline.ts`, DESIGN v2 §2.5) — the "do-nothing" reference line: a starting balance plus today's net monthly surplus/deficit held flat (no salary growth/career-trajectory modeling), evaluated over the exact same `dates` as a scenario's own `RunwayPoint[]` series so the two overlay point-for-point on `DepletionChart`/`ComparisonChart`. Pure — takes plain numbers, not a scenario; the caller (`severance-scenarios/[id]/page.tsx`, `compare/page.tsx`) sources `startingBalance`/`monthlySurplus` from `lib/finance/baseline-profile.ts`'s `getBaselineRunwayInputs`, which computes the baseline Living Profile's current net surplus the same way the Overview dashboard does, plus its `current_liquid_savings` column (null until the household sets it, in which case callers skip the overlay entirely rather than assume 0).

`sensitivityAnalysis(scenario)` (`sensitivity.ts`, DESIGN v2 §2.6) — "if you cut X, how much longer does this last?" For every discretionary (`essential = false`) category present anywhere in the scenario's phases, re-runs `projectRunway` with that category's non-essential commitments removed (deduped by commitment id across phases first, so a commitment carried unchanged into a later phase doesn't inflate the reported `monthlyAmount`) and diffs the depletion month-index against the baseline. Returns `[]` when the baseline scenario is already sustainable within the horizon — nothing to add when nothing depletes. `monthsAdded` is a lower bound (`horizonLength − baselineIndex`, flagged via `becomesSustainable`) when the cut pushes the projection past the horizon entirely, since there's no later depletion date left to diff against. Ranked descending by `monthsAdded`. Each entry also carries `lines` (the individual commitments behind that category's total, sorted descending — the detail behind a collapsed summary row) and `baselineDepletionDate`/`newDepletionDate` (the plain-language "effect" — the latter is `null` exactly when `becomesSustainable`). Rendered on the scenario detail page's Spend Analysis tab, one collapsible row per entry (`sensitivity-entry.tsx`).

`aggregateAnnualIncomeByMember(series)` (`annual-income.ts`) — groups a `RunwayPoint[]` series by `(householdMemberId, calendar year)`, routing each inflow by its `RunwayLineItem` tags: `taxExempt` → `taxFreeGross`, `investmentIncome` → `investmentGross` (summed, not itemized — the flat-tax regime doesn't need per-source detail), everything else with a `grossAmount` → a named source total in `sources` (merged by label across the year's months). Only attributed items count — a row split across 2+ people has no `householdMemberId` and is silently skipped, same as `RunwayLineItem`'s own tagging rules intend. Takes a plain `RunwayPoint[]`, not a `RunwayResult`, so a caller can feed it more than one series concatenated (see `precedingMonthsSeries` below) — it just groups by date/tags regardless of where the points came from, ignoring outflows/balance entirely. The data source for `resolve-scenario.ts`'s `buildAnnualTaxSummaries`, which pairs each `(member, year)` entry with `lib/tax`'s `annualPersonTaxSummary` (including `investmentGross` as that call's own `investmentIncomeGross` argument) and that year's severance figures (if any) to build the scenario detail page's Tax tab — derived from the already-projected runway rather than recomputed independently, so it always agrees with what the Cash Flow tab shows.

`precedingMonthsSeries(scenario)` (`preceding-months.ts`) — a mid-year severance start means `projectRunway`'s own series only covers from that month onward (correct for the balance projection, which deliberately starts exactly at the severance event), but both the Tax tab's per-year totals and the Cash Flow tab's own chart/breakdown table are more useful showing the household's actual full calendar year. Synthesizes `RunwayPoint`s for January through the month before the projection's start, using the same per-phase logic the real projection uses — `activeProfileFor`/`monthlyIncomeItems`/`monthlyCommitmentItems`, all shared from `monthly-items.ts` rather than duplicated — so a backfilled month's figures are computed identically to a projected one. Severance streams, one-off/recurring scenario events, and savings/investment accrual are deliberately not modeled, since none of them exist yet before the earliest severance actually starts. Balance is computed *backward* from `scenario.startingBalance` (defined as the balance the moment the real projection begins, i.e. the closing balance of the month immediately before it): each earlier month's own closing balance is the next month's closing balance minus that next month's own delta, walking back to January. `buildAnnualTaxSummaries` concatenates these points with the real `runway.series` before aggregating (only `inflows` matter there); the severance scenario detail page's Cash Flow tab concatenates the same points with `runway.series` for *display* only, in a copy that keeps the original `depletionDate`/`lowestBalance`/`lowestBalanceDate` (those measure the scenario's own impact from the severance event onward, not the calendar year as a whole).

## `lib/finance` — dashboard aggregation, income breakdowns, frequency/date utilities

The household-facing aggregation layer — turns raw `commitments`/`income`/`splits`/`tax_profiles` rows into monthly totals, category breakdowns, historical trends, and gross/net income breakdowns per household member. No barrel `index.ts` — files are imported individually.

**`dashboard.ts`**
- `activeCommitments`/`activeIncome` — filter to rows active on a given date.
- `totalMonthlyCommitments` — sum of monthly-equivalent commitments.
- `totalMonthlyIncome` — sum of **gross** monthly-equivalent income.
- `totalMonthlyNetIncome` — nets every income row via `combinedNetBreakdownByRow` (see `income-gross.ts` below), then sums; shares with no tax profile (or unattributed rows) are **excluded from the total, not approximated as gross**, and counted in `missingProfileCount` for the UI to flag — silently mixing gross and net would make the headline number wrong in a way that's not visible. Recurring-only (one-time bonuses excluded so a December Christmas bonus doesn't inflate every month's steady-state figure).
- `categoryBreakdown` — monthly-equivalent spend grouped by category, sorted descending; an optional weight function lets a caller prorate to one member's split share. Each entry also carries `lines` — the individual commitments behind that total, sorted descending, weighted the same way as the total (so they always sum to it) — the detail behind `CategoryBreakdownChart`'s hover tooltip.
- `incomeSummary` — net monthly income grouped two ways in one pass over `combinedIncomeBreakdown`: by `IncomeType` (fixed declaration order, not sorted-by-size, so a type's UI color mapping stays stable across renders) and by household member (sorted descending). Same net-only convention as `totalMonthlyNetIncome`: a share with no tax profile, or a whole unattributed row, contributes 0 rather than a gross approximation — `total` matches `totalMonthlyNetIncome`'s `netMonthly` for the same inputs. Feeds the dashboard's `IncomeSummaryTile`.
- `todayISO` — current date as `YYYY-MM-DD`.

**`health-insurance-outgoing.ts`**
- `healthInsuranceOutgoings(members, profileId, cutoffByMember?)` — synthesizes a `Commitment`-shaped (never persisted, never in the Commitments page's own table) "private health insurance" outgoing for every household member who is PKV, has a premium set, and hasn't opted out (`count_private_health_insurance_as_outgoing`) — always `category: "insurance"`, always `essential: true` (never a sensitivity-panel cut suggestion). Fills the gap `calculateSocialContributions` deliberately leaves (see `lib/tax`'s entry above). `cutoffByMember` end-dates one member's synthetic row directly (same convention as `resolve-scenario.ts`'s `salaryCutoffByMember` — the caller pre-subtracts the day), so a severance scenario can hand off to `monthlyHealthInsuranceCost`'s stream-level cost at `gardenLeaveEndDate` without double-charging. Consumed by the Overview dashboard (unconditional, no cutoff) and `resolve-scenario.ts` (cutoff per severed member, none for anyone else in the household).

**`income-gross.ts`**
- `incomeGrossBreakdown` — converts to EUR, splits compensation into `recurringMonthlyGross`, `oneTimeAnnualGross` (Christmas/holiday/discretionary bonus lump, only in "one_time" distribution mode), `bonusAnnualTotal`, reference-only `annualCarAllowance`/`annualPensionContribution`, and `monthlyCompanyCarCost` (the one benefit field that reduces *net* pay, not gross, since it's a payroll deduction). Rental rows reduce the base by an overhead-reserve % before taxing.
- `combinedIncomeBreakdown(income, splitsByIncome, taxProfileByMember, year)` — the foundational per-share view, and the fix for a real accuracy bug: every row/share is netted **per household member, combined**, not row-by-row. A person's rows are pooled into one annual gross, taxed once via `calculateNetIncome`, then the result is apportioned back across their shares in proportion to each share's own gross (never by netting each row independently — a second income source, e.g. rental alongside a salary, would otherwise get its own fresh Grundfreibetrag and low brackets from zero, drastically understating the tax it owes once actually stacked on top of the rest of that person's income). Apportioning by gross share is itself a documented simplification (the alternative — an explicit source ordering so each one lands at a literal marginal rate — has no natural answer), but it guarantees every person's shares sum to their true combined net for the year. Zero splits → one entry for the whole row with `net: null`.
- `incomeGrossBreakdownForRow` / `combinedNetBreakdownByRow` — row-level totals across all shares (gross doesn't need combining; net regroups `combinedIncomeBreakdown`'s shares back by `incomeId`).

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
     date utils, tax-profile join, combinedIncomeBreakdown) to assemble
     a ResolvedSeveranceScenario (SeveranceStream[] + phases + events),
     which it then hands to lib/runway's projectRunway() to produce the
     month-by-month balance series, depletion date, and lowest-balance
     point.

     The severance package loop's own "regular taxable income" (the
     Fünftelregelung base) folds in a severed member's non-salary income
     — rental/part-time/other rows from the household's own `income`
     table, summed via lib/finance's combinedIncomeBreakdown and
     attributed by split share — alongside the package's own
     monthly_base_salary/annual_bonus fields (salary rows are excluded
     from this fold-in to avoid double-counting what monthly_base_salary
     already represents). Without this, a severed member with meaningful
     rental income had their severance's own progressive-bracket push
     computed against too small a base, understating the real tax it owes
     once combined with the rest of their income for the year.

     resolveScenario()'s sibling export, buildAnnualTaxSummaries(
     runwayScenario, runway, packageSummaries), concatenates
     precedingMonthsSeries(runwayScenario) with the already-projected
     runway.series (backfilling a mid-year severance start's own
     January-onward months — see lib/runway's own entry) and feeds the
     combined points through aggregateAnnualIncomeByMember() +
     lib/tax's annualPersonTaxSummary() (regular income, tax-free ALG I,
     and investment accrual all pulled from the same aggregation) to
     build the scenario detail page's Tax tab — per (household member,
     calendar year), reusing packageSummaries' own severance figures for
     any year a lump sum lands rather than retaxing it, and clamping
     calculation (not display) years past the latest known tax year via
     clampToAvailableTaxYear().

     A third sibling export, scenarioTotals(packageSummaries), derives the
     small set of headline totals both the scenario list and compare pages
     show — earliest severance start, total gross severance (severanceGross
     only, excluding noticePayGross so it's comparable regardless of
     garden leave), total net severance (null if any package's member
     lacks a tax profile yet, rather than silently mixing real net with
     gross), combined ALG I, and severanceByMember (each package's own
     household member with their own gross and net — net left null rather
     than gross-substituted, since callers showing gross alongside it don't
     need net silently standing in for it) — computed once here instead of
     duplicated per page.
```

Keep `lib/runway` law-agnostic: it should only ever gain generic cash-flow concepts (dates + amounts), never German-tax/benefit-specific fields. New tax-year data goes in `lib/tax/parameters.ts` / `lib/unemployment/parameters.ts`, not scattered across the calculators.
