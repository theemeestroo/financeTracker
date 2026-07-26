import { getTaxYearParameters } from "./parameters";

/**
 * Solidaritätszuschlag: 5.5% of income tax, but with a Freigrenze (no soli
 * at all below it) and a Milderungszone just above it that caps the
 * effective rate on the excess at 11.9%, so there's no cliff at the
 * threshold. Most incomes below the high-earner range owe €0.
 */
export function calculateSoli(
  incomeTax: number,
  taxClass: 1 | 2 | 3 | 4 | 5 | 6,
  year: number
): number {
  const p = getTaxYearParameters(year).soli;
  const freigrenze = taxClass === 3 ? p.freigrenzeMarried : p.freigrenzeSingle;

  if (incomeTax <= freigrenze) return 0;

  const fullRate = incomeTax * p.rate;
  const milderungszone = (incomeTax - freigrenze) * p.milderungszoneRate;
  return Math.min(fullRate, milderungszone);
}
