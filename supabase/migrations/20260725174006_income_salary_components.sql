-- Optional salary-only compensation components on `income`, so a "salary"
-- row can capture more than a single flat gross figure: Christmas bonus
-- (Weihnachtsgeld) and holiday pay (Urlaubsgeld) as a percentage of one
-- month's base, plus a discretionary annual bonus, a car allowance, and a
-- pension contribution (treated as pre-tax deferred comp — folded out of
-- gross before wage tax, see lib/finance/income-gross.ts).
--
-- All default to 0 (not the form's 100%/79% UI defaults for a new salary
-- entry) so existing rows are computed identically to before this
-- migration — the 100/79 defaults only pre-fill the create form.
alter table income
  add column christmas_bonus_pct numeric(5,2) not null default 0
    check (christmas_bonus_pct >= 0 and christmas_bonus_pct <= 300),
  add column holiday_pay_pct numeric(5,2) not null default 0
    check (holiday_pay_pct >= 0 and holiday_pay_pct <= 300),
  add column annual_bonus numeric(10,2) not null default 0
    check (annual_bonus >= 0),
  add column annual_car_allowance numeric(10,2) not null default 0
    check (annual_car_allowance >= 0),
  add column monthly_pension_contribution numeric(10,2) not null default 0
    check (monthly_pension_contribution >= 0);
