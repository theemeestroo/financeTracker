-- Corrects the ALG I Leistungsentgelt reference data mirror: the app no
-- longer approximates the Bundesagentur's deduction with a flat rate (was
-- "standardizedNetWageDeductionRate": 0.21) — lib/unemployment/leistungsentgelt.ts
-- now computes it via §153 SGB III's actual formula (20% Sozialversicherungspauschale
-- + a notional Steuerklasse-I Lohnsteuer/Soli, reusing the real wage-tax
-- engine). This just re-syncs the durable JSON mirror to match; the app
-- itself reads from lib/unemployment/parameters.ts directly, not this table.
update unemployment_benefit_parameters
set params = params - 'standardizedNetWageDeductionRate' || jsonb_build_object('socialInsurancePauschaleRate', 0.20)
where year in (2025, 2026);
