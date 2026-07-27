# Development Guide

Update this doc whenever commands, env vars, setup steps, or conventions change.

## Setup

```bash
npm install
cp .env.example .env.local   # already points at the project's Supabase instance
npm run dev                  # http://localhost:3000
```

### Environment variables

Both required, both `NEXT_PUBLIC_*` (see `docs/auth-and-security.md` for why that's safe here):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key — RLS is the real access boundary, not this key |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | `next dev` — Turbopack dev server |
| `npm run build` | `next build` — production build (also runs the TypeScript check) |
| `npm run start` | `next start` — serve a production build |
| `npm run lint` | `eslint` |
| `npm run test` | `vitest run` — all `*.test.ts` files, concentrated under `lib/` |
| `npx tsc --noEmit` | Type-check only, faster than a full build during iteration |

Run `npx tsc --noEmit`, `npm run lint`, `npm run test`, and `npm run build` before considering any change done — this repo has no CI configured, so these are the only gates.

## Local Supabase

The repo has `supabase/config.toml` and `supabase/migrations/`, so the Supabase CLI can run a full local stack (Postgres, Auth, Studio) via Docker:

```bash
supabase start                        # boots the local stack (Studio at :54323)
supabase migration list --local       # compare migration files on disk vs. applied-to-local-DB
supabase migration up --local         # apply pending migration files to the local DB
supabase db reset --local             # wipe and rebuild the local DB from all migrations (no seed.sql exists — DB starts empty of data)
supabase stop
```

`.env.local` as checked in points at the **hosted** Supabase project, not the local stack — the app's own dev server (`npm run dev`) talks to production data by default. There's no `seed.sql`, so a fresh local stack has schema but no rows (no test users, no household data). Point `.env.local` at `http://127.0.0.1:54321` with the local anon key (`supabase status` prints it) if you need to develop against a disposable local database instead.

### Adding a migration

Add a new timestamped `.sql` file to `supabase/migrations/` (filename format `YYYYMMDDHHMMSS_description.sql`, matching the existing files), then `supabase migration up --local` to apply it locally and update `docs/data-model.md` to reflect the new final schema. Push to the hosted project the way this project normally deploys schema changes (not automated by anything in this repo as of this writing).

## Conventions

See `claude.md` at the repo root for the full, authoritative list (design language, code conventions, documentation policy). Highlights relevant to day-to-day development:

- **Forms**: inline validation, `role="alert"` on error elements, `zod` schemas server-side.
- **Tables**: `aria-label` on `<table>`, `scope="col"` on `<th>`.
- **Loading/error states**: `loading.tsx` skeletons and `error.tsx` boundaries per route group, not ad hoc spinners.
- **Empty states**: always include a CTA, never a bare "nothing here."
- **Supabase `select()` calls**: explicit column lists, not `select('*')`, unless every column is genuinely needed.
- **Client components**: only mark `"use client"` when the file genuinely needs hooks/events/state — see `docs/frontend-architecture.md` for the established server/client split.
- **No hardcoded colors**: use the semantic tokens in `app/globals.css` (`bg-card`, `text-muted-foreground`, `var(--status-good)`, etc.), never a literal hex or a Tailwind palette class like `bg-blue-500`.

## Verifying UI changes without a login

This app has no self-service sign-up and `.env.local` points at real hosted data, so you can't just spin up a throwaway account to screenshot a change. The pattern used during recent design work:

1. Add a temporary route (e.g. `app/design-preview/page.tsx`) rendering the real components you're changing with fake data.
2. Temporarily add its path to `PUBLIC_ROUTES` in `lib/supabase/proxy.ts` so the proxy doesn't redirect it to `/login`.
3. Screenshot it (a headless Chromium pointed at `http://localhost:3000/<route>` works well; `playwright-core` with `executablePath` set to a locally installed Chrome avoids downloading a browser binary).
4. **Revert both** — delete the temporary route and remove it from `PUBLIC_ROUTES` — before considering the change done. Never leave a temporary public route or `PUBLIC_ROUTES` entry in a commit.

Keep any such scratch scripts/screenshots outside the repo (e.g. in a scratch/tmp directory), not committed.

## Testing conventions

Unit tests live next to the module they cover (`lib/tax/wage-tax.test.ts` next to `wage-tax.ts`, etc.), using Vitest. Business-logic modules (`lib/tax`, `lib/severance`, `lib/unemployment`, `lib/runway`) are the most heavily tested — hand-computed fixtures checked against the real German tax/benefit formulas, boundary cases (e.g. Sperrzeit safe-harbor edges) explicitly covered. There is no component/UI test suite; UI changes are verified by running the app (see above) rather than automated rendering tests.
