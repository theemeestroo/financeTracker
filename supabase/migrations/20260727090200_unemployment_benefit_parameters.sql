-- unemployment_benefit_parameters — global versioned reference data, not
-- user-owned. Mirrors tax_year_parameters exactly: read-only to
-- authenticated users, only managed via migrations/dashboard. The app reads
-- from lib/unemployment/parameters.ts directly (kept pure, no DB round-trip
-- per calculation) — this table is the durable, queryable mirror.
-- ─────────────────────────────────────────────────────────────────────────
create table unemployment_benefit_parameters (
  year int primary key,
  params jsonb not null
);

alter table unemployment_benefit_parameters enable row level security;

create policy "unemployment_benefit_parameters_select_authenticated" on unemployment_benefit_parameters
  for select using (auth.role() = 'authenticated');

-- Seeded 2026-07-27 — see lib/unemployment/parameters.ts header for the same
-- caveats. The Leistungssatz rates and statutory duration table are stable,
-- published law (§147 SGB III) and safe to rely on. The two monetary fields
-- (voluntaryGkvMinimumMonthlyBase, pkvSubsidyCeilingMonthly) are best-effort
-- approximations — VERIFY against current Bundesagentur/GKV-Spitzenverband
-- publications before relying on them for real decisions.
insert into unemployment_benefit_parameters (year, params) values
(2025, '{
  "year": 2025,
  "leistungssatzStandard": 0.60,
  "leistungssatzWithChildren": 0.67,
  "standardizedNetWageDeductionRate": 0.21,
  "durationTable": [
    { "insuredMonths": 12, "durationMonths": 6 },
    { "insuredMonths": 16, "durationMonths": 8 },
    { "insuredMonths": 20, "durationMonths": 10 },
    { "insuredMonths": 24, "durationMonths": 12 }
  ],
  "ageDurationBonuses": [
    { "minAge": 50, "minInsuredMonths": 30, "durationMonths": 15 },
    { "minAge": 55, "minInsuredMonths": 36, "durationMonths": 18 },
    { "minAge": 58, "minInsuredMonths": 48, "durationMonths": 24 }
  ],
  "voluntaryGkvMinimumMonthlyBase": 1178.33,
  "pkvSubsidyCeilingMonthly": 442.29
}'::jsonb),
(2026, '{
  "year": 2026,
  "leistungssatzStandard": 0.60,
  "leistungssatzWithChildren": 0.67,
  "standardizedNetWageDeductionRate": 0.21,
  "durationTable": [
    { "insuredMonths": 12, "durationMonths": 6 },
    { "insuredMonths": 16, "durationMonths": 8 },
    { "insuredMonths": 20, "durationMonths": 10 },
    { "insuredMonths": 24, "durationMonths": 12 }
  ],
  "ageDurationBonuses": [
    { "minAge": 50, "minInsuredMonths": 30, "durationMonths": 15 },
    { "minAge": 55, "minInsuredMonths": 36, "durationMonths": 18 },
    { "minAge": 58, "minInsuredMonths": 48, "durationMonths": 24 }
  ],
  "voluntaryGkvMinimumMonthlyBase": 1216.42,
  "pkvSubsidyCeilingMonthly": 456.32
}'::jsonb)
on conflict (year) do update set params = excluded.params;
