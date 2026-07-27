// Arbeitslosengeld I (ALG I) parameters by year — mirrors lib/tax/parameters.ts:
// adding a new year is a data addition here, not a change to eligibility.ts /
// leistungsentgelt.ts / health-coverage.ts.
//
// The Leistungssatz rates (60%/67%), the statutory duration table, and the
// 20% Sozialversicherungspauschale (§153 Abs. 1 Nr. 1 SGB III) are stable,
// published law and safe to rely on. leistungsentgelt.ts computes the
// notional Lohnsteuer/Soli deduction with the real wage-tax engine (always
// at Steuerklasse I — see that file's header for why) rather than
// approximating it here, so the resulting benefit — including its maximum,
// at the Beitragsbemessungsgrenze — falls out of the actual formula instead
// of a guessed flat rate. The two monetary fields
// (voluntaryGkvMinimumMonthlyBase, pkvSubsidyCeilingMonthly) are still
// best-effort approximations — VERIFY against current Bundesagentur/
// GKV-Spitzenverband publications before relying on them for real
// decisions. Mirrored into the `unemployment_benefit_parameters` table via
// migration for reference.

export interface UnemploymentBenefitYearParameters {
  year: number;
  leistungssatzStandard: number; // 60% of the Leistungsentgelt
  leistungssatzWithChildren: number; // 67% — at least one child (has_children)
  socialInsurancePauschaleRate: number; // §153 Abs. 1 Nr. 1 SGB III — fixed 20%
  durationTable: { insuredMonths: number; durationMonths: number }[];
  ageDurationBonuses: { minAge: number; minInsuredMonths: number; durationMonths: number }[];
  voluntaryGkvMinimumMonthlyBase: number; // freiwillige GKV Mindestbemessungsgrundlage
  pkvSubsidyCeilingMonthly: number; // Bundesagentur PKV-Zuschuss ceiling
}

export const UNEMPLOYMENT_BENEFIT_PARAMETERS: Record<number, UnemploymentBenefitYearParameters> = {
  2025: {
    year: 2025,
    leistungssatzStandard: 0.6,
    leistungssatzWithChildren: 0.67,
    socialInsurancePauschaleRate: 0.2,
    durationTable: [
      { insuredMonths: 12, durationMonths: 6 },
      { insuredMonths: 16, durationMonths: 8 },
      { insuredMonths: 20, durationMonths: 10 },
      { insuredMonths: 24, durationMonths: 12 },
    ],
    ageDurationBonuses: [
      { minAge: 50, minInsuredMonths: 30, durationMonths: 15 },
      { minAge: 55, minInsuredMonths: 36, durationMonths: 18 },
      { minAge: 58, minInsuredMonths: 48, durationMonths: 24 },
    ],
    voluntaryGkvMinimumMonthlyBase: 1178.33,
    pkvSubsidyCeilingMonthly: 442.29,
  },
  2026: {
    year: 2026,
    leistungssatzStandard: 0.6,
    leistungssatzWithChildren: 0.67,
    socialInsurancePauschaleRate: 0.2,
    durationTable: [
      { insuredMonths: 12, durationMonths: 6 },
      { insuredMonths: 16, durationMonths: 8 },
      { insuredMonths: 20, durationMonths: 10 },
      { insuredMonths: 24, durationMonths: 12 },
    ],
    ageDurationBonuses: [
      { minAge: 50, minInsuredMonths: 30, durationMonths: 15 },
      { minAge: 55, minInsuredMonths: 36, durationMonths: 18 },
      { minAge: 58, minInsuredMonths: 48, durationMonths: 24 },
    ],
    voluntaryGkvMinimumMonthlyBase: 1216.42,
    pkvSubsidyCeilingMonthly: 456.32,
  },
};

export function getUnemploymentBenefitYearParameters(year: number): UnemploymentBenefitYearParameters {
  const params = UNEMPLOYMENT_BENEFIT_PARAMETERS[year];
  if (!params) {
    throw new Error(
      `No unemployment benefit parameters for ${year}. Add an entry to lib/unemployment/parameters.ts.`
    );
  }
  return params;
}
