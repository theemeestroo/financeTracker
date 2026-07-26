-- How a salary row's Christmas/holiday/annual bonus shows up: as a single
-- one-time annual payment (gross + net computed separately from the
-- recurring monthly figure — the default, since that's how these are
-- actually paid out), or smoothed evenly into the recurring monthly
-- gross/net instead. Purely a display/aggregation choice — the total
-- annual compensation is identical either way. See
-- lib/finance/income-gross.ts.
alter table income
  add column bonus_distribution text not null default 'one_time'
    check (bonus_distribution in ('one_time', 'spread'));
