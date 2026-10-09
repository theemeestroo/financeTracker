-- Global (all scenarios) switch: an income row flagged here is left out of
-- every severance scenario's runway projection and Fünftelregelung base.
-- Has no effect on the dashboard or the income pages themselves.
alter table income add column exclude_from_severance boolean not null default false;
