import { getTaxYearParameters } from "./parameters";

/**
 * §32a EStG — the base income tax formula on a given taxable income (zvE),
 * with no tax-class adjustment. Classes I/II/IV use this directly (class II
 * having already had the Entlastungsbetrag deducted from zvE upstream);
 * class III uses the splitting variant in `calculateIncomeTaxForClass`.
 */
export function calculateBaseIncomeTax(taxableIncome: number, year: number): number {
  const p = getTaxYearParameters(year).incomeTax;
  const x = Math.floor(Math.max(0, taxableIncome));

  if (x <= p.basicAllowance) return 0;

  if (x <= p.zone1End) {
    const y = (x - p.basicAllowance) / 10000;
    return Math.floor((p.zone1.a * y + p.zone1.b) * y);
  }

  if (x <= p.zone2End) {
    const z = (x - p.zone1End) / 10000;
    return Math.floor((p.zone2.a * z + p.zone2.b) * z + p.zone2.base);
  }

  if (x <= p.zone3End) {
    return Math.floor(p.zone3Rate * x - p.zone3Subtract);
  }

  return Math.floor(p.zone4Rate * x - p.zone4Subtract);
}

/**
 * Applies the tax-class-specific procedure on top of the base §32a formula.
 *
 * Classes I, II, IV: standard tariff (any class-specific allowance is
 * deducted from taxableIncome before calling this — see net-income.ts).
 * Class III: Splittingverfahren — tax on half the income, doubled.
 * Classes V, VI: approximated as the standard tariff on taxableIncome with
 * no further adjustment here. This is a known simplification — the official
 * withholding procedure for V/VI is materially more involved (V's amount
 * depends on the paired III return; VI drops the Grundfreibetrag entirely).
 * Documented in DESIGN-financial-runway-app.md §12 as an accepted v1 gap.
 */
export function calculateIncomeTaxForClass(
  taxableIncome: number,
  taxClass: 1 | 2 | 3 | 4 | 5 | 6,
  year: number
): number {
  if (taxClass === 3) {
    return 2 * calculateBaseIncomeTax(taxableIncome / 2, year);
  }
  return calculateBaseIncomeTax(taxableIncome, year);
}
