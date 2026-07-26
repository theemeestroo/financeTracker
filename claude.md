## Design Language

**Bold, warm-monochrome, finance-native** — inspired by the LoadLogic-style SaaS dashboard: oversized display type, ink + soft-mint duotone, pill radii everywhere, nested floating panels on a grey canvas.

- **Palette**: near-monochrome core — ink `#0C0D0D`, page canvas grey `#E7E8EC`, content-panel mint `#ECF4EE`, off-white `#FAFAFA` / white `#FFFFFF`. Colour stays reserved for semantic data only (`--status-good` / `--status-critical` dots, `--series-1..4` for multi-series charts) — never for chrome
- **Typography**: Host Grotesk throughout (display and body), heavy weight for large figures, tabular-nums on all financial data, tight tracking on headings
- **Radius**: generous — `1rem` base token, pill (`rounded-full`) on buttons/badges/nav items, `1.5–2rem` on cards and shell panels
- **Shell**: nested floating panels, not edge-to-edge — grey page canvas holding a white sidebar card and a mint content card, each large-radius with a visible gap between them
- **Sidebar**: white card — logo mark, user mini-card (avatar + name), active route as a solid-ink pill, other routes as a 2-column grid of bordered icon tiles (icon stacked over label)
- **Top bar**: search/filter pill on the left; outline "Export" button + solid ink pill primary-action button on the right
- **Cards**: label → oversized bold value → trend pill (Stripe-style metric cards kept, just bigger). 1px border, no shadow, no icon backgrounds
- **Tables**: Notion-style — bottom-border rows only, no zebra striping, uppercase-xs header labels, status shown as a coloured dot + label (not a chip), pill-shaped filter tabs above the table
- **Charts**: gradient-fill bar/column charts with a highlighted current-period column; category breakdowns as segmented stacked bars with a dot legend
- **Hover states**: gentle `bg-muted/50` shifts, not bold colour changes

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