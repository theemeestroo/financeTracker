export { getTaxYearParameters, getCurrentTaxYear, clampToAvailableTaxYear, TAX_YEAR_PARAMETERS } from "./parameters";
export { calculateBaseIncomeTax, calculateIncomeTaxForClass } from "./wage-tax";
export { calculateSocialContributions, type SocialContributions } from "./social-contributions";
export { calculateSoli } from "./soli";
export { calculateChurchTax } from "./church-tax";
export { taxableWageIncome } from "./taxable-income";
export { calculateNetIncome, type NetIncomeBreakdown } from "./net-income";
export { calculateSeveranceNet, type SeveranceTaxResult } from "./fuenftelregelung";
export { calculateCapitalGainsTax, type CapitalGainsTaxResult } from "./capital-gains-tax";
export {
  taxBracketBreakdown,
  annualPersonTaxSummary,
  type TaxBracketStep,
  type AnnualIncomeSource,
  type AnnualSeveranceTax,
  type AnnualPersonTaxSummary,
} from "./annual-tax-summary";
