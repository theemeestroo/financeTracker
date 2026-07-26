-- A company car's monthly private-use cost, deducted straight from net pay
-- (payroll deduction) rather than affecting taxable gross — distinct from
-- `annual_car_allowance`, which is cash received, not a cost. Salary-only,
-- same pattern as the other components in lib/finance/income-gross.ts.
alter table income
  add column monthly_company_car_cost numeric(10,2) not null default 0
    check (monthly_company_car_cost >= 0);
