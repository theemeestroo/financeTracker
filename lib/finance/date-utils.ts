export function isActiveOn(
  startDate: string | null,
  endDate: string | null,
  onDate: string
): boolean {
  if (startDate && startDate > onDate) return false;
  if (endDate && endDate < onDate) return false;
  return true;
}

/** Normalizes any ISO date string to the first of its month. */
export function firstOfMonth(dateISO: string): string {
  return `${dateISO.slice(0, 7)}-01`;
}

/** Adds whole months to a (year-month-based) ISO date, returning the first of the resulting month. */
export function addMonths(dateISO: string, months: number): string {
  const [y, m] = dateISO.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}-01`;
}
