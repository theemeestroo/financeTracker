-- Adds the inputs needed to model Arbeitslosengeld I (ALG I) income and
-- post-severance health-insurance costs in the runway projection:
-- date_of_birth (age-graduated ALG I duration), a PKV premium (private
-- health insurance costing through the employed → gap → ALG I transition),
-- and per-package ALG I claim/defer/eligibility-override/re-employment
-- inputs. See DESIGN-financial-runway-app-v2.md §2.1-2.2 for the modeling
-- this supports.

alter table household_members add column date_of_birth date;

alter table tax_profiles add column private_health_insurance_monthly_premium numeric(10,2);

alter table severance_scenario_packages add column christmas_bonus_pct numeric(5,2);
alter table severance_scenario_packages add column include_christmas_bonus_in_calc boolean not null default false;
alter table severance_scenario_packages add column claim_unemployment_benefit boolean not null default true;
alter table severance_scenario_packages add column unemployment_benefit_defer_months numeric(4,1) not null default 0;
alter table severance_scenario_packages add column months_insured_override numeric(4,1);
alter table severance_scenario_packages add column new_job_start_date date;
