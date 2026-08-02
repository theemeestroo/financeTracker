-- Employer-subsidized private health insurance (PKV): calculateSocialContributions
-- charges a privately-insured member nothing through payroll (see its own
-- comment — the subsidy is why), which means their net income already runs
-- higher than a GKV member's would for the same gross. Nothing elsewhere
-- previously charged the premium back as an outgoing during ordinary
-- employment/garden leave, so it was silently double-benefiting: extra net
-- pay with no corresponding cost anywhere in the household's monthly
-- picture. `lib/finance/health-insurance-outgoing.ts` now synthesizes a
-- "private health insurance" outgoing for the dashboard and severance-scenario
-- runway — this flag is the escape hatch for anyone already tracking the
-- premium some other way (e.g. a manually-added commitment), so it isn't
-- counted twice. Only meaningful when statutory_health_insurance = false.
alter table household_members
  add column count_private_health_insurance_as_outgoing boolean not null default true;
