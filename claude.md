## Design Language

**Bold, vibrant, finance-native dark UI** — a deep navy/ink canvas with pill radii everywhere and nested floating panels, energized by a small set of validated accent hues instead of the earlier warm-monochrome system. (That original light "ink + soft-mint duotone" direction is still in git history if it's ever needed again — see `DESIGN-financial-runway-app-v2.md` for the feature spec it doesn't affect.)

- **Palette**: near-black navy canvas `#14131F`, raised navy card surface `#1E1D2E`, sidebar surface `#1A1926`, off-white text `#F5F5F7`, muted lavender-grey secondary text `#9C9AB8`. Four accent hues do double duty as brand chrome *and* semantic data — teal `#0D9488` (primary/brand, `--status-good`), blue `#3B82F6`, pink `#EC4899`, amber `#D97706` (`--status-warning`/`--status-discretionary`) — chosen and validated with the `dataviz` skill's palette checker (`scripts/validate_palette.js`): all four clear the dark-mode categorical checks (OKLCH lightness band, chroma floor, CVD adjacent-pair separation) on the card surface, and each clears WCAG text contrast standalone on both the page and card surfaces. Headline numbers stay neutral white per that skill's own rule (text wears text tokens, never the series color) — color lives on icon chips, status dots, badges, chart marks, and the tab indicator, not on the big figures themselves. Re-run the validator before ever changing a token in `app/globals.css`
- **Typography**: Host Grotesk throughout (display and body), heavy weight for large figures, tabular-nums on all financial data, tight tracking on headings
- **Radius**: generous — `1rem` base token, pill (`rounded-full`) on buttons/badges/nav items/tabs, `1.5–2rem` on cards and shell panels
- **Shell**: nested floating panels, not edge-to-edge — dark navy page canvas holding a darker-navy sidebar card and a raised-navy content card, each large-radius with a visible gap between them
- **Sidebar**: navy card — logo mark (teal icon chip), user mini-card (avatar + name), active route as a solid-teal pill, other routes as a 2-column grid of bordered icon tiles (icon stacked over label)
- **Top bar**: search/filter pill on the left; outline "Export" button + solid teal pill primary-action button on the right
- **Cards**: label → oversized bold value (neutral white) → trend pill or small accent-colored icon chip (Stripe-style metric cards kept, just bigger). 1px border, no shadow
- **Tabs**: for pages with more than ~4 logical sections, group them into pill tabs with a sliding accent-colored indicator (`components/ui/tabs.tsx`, a `@base-ui/react/tabs` wrapper) instead of one long stacked-card scroll — see the severance scenario detail page for the reference implementation (Overview / Cash Flow / Timeline / Checklist)
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

### User Documentation (`components/help/`)

The in-app Help Centre lives at `/help` and is built from `components/help/help-content.ts`.

**For major user-facing feature additions or changes**, update the relevant article in `HELP_ARTICLES` or add a new article entry. This includes:
- New pages or sections visible to users
- Significant changes to existing workflows (e.g. new form fields, changed navigation)
- New integrations or capabilities users interact with

Minor internal refactors, bug fixes, and non-user-facing changes do NOT require user doc updates.