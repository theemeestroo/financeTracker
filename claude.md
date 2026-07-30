## Design Language

**Bold, vibrant, finance-native dual-theme UI** — a deep navy/ink canvas with pill radii everywhere and nested floating panels, energized by a small set of validated accent hues instead of the earlier warm-monochrome system. Dark is the default brand identity; light is a fully-designed alternative behind the sidebar's theme toggle (`components/theme-toggle.tsx`, `next-themes`, `attribute="class"`, `defaultTheme="dark"`). (The pre-dark-rollout "ink + soft-mint duotone" theme is still in git history if it's ever needed again — see `DESIGN-financial-runway-app-v2.md` for the feature spec it doesn't affect.)

- **Palette — brand vs. status, deliberately decoupled**: brand chrome (buttons, active nav pill, tab indicator, focus ring, logo mark) is indigo `#6366F1` — it does **not** double as semantic data. `--status-good` is its own token, teal `#0D9488`, a pure "positive" signal. The other three status/categorical hues are unchanged: blue `#3B82F6`, pink `#EC4899` (also `--primary-2`, the Glow gradient's partner stop), amber `#D97706` dark / `#B45309` light (`--status-warning`/`--status-discretionary`) — chosen and validated with the `dataviz` skill's palette checker (`scripts/validate_palette.js`): all four clear the categorical checks (OKLCH lightness band, chroma floor, CVD adjacent-pair separation) on both the dark card surface (`#1E1D2E`) and the light card surface (`#FFFFFF`), and each clears WCAG text contrast standalone on both the page and card surfaces in both themes. Indigo primary clears 4.47:1 (white text) on both card surfaces. Headline numbers stay neutral white/ink per the dataviz skill's own rule (text wears text tokens, never the series color) — color lives on icon chips, status dots, badges, chart marks, and the tab indicator, not on the big figures themselves. Re-run the validator before ever changing a token in `app/globals.css`, for **both** `--mode dark` and `--mode light`
- **Dark surfaces**: near-black navy canvas `#14131F`, raised navy card `#1E1D2E`, sidebar `#1A1926`, off-white text `#F5F5F7`, muted lavender-grey secondary text `#9C9AB8`
- **Light surfaces**: soft lavender-tinted canvas `#F3F2F9` (not stark white — a chosen neutral, not an inversion), white card/content-panel `#FFFFFF`, lavender-tinted sidebar `#ECE9F6`, ink text `#14131F` (a deliberate callback to the dark theme's canvas hex), muted grey-lavender secondary text `#6B6980`
- **"Glow" energy treatment**: brand-chrome surfaces (primary button, active nav pill, tab indicator, logo chip) use a `.gradient-brand` diagonal gradient (indigo → pink, `app/globals.css`'s `--primary`/`--primary-2`) instead of a flat fill; metric tiles (`.glow-card`) lift 2px and gain a soft indigo-tinted shadow on hover; the app shell (`app/(app)/layout.tsx`) has two large, very-low-opacity blurred colour blobs behind the floating panels, visible only through the gap/edges around them. All of it respects `prefers-reduced-motion`. This is a treatment layer on top of the token system above, not a replacement for it — new brand-chrome components should add `gradient-brand` (or `glow-card` for a stat tile), not a hand-rolled gradient
- **Typography**: Host Grotesk throughout (display and body), heavy weight for large figures, tabular-nums on all financial data, tight tracking on headings
- **Radius**: generous — `1rem` base token, pill (`rounded-full`) on buttons/badges/nav items/tabs, `1.5–2rem` on cards and shell panels
- **Shell**: nested floating panels, not edge-to-edge — page canvas holding a sidebar card and a raised content card, each large-radius with a visible gap between them (plus the ambient glow blobs described above)
- **Sidebar**: logo mark (gradient-brand icon chip), user mini-card (avatar + name), active route as a `gradient-brand` pill, other routes as a 2-column grid of bordered icon tiles (icon stacked over label), theme toggle + Help + Sign out in the footer
- **Top bar**: search/filter pill on the left; outline "Export" button + `gradient-brand` primary-action button on the right
- **Cards**: label → oversized bold value (neutral text token) → trend pill or small accent-colored icon chip (Stripe-style metric cards kept, just bigger). 1px border, no shadow at rest; metric tiles add `.glow-card`'s hover lift+glow
- **Tabs**: for pages with more than ~4 logical sections, group them into pill tabs with a sliding `gradient-brand` indicator (`components/ui/tabs.tsx`, a `@base-ui/react/tabs` wrapper) instead of one long stacked-card scroll — see the severance scenario detail page for the reference implementation (Overview / Cash Flow / Timeline / Checklist)
- **Tables**: Notion-style — bottom-border rows only, no zebra striping, uppercase-xs header labels, status shown as a coloured dot + label (not a chip), pill-shaped filter tabs above the table
- **Charts**: gradient-fill bar/column charts with a highlighted current-period column; category breakdowns as segmented stacked bars with a dot legend
- **Hover states**: gentle `bg-muted/50` shifts for most surfaces, not bold colour changes; metric tiles are the deliberate exception (`.glow-card`)

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