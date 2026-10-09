-- Per-person share of a one-off event's amount: [{household_member_id, percentage}].
-- NULL means "split evenly across the household" (the previous behaviour).
alter table severance_scenario_events add column member_splits jsonb;
