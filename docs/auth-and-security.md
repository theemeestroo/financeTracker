# Auth & Security

Update this doc whenever the auth flow, roles/permissions, or a security-relevant pattern changes.

## Auth model

Email/password only, via Supabase Auth. There is **no self-service sign-up flow** in the app — users are provisioned directly in Supabase (this is a single-household personal tool, not a multi-tenant product). `app/login/page.tsx` only renders a sign-in form.

- **`login(prevState, formData)`** (`lib/actions/auth.ts`) — `zod`-validates email/password, calls `supabase.auth.signInWithPassword`, returns `{ error: "Incorrect email or password." }` on failure (deliberately generic, doesn't distinguish "no such user" from "wrong password"), `redirect("/")` on success.
- **`logout()`** (`lib/actions/auth.ts`) — `supabase.auth.signOut()`, `redirect("/login")`.

Every new Supabase Auth user automatically gets a baseline `living_profiles` row and a `household_members` row via the `handle_new_user()` DB trigger (`SECURITY DEFINER`, fires `after insert on auth.users`) — see `docs/data-model.md`.

## Two Supabase client factories

- **`lib/supabase/server.ts`** — `createClient()` (async), cookie-bound via `next/headers`, used in every Server Component and Server Action. The `setAll` cookie writer is wrapped in a try/catch: writes from a Server Component are expected to throw (Server Components can't set cookies) and are silently ignored, because the proxy already refreshes the session cookie on every request.
- **`lib/supabase/client.ts`** — `createClient()` (sync), `createBrowserClient`, used by any `"use client"` component that needs its own Supabase call (rare — most data access goes through server-fetched props).

Both read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the environment — **anon key only**, never a service-role key, anywhere in application code. All access control is therefore enforced by Postgres RLS, not by the app trusting its own queries.

## Request-level auth gate (the "Proxy")

Next.js 16 renamed middleware to **Proxy**. The entry point is `proxy.ts` at the repo root:

```ts
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

It delegates to **`updateSession`** in `lib/supabase/proxy.ts`, which runs on every matched request (i.e. everything except static assets):

1. Builds a Supabase SSR client bound to the request/response cookie jar.
2. Calls `supabase.auth.getUser()` — this both authenticates the request and **refreshes the session token**. The code has an explicit comment warning not to run anything between client creation and this call, since the refresh must happen unconditionally on every request.
3. `PUBLIC_ROUTES = ["/login", "/openapi.yaml"]`. If there's no user and the route isn't public → redirect to `/login`. If there *is* a user and the route *is* `/login` → redirect to `/`. Otherwise pass through with the refreshed cookies attached. `/openapi.yaml` (a static schema document under `public/`, not user data) is the one deliberate exception to "everything requires a session" — left fetchable without one so external tooling (Swagger Editor, Postman's "import from URL") can read it directly; the two HTTP routes it documents still check `auth.getUser()` themselves and 401 without a real session, so this doesn't expose any data.

## Page-level auth gate (defense in depth)

`app/(app)/layout.tsx` independently calls `supabase.auth.getUser()` and `redirect("/login")` if there's no user, before rendering the sidebar shell or any child route. This means every authenticated page is protected twice — once by the proxy before the request is even routed, and again by the layout itself. Keep both in sync if the auth model ever changes (e.g. adding roles) — don't remove either layer.

**If you ever need a new public (unauthenticated) route**, add it to `PUBLIC_ROUTES` in `lib/supabase/proxy.ts`. There is no other allowlist to update. (A throwaway route was added and removed here during recent UI design verification — see git history for the pattern of doing that safely: local-only, reverted before the session ended, never committed.)

## Authorization model: Postgres RLS, not app-level checks

There are no role/permission checks anywhere in application code — authorization is entirely Postgres Row Level Security. Every user-owned table follows the same shape (see `docs/data-model.md` for the full list):

```sql
alter table <table> enable row level security;

create policy <table>_select_own on <table> for select using (user_id = auth.uid());
create policy <table>_insert_own on <table> for insert with check (user_id = auth.uid());
create policy <table>_update_own on <table> for update using (user_id = auth.uid());
create policy <table>_delete_own on <table> for delete using (user_id = auth.uid());
```

`user_id` defaults to `auth.uid()` on every table, so inserts from application code don't need to (and shouldn't) pass it explicitly — the anon-key client, running under the authenticated user's session, can only ever see/write its own rows regardless of what the app code does or doesn't check. This means a bug in a page's Supabase query can leak a wrong *shape* of data but can never leak another user's *rows* — RLS is the actual security boundary, the app is just UX on top of it.

Two exceptions, both **read-only global reference data** (`tax_year_parameters`, `unemployment_benefit_parameters`): no `user_id`, and only a `select`-for-`authenticated` policy exists — there is no insert/update/delete policy for any role, so those tables can only be written by a migration (service role bypasses RLS). One FK, `severance_scenario_phases.profile_id`, is `ON DELETE RESTRICT` rather than cascading — the only restrictive foreign key in the schema.

**When adding a new table**, copy the four-policy pattern above verbatim, add `user_id uuid not null references auth.users(id) on delete cascade default auth.uid()`, and add both to the standard index set (`<table>_user_id_idx` at minimum). Don't invent a different authorization pattern without a specific reason — consistency here is what makes the RLS boundary easy to audit.

## Secrets & environment

Only two env vars exist, both `NEXT_PUBLIC_*` (intentionally exposed to the browser — the anon key is safe to expose by Supabase's design, since RLS is the real boundary):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

No service-role key is used anywhere in this codebase. If one is ever introduced (e.g. for an admin task), it must never be `NEXT_PUBLIC_*` and must never be used in code reachable from a client-side bundle.

## What this app is not

Not a legal- or tax-advice product. Several business-logic modules (`lib/unemployment/sperrzeit.ts` in particular) compute heuristic risk flags rather than legal determinations, and say so explicitly in both code comments and their UI surfacing (e.g. "confirm with the Agentur für Arbeit before relying on this timeline"). This isn't a security concern in the conventional sense, but it's a correctness/liability boundary worth keeping in mind when touching that code — see `docs/business-logic.md`.
