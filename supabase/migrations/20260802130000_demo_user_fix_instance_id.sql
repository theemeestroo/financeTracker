-- Fixes the demo user seeded in 20260802120000_demo_user_seed.sql: it was
-- inserted with instance_id = null, but every real auth.users row on this
-- project has instance_id = '00000000-0000-0000-0000-000000000000', and
-- GoTrue's own user lookup filters on it — a null instance_id row is
-- invisible to password sign-in ("invalid_credentials" even with the right
-- password). Align it with the rest of the table.
update auth.users
  set instance_id = '00000000-0000-0000-0000-000000000000'
  where email = 'demo@runaway.app';
