-- Two follow-up tweaks to the demo household seeded in
-- 20260802120000_demo_user_seed.sql:
--
-- 1) Bumps years_of_service to 12 across all four severance scenario
--    packages (was 6), moving employment_start_date back to match so tenure
--    stays internally consistent (severance sizing uses years_of_service
--    directly; employment_start_date separately drives the pension
--    Wartezeit view — both should agree on how long this person's been
--    employed).
-- 2) Adds a "Berlin Apartment" property and attaches the household's
--    housing-related commitments (Rent, Electricity & Gas, Internet &
--    Phone, Contents Insurance) to it, so the demo also shows off property
--    grouping, not just bare commitments.
do $$
declare
  demo_user_id uuid;
  demo_profile_id uuid;
  demo_property_id uuid;
begin
  select id into demo_user_id from auth.users where email = 'demo@runaway.app';
  select id into demo_profile_id from living_profiles where user_id = demo_user_id and is_baseline;

  update severance_scenario_packages
    set years_of_service = 12,
        employment_start_date = (current_date - interval '12 years')::date
    where user_id = demo_user_id;

  insert into properties (user_id, profile_id, name, address, notes)
    values (
      demo_user_id, demo_profile_id, 'Berlin Apartment',
      'Musterstraße 12, 10115 Berlin, Germany',
      'Rented apartment — housing, utilities, and contents insurance grouped here.'
    )
    returning id into demo_property_id;

  update commitments
    set property_id = demo_property_id
    where user_id = demo_user_id
      and name in ('Rent', 'Electricity & Gas', 'Internet & Phone', 'Contents Insurance');
end $$;
