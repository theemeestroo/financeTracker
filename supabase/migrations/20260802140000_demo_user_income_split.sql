-- The demo salary row (20260802120000_demo_user_seed.sql) was left with
-- zero income_splits rows, which combinedIncomeBreakdown treats as
-- unattributed household income (net: null) — the dashboard then excludes
-- it from Monthly Surplus/Income-by-Type entirely, even though a tax
-- profile already exists for the demo household member. Attribute it
-- 100% so the demo shows a real net income figure.
insert into income_splits (user_id, income_id, household_member_id, percentage)
select i.user_id, i.id, hm.id, 100
from income i
join auth.users u on u.id = i.user_id
join household_members hm on hm.user_id = i.user_id
where u.email = 'demo@runaway.app';
