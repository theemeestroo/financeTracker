-- Lets a severance package skip the Sperrzeit risk heuristic entirely, for
-- when the user already knows (e.g. from their lawyer or the Agentur itself)
-- that the exit agreement's actual wording avoids a Sperrzeit — something
-- lib/unemployment/sperrzeit.ts's numbers-only heuristic can't detect. It's
-- the user's own assertion, not a determination by this app; see
-- assessSperrzeitRisk in lib/unemployment/sperrzeit.ts for how it's applied.

alter table severance_scenario_packages
  add column sperrzeit_safe_confirmed boolean not null default false;
