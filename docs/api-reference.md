# API Reference

This app has no `app/api/` REST API. Almost everything is done through **Next.js Server Actions** (`"use server"` files) called directly from client forms — those are this app's real mutation surface. The only genuine HTTP endpoints are two GET-only CSV export Route Handlers. Update this doc whenever a Route Handler or a `*-actions.ts` file's exported functions change — and keep `public/openapi.yaml` and the Help Centre's "API Reference" category (`components/help/help-content.ts`) in sync with the Route Handlers table below (the Server Actions table doesn't need to stay in lockstep with the Help Centre's own summarized version, but should stay accurate here).

Both real endpoints are also published as a proper OpenAPI 3.1 document at **`public/openapi.yaml`** (served statically at `/openapi.yaml`, deliberately left in `PUBLIC_ROUTES` in `lib/supabase/proxy.ts` since it's a schema document, not user data — it works with Swagger Editor/Postman's "import from URL" without a session, while the routes it documents still require a real one to actually call). The in-app Help Centre (`/help` → API Reference tab) renders the same two endpoints plus a link to that file, and a full Server Actions reference list, via two new `HelpBlock` variants (`endpoint`, `link`, alongside the pre-existing `p`/`list`/`note`, plus `code` for the example CSV snippet) — see `docs/frontend-architecture.md`.

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
| `app/(app)/severance-scenarios/actions.ts` | `createScenario`, `updateScenario`, `deleteScenario` | `severance_scenarios` — cascades to every child table (all have `on delete cascade` FKs to `severance_scenarios.id`). `deleteScenario(id, redirectToList?)`'s second arg is only set `true` from the detail page's own delete button (redirects away from a page that's about to 404); the list page's inline delete omits it and just lets revalidation drop the card. |
| `app/(app)/severance-scenarios/duplicate-actions.ts` | `duplicateScenario` | Deep-clones a scenario — packages, phases, events, property-ends, savings rules (remapped `package_id`s) — into a new `severance_scenarios` row named "`<original>` (copy)", then redirects to it. Checklist items are deliberately not copied (task-completion state, not a modeling assumption). Key package parameters (multiplier, include-bonus, garden leave, ...) aren't edited as part of duplicating itself — the user is sent straight to the copy, where every package field is already editable via the existing package edit form. |
| `app/(app)/severance-scenarios/package-actions.ts` | `addScenarioPackage`, `updateScenarioPackage`, `deleteScenarioPackage` | `severance_scenario_packages` |
| `app/(app)/severance-scenarios/phase-actions.ts` | `addScenarioPhase`, `deleteScenarioPhase` | `severance_scenario_phases` |
| `app/(app)/severance-scenarios/event-actions.ts` | `addScenarioEvent`, `deleteScenarioEvent`, `setEventOverride`, `clearEventOverride`, `duplicateGlobalEventIntoScenario`, `dismissStaleEventOverride` | `severance_scenario_events` (scenario-scoped rows only — `addScenarioEvent` inserts `scope="global"` instead, regardless of the bound scenario, when the form's scope toggle is set to "All scenarios"), `severance_global_event_overrides` |
| `app/(app)/severance-scenarios/property-end-actions.ts` | `addScenarioPropertyEnd`, `deleteScenarioPropertyEnd`, `setPropertyEndOverride`, `clearPropertyEndOverride`, `duplicateGlobalPropertyEndIntoScenario`, `dismissStalePropertyEndOverride` | `severance_scenario_property_ends` (scenario-scoped rows only — `addScenarioPropertyEnd` inserts `scope="global"` instead, regardless of the bound scenario, when the form's scope toggle is set to "All scenarios", and rejects it if that property already has a global row), `severance_global_property_end_overrides` |
| `app/(app)/severance-scenarios/checklist-actions.ts` | `addChecklistItem`, `toggleChecklistItem`, `deleteChecklistItem` | `scenario_checklist_items` |
| `app/(app)/severance-scenarios/savings-rule-actions.ts` | `addSavingsRule`, `deleteSavingsRule`, `setSavingsRuleOverride`, `clearSavingsRuleOverride`, `duplicateGlobalSavingsRuleIntoScenario`, `dismissStaleSavingsRuleOverride` | `severance_scenario_savings_rules` (scenario-scoped rows only, same global-insert exception as `addScenarioEvent`) — `addSavingsRule` re-derives the target package's net-severance base and existing allocation total (via `resolveScenario`'s already-merged `runwayScenario.savingsRules`, which folds in any applicable global rule) and rejects a rule that would exceed it (client-side headroom check in `savings-rule-form.tsx` is UX only; this is the authoritative one) — skipped entirely for a `scope="global"` submission, which has no single scenario to validate against yet, `severance_global_savings_rule_overrides` |
| `app/(app)/severance-scenarios/variant-actions.ts` | `generateScenarioVariants` | Bulk-inserts derived `severance_scenarios` + child rows (not a simple single-table CRUD — see `docs/business-logic.md`/scenario workspace for what a "variant" is) |
| `app/(app)/global-rules/event-actions.ts` | `addGlobalEvent`, `updateGlobalEvent`, `deleteGlobalEvent` | `severance_scenario_events` (`scope="global"` rows only — the single shared object edited/deleted from `/global-rules`, independent of any scenario). `deleteGlobalEvent` first snapshots `orphaned_item_name`/`stale_since` onto any `severance_global_event_overrides` row referencing it (flagged for review, not deleted — the FK then nulls the reference) |
| `app/(app)/global-rules/savings-rule-actions.ts` | `addGlobalSavingsRule`, `updateGlobalSavingsRule`, `deleteGlobalSavingsRule` | `severance_scenario_savings_rules` (`scope="global"` rows, keyed by `household_member_id` instead of `package_id`). Same delete-flags-overrides behavior as `deleteGlobalEvent`, against `severance_global_savings_rule_overrides` |
| `app/(app)/global-rules/property-end-actions.ts` | `addGlobalPropertyEnd`, `updateGlobalPropertyEnd`, `deleteGlobalPropertyEnd` | `severance_scenario_property_ends` (`scope="global"` rows only, one per `property_id` — `addGlobalPropertyEnd` rejects a second one for the same property). Same delete-flags-overrides behavior as `deleteGlobalEvent`, against `severance_global_property_end_overrides` |

`app/(app)/severance-scenarios/resolve-scenario.ts` is **not** a Server Action file (no `"use server"`) — it's a plain helper (`resolveScenario`, `computeMonthlyBurn`, `buildAnnualTaxSummaries`, `scenarioTotals`) that composes the tax/severance/unemployment/runway calculations for the scenario pages. See `docs/business-logic.md`.

## Adding a new mutation

Follow the existing pattern: a `"use server"` file colocated with the route it belongs to, one exported async function per operation, `zod`-validated input, returning `{ error?: string } | undefined` for `useActionState` consumers (or `redirect()`ing on success), and a `revalidatePath()` call for every path whose cached data the mutation affects. Don't add a new `app/api/` Route Handler unless the caller genuinely needs a plain HTTP response (like the CSV exports do) — a Server Action is the default for anything invoked from this app's own UI.
