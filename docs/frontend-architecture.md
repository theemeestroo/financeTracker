# Frontend Architecture

Update this doc whenever component hierarchy, navigation, providers, or page patterns change.

## Route inventory

All routes live under `app/(app)/` (the authenticated shell) except `/login` and the root `error.tsx`. There is no `app/api/` directory and no `not-found.tsx` anywhere in the app.

**Outside the authenticated shell**

| Route | File | Notes |
|---|---|---|
| `/login` | `app/login/page.tsx` | Client Component. Sign-in form via `useActionState(login, ...)` calling `lib/actions/auth.ts`'s `login`. |
| — | `app/error.tsx` | Root error boundary (client), generic fallback screen. |

**`app/(app)/` — gated by the group's `layout.tsx`**

| Route | File | Purpose |
|---|---|---|
| `/` | `page.tsx` | Dashboard: active commitments/income, category breakdown, historical trend, owner filter (`?owner=`); renders `SurplusTile`, `CategoryBreakdownChart`, `DepletionChart`. |
| `/commitments` | `commitments/page.tsx` | Commitments list for the baseline profile, grouped/collapsible table, CSV export link. |
| `/commitments/new` | `commitments/new/page.tsx` | Create form. |
| `/commitments/[id]/edit` | `commitments/[id]/edit/page.tsx` | Edit form; `notFound()` if missing. |
| `/commitments/export` | `commitments/export/route.ts` | CSV download (Route Handler, see `docs/api-reference.md`). |
| `/income` | `income/page.tsx` | Income list with gross/net breakdowns, CSV export link. |
| `/income/new` | `income/new/page.tsx` | Create form. |
| `/income/[id]/edit` | `income/[id]/edit/page.tsx` | Edit form. |
| `/income/export` | `income/export/route.ts` | CSV download. |
| `/household` | `household/page.tsx` | Household members list with tax class (joined from `tax_profiles`). |
| `/household/new` | `household/new/page.tsx` | Create-member form. |
| `/household/[id]/edit` | `household/[id]/edit/page.tsx` | Edit a member's personal/insurance fields. |
| `/household/[id]/tax-profile` | `household/[id]/tax-profile/page.tsx` | Upsert a member's `tax_profiles` row. |
| `/profiles` | `profiles/page.tsx` | Living Profiles list with aggregated commitments/income/net income per profile. |
| `/profiles/[profileId]` | `profiles/[profileId]/page.tsx` | Single profile's commitments + income tables, inline create forms, rename. |
| `/properties` | `properties/page.tsx` | Properties list for the baseline profile with linked commitments. |
| `/properties/new` | `properties/new/page.tsx` | Create form. |
| `/properties/[id]` | `properties/[id]/page.tsx` | Property detail: linked commitments, ownership splits. |
| `/properties/[id]/edit` | `properties/[id]/edit/page.tsx` | Edit form. |
| `/severance-scenarios` | `severance-scenarios/page.tsx` | Scenario list with a resolved runway preview per scenario. |
| `/severance-scenarios/new` | `severance-scenarios/new/page.tsx` | Create form. |
| `/severance-scenarios/[id]` | `severance-scenarios/[id]/page.tsx` | The scenario workspace — packages, phases, events, property-ends, checklist, variant generator, runway chart, tabbed (Overview / Cash Flow / Timeline / Checklist). The largest page in the app. |
| `/severance-scenarios/[id]/edit` | `severance-scenarios/[id]/edit/page.tsx` | Edit scenario basics (name, starting balance, notes). |
| `/severance-scenarios/[id]/packages/[packageId]/edit` | `.../packages/[packageId]/edit/page.tsx` | Edit one severance package. |
| `/severance-scenarios/compare` | `severance-scenarios/compare/page.tsx` | Side-by-side runway comparison via `?ids=`, `ComparisonChart` + `ScenarioPicker`. |

**Group-level UX:** `app/(app)/loading.tsx` (skeleton fallback for the whole group during navigation/streaming) and `app/(app)/error.tsx` (client error boundary styled as a `Card`, "Try again" button) sit alongside every route above.

## Layout & provider chain

- **`app/layout.tsx`** (root) — loads `Host_Grotesk` (`--font-sans`) and `Geist_Mono` (`--font-geist-mono`) via `next/font/google`, sets metadata, renders `{children}` plus a single global `<Toaster />`. No auth logic, no data fetching.
- **`app/(app)/layout.tsx`** (route group layout) — Server Component. Creates a Supabase server client, calls `supabase.auth.getUser()`; redirects to `/login` if unauthenticated (a page-level auth check *in addition to* the request-level proxy gate — see `docs/auth-and-security.md`). If authenticated, renders `<AppSidebar userEmail={user.email}>` plus a `<main>` panel (`rounded-[2rem] bg-content-panel`) wrapping `{children}` in a scrollable padded container.

