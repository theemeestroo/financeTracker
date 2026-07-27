# Architecture

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack, React 19), TypeScript in `strict` mode, path alias `@/*` → repo root.
- **Backend/DB:** Supabase (Postgres + Auth + Row Level Security). No custom backend server — the app talks to Supabase directly from Server Components, Server Actions, and two Route Handlers.
- **Styling:** Tailwind CSS v4 + shadcn/ui components on `@base-ui/react` primitives (not Radix — see `components/ui/*.tsx`, which wrap `@base-ui/react/*`).
- **Charts:** Recharts.
- **Forms/validation:** native `<form action>` + `useActionState`, validated server-side with `zod`.
- **Testing:** Vitest, unit tests colocated as `*.test.ts` next to the module they cover (concentrated in `lib/`).
- **Fonts:** Host Grotesk (`--font-sans`, display + body) and Geist Mono (`--font-geist-mono`), loaded via `next/font/google` in the root layout.

## Project structure

```
app/
  layout.tsx              root layout — fonts, metadata, global <Toaster/>, no auth logic
  error.tsx                outermost error boundary
  login/page.tsx            sign-in form (outside the authenticated shell)
  (app)/                   route group — every authenticated page
    layout.tsx              auth gate (redirects to /login) + sidebar shell
    loading.tsx / error.tsx  group-wide skeleton / error boundary
    page.tsx                 dashboard
    commitments/  income/  household/  profiles/  properties/  severance-scenarios/
      page.tsx, new/, [id]/edit/, ...      route + *-form.tsx (client) + actions.ts ("use server")
    commitments/export/route.ts, income/export/route.ts   CSV download endpoints
components/
  ui/                      shadcn/base-ui design-system primitives (button, card, tabs, table, ...)
  charts/                  Recharts widgets (depletion-chart, comparison-chart, category-breakdown-chart, runway-projection, surplus-tile)
  app-sidebar.tsx, delete-button.tsx, checklist-item-checkbox.tsx, collapsible-table-group.tsx, currency-amount.tsx
lib/
  tax/            German wage tax, social contributions, Fünftelregelung
  severance/      severance package sizing, statutory floor, redundancy checklist
  unemployment/   ALG I eligibility/amount, Sperrzeit risk, health-insurance coverage
  runway/         month-by-month balance projection engine
  finance/        dashboard aggregation, income gross/net breakdowns, frequency/date/split utilities
  supabase/       server.ts / client.ts (client factories), proxy.ts (auth middleware logic)
  actions/auth.ts  login/logout server actions
  types.ts         shared TS types + UI constant lists (categories, frequencies, tax classes, ...)
proxy.ts                    Next.js 16 "Proxy" (middleware) entry point, root of repo
supabase/
  migrations/*.sql          schema history (see docs/data-model.md)
  config.toml                local Supabase CLI config
```

Route folders follow one convention throughout: `page.tsx` is a Server Component that fetches data and renders a client `*-form.tsx` for any mutation, bound to a server action from a sibling `actions.ts`. See `docs/frontend-architecture.md` for the full route inventory and `docs/api-reference.md` for the action/route surface.

## Layout & provider chain

```
app/layout.tsx (fonts, <Toaster/>)
 ├─ app/login/page.tsx           (client, outside the sidebar shell)
 ├─ app/error.tsx                (client, outermost error boundary)
 └─ app/(app)/layout.tsx         (server — auth check, <AppSidebar/> + main content panel)
     ├─ app/(app)/loading.tsx    (skeleton, group-wide)
     ├─ app/(app)/error.tsx      (client error boundary, group-wide)
     └─ every authenticated page
```

There is no client-side theme/context provider tree beyond `next-themes`' `useTheme()` hook used inside `components/ui/sonner.tsx` (Sonner's own toast styling) — no `ThemeProvider` wraps the app, and there's no light/dark toggle. See `claude.md`'s Design Language section for the current color system (a single dark palette applied globally via CSS custom properties in `app/globals.css`, no `.dark`-class toggle in use).

## Design principles this codebase holds itself to

- **Pure business logic.** Everything under `lib/tax`, `lib/severance`, `lib/unemployment`, `lib/runway` is pure functions (inputs in, numbers out, no I/O), unit-tested independently of the UI. `lib/runway` in particular stays law-agnostic — it only understands generic cash-flow shapes; all German-tax/benefit-specific reasoning happens once, upstream, in `app/(app)/severance-scenarios/resolve-scenario.ts`. See `docs/business-logic.md`.
- **Explicit column lists.** Supabase `select()` calls list columns explicitly rather than `select('*')`, except where genuinely all columns are needed — keeps payloads small and makes it obvious what a page actually reads.
- **Server Components by default.** Pages fetch data directly in the Server Component body (often batched with `Promise.all`); interactivity is pushed down into small, separately-marked `"use client"` files (forms, delete buttons, charts, checkboxes that auto-submit). See `docs/frontend-architecture.md` for the exact split.
- **No hardcoded chrome colors.** Every color in `app/` and `components/` is a semantic Tailwind/CSS-variable token (`bg-card`, `text-muted-foreground`, `var(--status-good)`, etc.) — never a literal hex or Tailwind palette class — so the whole app reskins from one place (`app/globals.css`). Confirmed by grep audit as of the last palette rollout; keep it that way.
- **Legal/tax simplifications are documented in place, not hidden.** Every deliberate approximation in the tax/severance/unemployment engines (e.g. Steuerklasse V/VI approximated as standard tariff, Sperrzeit risk as a heuristic not a determination) is called out in a code comment next to the relevant function and mirrored in `docs/business-logic.md`. This is explicitly **not a legal- or tax-advice product**.
