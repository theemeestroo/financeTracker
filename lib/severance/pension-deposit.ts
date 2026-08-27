// Roughly the tax-free ceiling for a lump-sum bAV/Entgeltumwandlung deposit
// out of a severance payment (§3 Nr. 63 EStG-adjacent) — a coded fallback,
// not a precise statutory figure, since the real limit depends on years of
// service and existing contributions. Overridable globally (severance_global_settings)
// and per package (severance_scenario_packages.pension_deposit_override).
export const SEVERANCE_PENSION_DEPOSIT_DEFAULT = 49000;

/**
 * Resolves the effective amount of a severance diverted into a company
 * pension: a package's own override wins if set, else the household's
 * global default, else the coded fallback above — clamped to
 * [0, severanceGross] since a deposit can't be negative or exceed the
 * severance it's carved out of.
 */
export function resolvePensionDeposit(
  severanceGross: number,
  globalDefault: number | null,
  packageOverride: number | null
): number {
  const raw = packageOverride ?? globalDefault ?? SEVERANCE_PENSION_DEPOSIT_DEFAULT;
  return Math.min(Math.max(0, raw), severanceGross);
}
