## Design Language

**Calm, data-dense, finance-adjacent** — inspired by Linear (sidebar), Notion (tables), Stripe (metric cards).  

- **Monochrome-first**: UI chrome is near-monochrome; colour reserved for semantic data (green/amber/red)
- **Tight spacing, sharp radii**: `0.5rem` base radius, compact padding, tabular-nums on financial data
- **Sidebar**: Linear-style — 240px, grouped sections, 2px left-edge active indicator, icon-only collapse
- **Tables**: Notion-style — bottom-border rows only, no zebra striping, uppercase-xs header labels
- **Cards**: Stripe-style — label → large value → trend. 1px border, no shadow, no icon backgrounds
- **Hover states**: Gentle `bg-muted/50` shifts, not bold colour changes
- **Typography**: Smaller muted labels, larger bold values, tight heading tracking

## Code Conventions

- Styling: Tailwind CSS + shadcn/ui
- Forms: inline validation, `role="alert"` on error elements
- Tables: `aria-label` on `<table>`, `scope="col"` on `<th>`
- Loading: skeleton components in `loading.tsx` files
- Error handling: `error.tsx` boundaries per route group
- Empty states: always include a CTA
- Select queries: use explicit column lists (not `select('*')`) unless all columns needed
- Client components: only use `'use client'` when genuinely needed (hooks, events, state)

## Documentation Policy

### Developer Documentation (`docs/`)

The `docs/` directory contains system documentation for developers. **Keep it in sync with code changes.**

After any change that alters architecture, data model, API endpoints, business logic, auth/security, frontend structure, or development workflows, update the relevant file(s):

| File | Update when… |
|------|-------------|
| `docs/architecture.md` | Stack, project structure, routing, providers, or design principles change |
| `docs/data-model.md` | Database tables, columns, or RLS policies change |
| `docs/api-reference.md` | API routes are added, removed, or their contracts change |
| `docs/business-logic.md` | Tax engine, simulation, profitability, compliance, allocation, or document engine logic changes |
| `docs/auth-and-security.md` | Auth flow, roles, permissions, or security patterns change |
| `docs/frontend-architecture.md` | Component hierarchy, navigation, i18n, providers, or page patterns change |
| `docs/development-guide.md` | Commands, env vars, setup steps, or conventions change |