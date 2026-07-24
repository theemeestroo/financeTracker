# PRD: Household Financial Runway Tracker

## 1. Overview
A personal (household) web app to track recurring financial commitments and income, give a clear cost overview, and — as the core differentiator — model how long a lump-sum severance payment would last against ongoing commitments, so you can see the runway and the date at which funds would be depleted under different scenarios.

## 2. Problem Statement
Right now, tracking commitments (rent/mortgage, insurance, subscriptions, loans, etc.) and comparing them to income likely lives in spreadsheets. There's no easy way to answer: "If I take the severance package, how long does the money actually last given our current burn rate, and what happens if costs or income change?"

## 3. Goals
- Single, reliable overview of all recurring financial commitments and their frequency/amount
- Overview of income sources vs. total commitments (monthly surplus/deficit)
- A "runway" calculator: given a lump sum (e.g. net severance payout) and current burn rate, project the depletion date
- Ability to run multiple scenarios (e.g. reduced spending, part-time income, one-off costs like the IAB investment) and compare them side by side
- Simple enough to update in minutes when a bill changes

## 4. Non-Goals (v1)
- Full personal finance / budgeting suite (no bank sync, no categorization AI, no investment portfolio tracking)
- Multi-tenant SaaS or shared login system — this stays a solo-operated tool
- Multi-currency support — EUR only unless a real need shows up
- Mobile app (responsive web is enough for v1)

## 5. Users
- Solo tool — you are the only person who logs in and operates it
- The app can model multiple people within a household (e.g. you and your partner) as line items/income sources, without needing separate logins

## 6. Core Features

### 6.1 Commitments Tracker
- Add/edit/delete recurring commitments: name, category, amount, frequency (monthly/quarterly/annual), start date, optional end date
- Mark as essential vs. discretionary (useful later for "bare-bones runway" scenario)
- Overview table + total monthly-equivalent cost

### 6.2 Income Tracker
- Add/edit income sources: name, amount, frequency, type (salary, part-time, rental, other)
- Each income source is attached to a household member (e.g. "you" or "partner"), so the app can model a household of more than one person without needing multiple logins
- Support marking an income source as ending on a known date (e.g. last day of employment) or starting on a future date (e.g. a new part-time role)

### 6.3 Dashboard / Overview
- Monthly surplus or deficit (income − commitments)
- Breakdown by category (chart)
- Trend view if historical data is entered

### 6.4 Tax Calculator
- German income/severance tax calculator, since scenarios need to run on net (not gross) figures
- Target accuracy: ~99% vs. actual — real German tax rules (income tax bands, solidarity surcharge, church tax, social security) implemented properly rather than a rough approximation, but edge cases don't need to be bulletproof
- Handles gross severance → net via Fünftelregelung logic
- Handles regular salary and part-time income → net (standard wage tax, solidarity surcharge, church tax toggle, social security contributions where applicable)
- Output feeds directly into the runway scenarios below, so a change in gross salary or severance amount automatically recalculates net cash flow
- Treated as its own module so the calculation logic can be reviewed/adjusted independently of the scenario engine

### 6.5 Severance / Runway Scenario Modeling
- Input: gross severance amount → converted to net via the tax calculator (§6.4)
- Input: expected start date of the scenario, and monthly burn rate (pulled from commitments, adjustable)
- Input: optional part-time (or new full-time) job — gross amount, start date, converted to net via the tax calculator — so you can see how picking up part-time work changes the depletion date
- Output: projected depletion date and remaining balance over time (chart)
- Support multiple named scenarios (e.g. "Full severance, no new income", "Severance + part-time job from month X", "Severance + IAB investment outflow") and compare them side by side
- Ability to add one-off events into a scenario (e.g. lump-sum investment outflow, pension contribution, one-off cost)

### 6.6 Scenario Comparison
- Table/chart comparing scenarios: end date, lowest balance point, monthly burn, impact of adding part-time income

## 7. Data Model (draft)
- `household_members`: id, name
- `commitments`: id, name, category, amount, frequency, essential (bool), start_date, end_date
- `income`: id, household_member_id, name, gross_amount, type (salary/part-time/rental/other), frequency, start_date, end_date (nullable)
- `scenarios`: id, name, gross_severance, severance_start_date, notes
- `scenario_events`: id, scenario_id, name, amount, date (one-off in/outflows, e.g. IAB investment, new part-time job start)
- `tax_profile`: id, household_member_id, church_tax (bool), tax_class, other parameters needed for the net calculation

## 8. Proposed Approach
Given your preference for GUI-first tools over terminal-heavy workflows, two hosting paths are viable — the choice mainly affects setup, not the feature set:

**Option A — Local-only**
- Runs entirely on your PC (e.g. a local web app with a local database like SQLite)
- Pros: data never leaves your machine, no hosting cost, simplest for sensitive financial data
- Cons: no access from other devices unless you set that up yourself; you're responsible for backups

**Option B — Hosted web app (Next.js + Supabase + Vercel)**
- Pros: accessible from anywhere, easier to iterate on with me
- Cons: data sits in a hosted database (Supabase) rather than purely locally — worth considering given how sensitive this data is, even though it stays in your own private project

No decision needed yet — this can be built either way from the same PRD; the recommendation is to start with whichever you're more likely to actually keep using day to day.

Regardless of path: form-based UI, no CLI needed day-to-day, charts via Recharts for the runway/depletion visualization.

## 9. Success Criteria
- You can answer "what's our monthly surplus right now?" in one glance
- You can answer "if I take the severance today, when does it run out?" without opening a spreadsheet
- You can answer "what changes if I take a part-time job in month X?" directly in the app
- Net (not gross) figures are used throughout, so scenario numbers are realistic
- Updating a commitment or running a new scenario takes under a minute

## 10. Open Questions
1. Local-only or Letly-style hosting (Option A vs B above) — your call whenever you're ready
