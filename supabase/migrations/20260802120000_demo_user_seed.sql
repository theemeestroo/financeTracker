-- Seeds a demo household for the no-login "View Demo" entry point
-- (lib/actions/auth.ts's loginAsDemo(), DEMO_USER_EMAIL/DEMO_USER_PASSWORD
-- env vars). This is a real Supabase Auth user (email/password provider),
-- inserted directly into auth.users/auth.identities the same way GoTrue
-- itself would on sign-up — so the demo login goes through the app's
-- ordinary supabase.auth.signInWithPassword() + RLS path with zero bypass
-- code and no service-role key anywhere in the app.
--
-- handle_new_user() (see docs/data-model.md) fires on the auth.users insert
-- below and creates the baseline living_profiles ('Current') and
-- household_members ('You') rows automatically; everything after that
-- reuses those rows' ids.
do $$
declare
  demo_email text := 'demo@runaway.app';
  demo_password text := 'lFdTBntWUfMYVPzeyZwTR25T';
  demo_user_id uuid := gen_random_uuid();
  demo_profile_id uuid;
  demo_member_id uuid;
  demo_tax_profile_id uuid;
  today date := current_date;
  severance_anchor date := current_date + interval '2 months';
  rec record;
  scenario_id uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current,
    reauthentication_token, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    demo_user_id, null, 'authenticated', 'authenticated', demo_email,
    extensions.crypt(demo_password, extensions.gen_salt('bf')),
    now(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Demo Household"}'::jsonb,
    now(), now()
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), demo_user_id, demo_user_id::text,
    jsonb_build_object('sub', demo_user_id::text, 'email', demo_email),
    'email', now(), now(), now()
  );

  select id into demo_profile_id from living_profiles where user_id = demo_user_id and is_baseline;
  select id into demo_member_id from household_members where user_id = demo_user_id;

  update living_profiles set current_liquid_savings = 18500 where id = demo_profile_id;
  update household_members set date_of_birth = (today - interval '34 years')::date where id = demo_member_id;

  insert into tax_profiles (user_id, household_member_id, tax_class, church_tax, has_children)
    values (demo_user_id, demo_member_id, 1, false, false)
    returning id into demo_tax_profile_id;

  -- Income: one salary — same comp shape (christmas/holiday-pay %, annual
  -- bonus) the four severance scenarios below reuse verbatim.
  insert into income (
    user_id, profile_id, name, gross_amount, type, frequency,
    start_date, tax_profile_id, christmas_bonus_pct, holiday_pay_pct,
    annual_bonus, bonus_distribution
  ) values (
    demo_user_id, demo_profile_id, 'Salary', 8500, 'salary', 'monthly',
    (today - interval '3 years')::date, demo_tax_profile_id, 100, 69,
    8000, 'one_time'
  );

  -- Regular outgoings, entertainment, and vacations (recurring annual
  -- budget line plus two concrete one-off trips).
  insert into commitments (user_id, profile_id, name, category, amount, frequency, essential, start_date) values
    (demo_user_id, demo_profile_id, 'Rent', 'housing', 1800, 'monthly', true, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Electricity & Gas', 'utilities', 180, 'monthly', true, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Internet & Phone', 'utilities', 70, 'monthly', true, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Contents Insurance', 'insurance', 90, 'monthly', true, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Car Loan', 'debt_loans', 350, 'monthly', true, (today - interval '2 years')::date),
    (demo_user_id, demo_profile_id, 'Public Transport Pass', 'transport', 90, 'monthly', true, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Groceries', 'groceries_living', 550, 'monthly', true, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Emergency Fund Savings', 'savings_investment', 500, 'monthly', true, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Streaming Subscriptions', 'subscriptions', 45, 'monthly', false, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Gym Membership', 'subscriptions', 60, 'monthly', false, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Dining Out & Entertainment', 'leisure_discretionary', 350, 'monthly', false, (today - interval '3 years')::date),
    (demo_user_id, demo_profile_id, 'Annual Vacation Budget', 'leisure_discretionary', 3600, 'annual', false, (today - interval '2 years')::date),
    (demo_user_id, demo_profile_id, 'Summer Trip — Lisbon', 'leisure_discretionary', 1600, 'one_off', false, (today + interval '3 months')::date),
    (demo_user_id, demo_profile_id, 'Ski Trip — Chamonix', 'leisure_discretionary', 2400, 'one_off', false, (today + interval '7 months')::date);

  -- Four severance scenarios: identical salary/bonus/christmas-pay/holiday-pay
  -- inputs, only severance_multiplier changes — a side-by-side "1x vs 2.5x"
  -- comparison (see /severance-scenarios/compare).
  for rec in
    select * from (values
      (1.0::numeric, '1.0x'),
      (1.5::numeric, '1.5x'),
      (2.0::numeric, '2.0x'),
      (2.5::numeric, '2.5x')
    ) as t(multiplier, label)
  loop
    insert into severance_scenarios (user_id, name, starting_balance, notes)
      values (
        demo_user_id,
        'Severance ' || rec.label,
        18500,
        'Demo scenario — ' || rec.label || ' severance multiplier, same salary/bonus assumptions as the other three.'
      )
      returning id into scenario_id;

    insert into severance_scenario_phases (user_id, scenario_id, profile_id, start_date, label)
      values (demo_user_id, scenario_id, demo_profile_id, today, null);

    insert into severance_scenario_packages (
      user_id, scenario_id, household_member_id, employer_name,
      years_of_service, employment_start_date, monthly_base_salary,
      holiday_pay_pct, annual_bonus, severance_multiplier,
      include_bonus_in_calc, include_garden_leave, notice_period_months,
      severance_start_date, christmas_bonus_pct, include_christmas_bonus_in_calc,
      claim_unemployment_benefit
    ) values (
      demo_user_id, scenario_id, demo_member_id, 'Demo Employer GmbH',
      6, (today - interval '6 years')::date, 8500,
      69, 8000, rec.multiplier,
      true, true, 6,
      severance_anchor, 100, true,
      true
    );

    insert into scenario_checklist_items (user_id, scenario_id, template_key, label, due_date, completed)
    select demo_user_id, scenario_id, g.template_key, g.label, g.due_date, false
    from (values
      ('meldepflicht', 'Register as job-seeking (arbeitsuchend) with the Agentur für Arbeit', (severance_anchor - interval '90 days')::date),
      ('health_insurance_decision', 'Decide on health insurance continuation (freiwillige GKV or PKV)', (severance_anchor - interval '14 days')::date),
      ('aufhebungsvertrag_bedenkzeit', 'Use the Aufhebungsvertrag consideration period before signing', (severance_anchor - interval '7 days')::date),
      ('alg1_application', 'Register as unemployed (arbeitslos) and apply for Arbeitslosengeld I', severance_anchor),
      ('arbeitszeugnis', 'Request a reference letter (Arbeitszeugnis)', severance_anchor)
    ) as g(template_key, label, due_date);
  end loop;
end $$;
