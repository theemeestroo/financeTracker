-- One tax profile per household member (Phase 3 UI treats this as 1:1 —
-- create/edit, never a picker of multiple profiles per person).
alter table tax_profiles
  add constraint tax_profiles_household_member_id_unique unique (household_member_id);
