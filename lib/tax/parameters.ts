// German tax parameters by year — the only place figures that change
// annually should live. Adding a new year is a data addition here, not a
// change to the calculation logic in wage-tax.ts / social-contributions.ts /
// soli.ts / church-tax.ts.
//
// Sourced 2026-07-25 from: gesetze-im-internet.de/estg/__32a.html (§32a EStG,
// 2026 formula), finanz-tools.de (2025 formula), lohn-info.de (2025/2026 SV
// contribution rates & Beitragsbemessungsgrenzen), tk.de (Soli Freigrenze +
// Milderungszone), finanztip.de (Arbeitnehmer-Pauschbetrag, Entlastungsbetrag).
// Mirrored into the `tax_year_parameters` table via migration for reference.

export interface TaxYearParameters {
  year: number;
  incomeTax: {
    basicAllowance: number; // Grundfreibetrag — zero tax at/below this
    zone1End: number; // end of first progressive zone
    zone2End: number; // end of second progressive zone (start of 42% flat zone)
    zone3End: number; // end of 42% zone (start of 45% Reichensteuer zone)
    zone1: { a: number; b: number }; // (a·y + b)·y, y = (zvE - basicAllowance) / 10000
    zone2: { a: number; b: number; base: number }; // (a·z + b)·z + base, z = (zvE - zone1End) / 10000
    zone3Rate: number;
    zone3Subtract: number;
    zone4Rate: number;
    zone4Subtract: number;
  };
  soli: {
    rate: number; // 5.5% of income tax once past the Milderungszone
    milderungszoneRate: number; // marginal rate just above the Freigrenze
    freigrenzeSingle: number; // annual income tax threshold, Einzelveranlagung
    freigrenzeMarried: number; // annual income tax threshold, Zusammenveranlagung (tax class III)
  };
  churchTax: {
    defaultRate: number; // most states
    lowRateStates: string[]; // Bavaria, Baden-Württemberg
    lowRate: number;
  };
  socialInsurance: {
    pensionRate: number; // Rentenversicherung, total (employee pays half)
    unemploymentRate: number; // Arbeitslosenversicherung, total
    healthBaseRate: number; // Krankenversicherung base rate, total
    healthAvgAddOnRate: number; // average Zusatzbeitrag, total (used unless a profile overrides it)
    careRate: number; // Pflegeversicherung, total
    careChildlessSurcharge: number; // Kinderlosenzuschlag — borne entirely by the employee
    pensionUnemploymentCeilingMonthly: number; // Beitragsbemessungsgrenze RV/ALV
    healthCareCeilingMonthly: number; // Beitragsbemessungsgrenze KV/PV
  };
  allowances: {
    employeeFlatRate: number; // Arbeitnehmer-Pauschbetrag
    specialExpensesFlatRate: number; // Sonderausgaben-Pauschbetrag
    singleParentRelief: number; // Entlastungsbetrag für Alleinerziehende (tax class II)
  };
  capitalGains: {
    flatRate: number; // Abgeltungsteuer, flat since 2009
    sparerPauschbetragSingle: number; // annual tax-free allowance on capital income
    sparerPauschbetragMarried: number; // both partners' allowance combined (Zusammenveranlagung)
  };
}

export const TAX_YEAR_PARAMETERS: Record<number, TaxYearParameters> = {
  2025: {
    year: 2025,
    incomeTax: {
      basicAllowance: 12096,
      zone1End: 17443,
      zone2End: 68480,
      zone3End: 277825,
      zone1: { a: 932.3, b: 1400 },
      zone2: { a: 176.64, b: 2397, base: 1015.13 },
      zone3Rate: 0.42,
      zone3Subtract: 10911.92,
      zone4Rate: 0.45,
      zone4Subtract: 19246.67,
    },
    soli: {
      rate: 0.055,
      milderungszoneRate: 0.119,
      freigrenzeSingle: 19950,
      freigrenzeMarried: 39900,
    },
    churchTax: {
      defaultRate: 0.09,
      lowRateStates: ["BY", "BW"],
      lowRate: 0.08,
    },
    socialInsurance: {
      pensionRate: 0.186,
      unemploymentRate: 0.026,
      healthBaseRate: 0.146,
      healthAvgAddOnRate: 0.025,
      careRate: 0.036,
      careChildlessSurcharge: 0.006,
      pensionUnemploymentCeilingMonthly: 8050,
      healthCareCeilingMonthly: 5512.5,
    },
    allowances: {
      employeeFlatRate: 1230,
      specialExpensesFlatRate: 36,
      singleParentRelief: 4260,
    },
    capitalGains: {
      flatRate: 0.25,
      sparerPauschbetragSingle: 1000,
      sparerPauschbetragMarried: 2000,
    },
  },
  2026: {
    year: 2026,
    incomeTax: {
      basicAllowance: 12348,
      zone1End: 17799,
      zone2End: 69878,
      zone3End: 277825,
      zone1: { a: 914.51, b: 1400 },
      zone2: { a: 173.1, b: 2397, base: 1034.87 },
      zone3Rate: 0.42,
      zone3Subtract: 11135.63,
      zone4Rate: 0.45,
      zone4Subtract: 19470.38,
    },
    soli: {
      rate: 0.055,
      milderungszoneRate: 0.119,
      freigrenzeSingle: 20350,
      freigrenzeMarried: 40700,
    },
    churchTax: {
      defaultRate: 0.09,
      lowRateStates: ["BY", "BW"],
      lowRate: 0.08,
    },
    socialInsurance: {
      pensionRate: 0.186,
      unemploymentRate: 0.026,
      healthBaseRate: 0.146,
      healthAvgAddOnRate: 0.029,
      careRate: 0.036,
      careChildlessSurcharge: 0.006,
      pensionUnemploymentCeilingMonthly: 8450,
      healthCareCeilingMonthly: 5812.5,
    },
    allowances: {
      employeeFlatRate: 1230,
      specialExpensesFlatRate: 36,
      singleParentRelief: 4260,
    },
    capitalGains: {
      flatRate: 0.25,
      sparerPauschbetragSingle: 1000,
      sparerPauschbetragMarried: 2000,
    },
  },
};

export function getTaxYearParameters(year: number): TaxYearParameters {
  const params = TAX_YEAR_PARAMETERS[year];
  if (!params) {
    throw new Error(
      `No tax parameters for ${year}. Add an entry to lib/tax/parameters.ts.`
    );
  }
  return params;
}

function latestAvailableTaxYear(): number {
  return Math.max(...Object.keys(TAX_YEAR_PARAMETERS).map(Number));
}

/** The current calendar year, clamped to the latest year we have parameters for. */
export function getCurrentTaxYear(): number {
  return Math.min(new Date().getFullYear(), latestAvailableTaxYear());
}

/**
 * Clamps an arbitrary calendar year down to the latest year we have real
 * parameters for — future-dated projections (a 10-year runway horizon
 * routinely reaches years with no published §32a formula yet) assume
 * today's rates hold rather than erroring, the same assumption
 * `project-runway.ts` already makes by taxing its entire horizon at one
 * fixed `scenario.taxYear`. Callers that need to *label* a result with the
 * real calendar year (e.g. a per-year tax summary) should keep that
 * separately — this only affects which year's formula computes the tax.
 */
export function clampToAvailableTaxYear(year: number): number {
  return Math.min(year, latestAvailableTaxYear());
}
