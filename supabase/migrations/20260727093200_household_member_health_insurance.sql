-- Moves health-insurance type/values from tax_profiles (a separate, optional
-- record) onto household_members — a personal-circumstance fact independent
-- of Steuerklasse, always present regardless of whether a tax profile has
-- been set up. Mirrors the same reasoning as date_of_birth's placement.

alter table household_members add column statutory_health_insurance boolean not null default true;
alter table household_members add column health_insurance_addon_rate numeric(4,3);
alter table household_members add column private_health_insurance_monthly_premium numeric(10,2);

-- Carry forward every existing tax profile's values before the source
-- columns disappear — no existing member loses data. Members with no tax
-- profile keep the new columns' defaults (statutory = true), the same
-- fallback calculateSocialContributions already applied.
update household_members hm
set
  statutory_health_insurance = tp.statutory_health_insurance,
  health_insurance_addon_rate = tp.health_insurance_addon_rate,
  private_health_insurance_monthly_premium = tp.private_health_insurance_monthly_premium
from tax_profiles tp
where tp.household_member_id = hm.id;

alter table tax_profiles drop column statutory_health_insurance;
alter table tax_profiles drop column health_insurance_addon_rate;
alter table tax_profiles drop column private_health_insurance_monthly_premium;
