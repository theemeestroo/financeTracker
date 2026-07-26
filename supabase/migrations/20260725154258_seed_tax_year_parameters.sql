-- Seeds tax_year_parameters with the same figures as lib/tax/parameters.ts.
-- The app reads parameters from that TypeScript module directly (kept pure,
-- no DB round-trip per calculation) — this table is the durable, queryable
-- mirror of the same data for reference/audit, and the natural place a
-- future admin UI would write to instead of a code change.
-- Sourced 2026-07-25 — see lib/tax/parameters.ts header for citations.

insert into tax_year_parameters (year, params) values
(2025, '{
  "incomeTax": {
    "basicAllowance": 12096,
    "zone1End": 17443,
    "zone2End": 68480,
    "zone3End": 277825,
    "zone1": { "a": 932.30, "b": 1400 },
    "zone2": { "a": 176.64, "b": 2397, "base": 1015.13 },
    "zone3Rate": 0.42,
    "zone3Subtract": 10911.92,
    "zone4Rate": 0.45,
    "zone4Subtract": 19246.67
  },
  "soli": {
    "rate": 0.055,
    "milderungszoneRate": 0.119,
    "freigrenzeSingle": 19950,
    "freigrenzeMarried": 39900
  },
  "churchTax": {
    "defaultRate": 0.09,
    "lowRateStates": ["BY", "BW"],
    "lowRate": 0.08
  },
  "socialInsurance": {
    "pensionRate": 0.186,
    "unemploymentRate": 0.026,
    "healthBaseRate": 0.146,
    "healthAvgAddOnRate": 0.025,
    "careRate": 0.036,
    "careChildlessSurcharge": 0.006,
    "pensionUnemploymentCeilingMonthly": 8050,
    "healthCareCeilingMonthly": 5512.50
  },
  "allowances": {
    "employeeFlatRate": 1230,
    "specialExpensesFlatRate": 36,
    "singleParentRelief": 4260
  }
}'::jsonb),
(2026, '{
  "incomeTax": {
    "basicAllowance": 12348,
    "zone1End": 17799,
    "zone2End": 69878,
    "zone3End": 277825,
    "zone1": { "a": 914.51, "b": 1400 },
    "zone2": { "a": 173.10, "b": 2397, "base": 1034.87 },
    "zone3Rate": 0.42,
    "zone3Subtract": 11135.63,
    "zone4Rate": 0.45,
    "zone4Subtract": 19470.38
  },
  "soli": {
    "rate": 0.055,
    "milderungszoneRate": 0.119,
    "freigrenzeSingle": 20350,
    "freigrenzeMarried": 40700
  },
  "churchTax": {
    "defaultRate": 0.09,
    "lowRateStates": ["BY", "BW"],
    "lowRate": 0.08
  },
  "socialInsurance": {
    "pensionRate": 0.186,
    "unemploymentRate": 0.026,
    "healthBaseRate": 0.146,
    "healthAvgAddOnRate": 0.029,
    "careRate": 0.036,
    "careChildlessSurcharge": 0.006,
    "pensionUnemploymentCeilingMonthly": 8450,
    "healthCareCeilingMonthly": 5812.50
  },
  "allowances": {
    "employeeFlatRate": 1230,
    "specialExpensesFlatRate": 36,
    "singleParentRelief": 4260
  }
}'::jsonb)
on conflict (year) do update set params = excluded.params;
