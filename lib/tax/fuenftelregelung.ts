import { calculateIncomeTaxForClass } from "./wage-tax";
import { calculateSoli } from "./soli";
import { calculateChurchTax } from "./church-tax";
import type { TaxProfile } from "@/lib/types";

export type SeveranceTaxResult = {
  taxOnSeverance: number; // income tax attributable to the severance (Fünftelregelung)
  soliOnSeverance: number;
  churchTaxOnSeverance: number;
  totalTaxOnSeverance: number;
  netSeverance: number;
  marginalTax: number; // income tax if taxed as ordinary income in one go, for comparison
  taxSaving: number; // marginalTax - taxOnSeverance (income tax only, pre soli/church)
};

/**
 * Fünftelregelung (§34 EStG): severance is taxed as if one-fifth of it were
 * added to regular income, with the resulting tax difference multiplied by
 * five. This keeps a lump sum from being pushed entirely into the top
 * bracket. `regularTaxableIncome` is the household member's zvE from their
 * *regular* income for the year, excluding the severance itself.
 */
export function calculateSeveranceNet(
  grossSeverance: number,
  regularTaxableIncome: number,
  profile: TaxProfile,
  year: number
): SeveranceTaxResult {
  const baseTax = calculateIncomeTaxForClass(regularTaxableIncome, profile.tax_class, year);
  const withFifth = calculateIncomeTaxForClass(
    regularTaxableIncome + grossSeverance / 5,
    profile.tax_class,
    year
  );
  const taxOnSeverance = Math.max(0, 5 * (withFifth - baseTax));

  const soliOnSeverance = calculateSoli(baseTax + taxOnSeverance, profile.tax_class, year) -
    calculateSoli(baseTax, profile.tax_class, year);
  const churchTaxOnSeverance =
    calculateChurchTax(baseTax + taxOnSeverance, profile, year) -
    calculateChurchTax(baseTax, profile, year);

  const totalTaxOnSeverance = taxOnSeverance + soliOnSeverance + churchTaxOnSeverance;
  const netSeverance = grossSeverance - totalTaxOnSeverance;

  const withFull = calculateIncomeTaxForClass(
    regularTaxableIncome + grossSeverance,
    profile.tax_class,
    year
  );
  const marginalTax = Math.max(0, withFull - baseTax);

  return {
    taxOnSeverance,
    soliOnSeverance,
    churchTaxOnSeverance,
    totalTaxOnSeverance,
    netSeverance,
    marginalTax,
    taxSaving: marginalTax - taxOnSeverance,
  };
}