`/login` and the root `error.tsx` sit outside `(app)/layout.tsx` — no sidebar shell.

## Shared component inventory

**`components/ui/` — design-system primitives** (shadcn/ui patterns on `@base-ui/react`, not Radix): `avatar`, `badge`, `button`, `calendar`, `card`, `checkbox`, `date-picker`, `dialog`, `input`, `label`, `native-select`, `popover`, `select`, `separator`, `sheet`, `sidebar` (scaffolded, currently unused — `app-sidebar.tsx` is a hand-rolled replacement), `skeleton`, `sonner` (toast host), `table`, `tabs` (sliding-indicator pill tabs, added for the severance scenario page's Overview/Cash Flow/Timeline/Checklist split — reusable for any future page with more than ~4 logical sections), `tooltip`.

**`components/*.tsx` — feature-level shared components**
- `app-sidebar.tsx` — client; the app's primary nav. `usePathname`-aware: the active route renders as a solid pill, the rest as a 2-column grid of icon tiles; includes a mobile drawer (`Sheet`) and the sign-out form.
- `checklist-item-checkbox.tsx` — client; checkbox that auto-submits a bound server action on change (severance-scenario checklist toggling).
- `collapsible-table-group.tsx` — client; collapsible row-group wrapper for `<Table>`, starts collapsed — groups commitments/income rows by category or profile.
- `currency-amount.tsx` — server; renders a EUR-first amount with the as-entered currency shown underneath when non-EUR.
- `delete-button.tsx` — client; wraps a `<form action>` bound to a delete server action with a confirm dialog before submit.

**`components/charts/*.tsx` — chart widgets** (Recharts-based, all client except `surplus-tile.tsx`)
- `category-breakdown-chart.tsx` — bar chart of commitment spend by category (dashboard).
- `comparison-chart.tsx` — multi-series line chart comparing several scenarios' runway projections (`/severance-scenarios/compare`).
- `depletion-chart.tsx` — composed area/bar chart of one scenario's balance over time; supports a click-to-select month (see `runway-projection.tsx`) and a highlighted current-period column.
- `runway-projection.tsx` — wraps `DepletionChart` plus a per-month itemized income/outgoings breakdown panel (segmented bar + line items) for the selected month.
- `surplus-tile.tsx` — server; stat tile showing monthly income − commitments with an up/down status indicator (dashboard).

## Client vs. Server component split

- **Pages (`page.tsx`) are Server Components** almost everywhere — they call `createClient()` from `lib/supabase/server.ts`, run Supabase queries directly in the component body (often `Promise.all`-batched), and pass server-action references (e.g. `updateIncome.bind(null, id)`) straight into client form components as the `action` prop. `notFound()` handles missing single-record lookups.
- **Forms are separate `"use client"` files** (`commitment-form.tsx`, `income-form.tsx`, `household-member-form.tsx`, `tax-profile-form.tsx`, `property-form.tsx`, `package-form.tsx`, `phase-form.tsx`, `event-form.tsx`, `property-end-form.tsx`, `checklist-item-form.tsx`, `variant-generator-form.tsx`, `new-profile-form.tsx`, and similar) — they hold local state/validation and call the server action passed in as a prop, keeping the parent page itself server-rendered.
- **Small interactive widgets are isolated client components**: `DeleteButton`, `ChecklistItemCheckbox`, `CollapsibleTableGroup`, the dashboard's owner filter, the properties page's property switcher, the compare page's scenario picker, and every chart component (Recharts requires the client).
- **Presentational-only leaf components stay server** where no interactivity is needed: `CurrencyAmount`, `SurplusTile`.
- Design-system primitives in `components/ui/` are client wherever they wrap an interactive `@base-ui/react` primitive (dialog, popover, select, sheet, tabs, tooltip, calendar, date-picker, checkbox) and unmarked/server where purely presentational (badge, card, skeleton).

When adding a new page, follow the existing pattern: keep the `page.tsx` a Server Component, put any form in its own `"use client"` file bound to a server action, and only reach for a client wrapper around the whole page if the page needs shared interactive state across multiple sections (see `components/charts/runway-projection.tsx` for that pattern).
