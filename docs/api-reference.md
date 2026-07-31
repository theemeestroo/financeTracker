# API Reference

This app has no `app/api/` REST API. Almost everything is done through **Next.js Server Actions** (`"use server"` files) called directly from client forms — those are this app's real mutation surface. The only genuine HTTP endpoints are two GET-only CSV export Route Handlers. Update this doc whenever a Route Handler or a `*-actions.ts` file's exported functions change.

## Route Handlers (real HTTP endpoints)

Both are `GET`-only, auth-checked (401 if `supabase.auth.getUser()` returns no user), and stream a CSV file as the response body with `Content-Disposition: attachment`.

### `GET /commitments/export`

`app/(app)/commitments/export/route.ts`. Exports the baseline profile's commitments.

Query: none. Response: `text/csv`, filename `commitments-YYYY-MM-DD.csv`.

Columns: Name, Category, Amount (EUR), Frequency, Essential, Linked to (split label — "Household" / a name / "Name1 60% · Name2 40%"), Start date, End date.

### `GET /income/export`

`app/(app)/income/export/route.ts`. Exports the baseline profile's income rows.

Query: none. Response: `text/csv`, filename `income-YYYY-MM-DD.csv`.

Columns: Name, Linked to, Type, Gross amount, Currency, Exchange rate (1 unit = ? EUR; blank if EUR), Frequency, Start date, End date, Christmas bonus (% of 1mo; salary only), Holiday pay (% of 1mo; salary only), Annual bonus (EUR; salary only), Bonus payout (salary only), Car allowance (EUR/yr, reference only; salary only), Pension contribution (EUR/mo, reference only; salary only), Company car cost (EUR/mo, deducted from net; salary only), Rental overhead (%; rental only).

## Server Actions

Every file below starts with `"use server"`. Each function is called directly as a `<form action={...}>` target (often `.bind(null, id)`-curried for edit/delete on a specific row), typically returning a `{ error?: string }` shape consumed by `useActionState` in the paired client form, or performing a `redirect()`/`revalidatePath()` on success. None of these are reachable as HTTP endpoints in their own right — they only exist as RPC targets for a form in the same route tree.

| File | Functions | Mutates |
|---|---|---|
| `lib/actions/auth.ts` | `login`, `logout` | Supabase Auth session (`signInWithPassword`/`signOut`) |
| `app/(app)/household/actions.ts` | `createHouseholdMember`, `updateHouseholdMember`, `deleteHouseholdMember` | `household_members` |
| `app/(app)/household/tax-profile-actions.ts` | `upsertTaxProfile` | `tax_profiles` |
| `app/(app)/income/actions.ts` | `createIncome`, `updateIncome`, `deleteIncome` | `income`, `income_splits` |
| `app/(app)/commitments/actions.ts` | `createCommitment`, `updateCommitment`, `deleteCommitment` | `commitments`, `commitment_splits` |
| `app/(app)/properties/actions.ts` | `createProperty`, `updateProperty`, `deleteProperty` | `properties`, `property_splits` |
| `app/(app)/profiles/actions.ts` | `createLivingProfile`, `cloneLivingProfile`, `updateLivingProfile`, `deleteLivingProfile`, `updateCurrentLiquidSavings` | `living_profiles` (clone also duplicates the source profile's `commitments`/`income`; `updateCurrentLiquidSavings` is baseline-only in intent — DESIGN v2 §2.5 — though not server-enforced since RLS already scopes to the owner and setting it on a non-baseline row is simply unused) |
| `app/(app)/severance-scenarios/actions.ts` | `createScenario`, `updateScenario`, `deleteScenario` | `severance_scenarios` |
| `app/(app)/severance-scenarios/package-actions.ts` | `addScenarioPackage`, `updateScenarioPackage`, `deleteScenarioPackage` | `severance_scenario_packages` |
| `app/(app)/severance-scenarios/phase-actions.ts` | `addScenarioPhase`, `deleteScenarioPhase` | `severance_scenario_phases` |
| `app/(app)/severance-scenarios/event-actions.ts` | `addScenarioEvent`, `deleteScenarioEvent` | `severance_scenario_events` |
| `app/(app)/severance-scenarios/property-end-actions.ts` | `addScenarioPropertyEnd`, `deleteScenarioPropertyEnd` | `severance_scenario_property_ends` |
| `app/(app)/severance-scenarios/checklist-actions.ts` | `addChecklistItem`, `toggleChecklistItem`, `deleteChecklistItem` | `scenario_checklist_items` |
| `app/(app)/severance-scenarios/variant-actions.ts` | `generateScenarioVariants` | Bulk-inserts derived `severance_scenarios` + child rows (not a simple single-table CRUD — see `docs/business-logic.md`/scenario workspace for what a "variant" is) |

`app/(app)/severance-scenarios/resolve-scenario.ts` is **not** a Server Action file (no `"use server"`) — it's a plain helper (`resolveScenario`, `computeMonthlyBurn`) that composes the tax/severance/unemployment/runway calculations for the scenario pages. See `docs/business-logic.md`.

## Adding a new mutation

Follow the existing pattern: a `"use server"` file colocated with the route it belongs to, one exported async function per operation, `zod`-validated input, returning `{ error?: string } | undefined` for `useActionState` consumers (or `redirect()`ing on success), and a `revalidatePath()` call for every path whose cached data the mutation affects. Don't add a new `app/api/` Route Handler unless the caller genuinely needs a plain HTTP response (like the CSV exports do) — a Server Action is the default for anything invoked from this app's own UI.
