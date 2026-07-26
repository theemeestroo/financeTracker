const WARTEZEIT_YEARS = 5;

/** Germany's 5-year statutory pension qualifying period (Wartezeit). */
export function pensionWartezeitDate(employmentStartDate: string | null): string | null {
  if (!employmentStartDate) return null;
  const [y, m, d] = employmentStartDate.split("-").map(Number);
  const date = new Date(Date.UTC(y + WARTEZEIT_YEARS, m - 1, d));
  return date.toISOString().slice(0, 10);
}

export type WartezeitTimelineRow = {
  date: string;
  monthsFromNow: number;
  eligible: boolean;
};

/**
 * A departure-timing table (mirrors the severance-scenarios.jsx "Departure
 * timing vs pension eligibility" view): a handful of candidate dates around
 * the eligibility threshold, each flagged eligible/not.
 */
export function pensionWartezeitTimeline(
  employmentStartDate: string | null,
  fromDate: string
): WartezeitTimelineRow[] {
  const eligibilityDate = pensionWartezeitDate(employmentStartDate);
  if (!eligibilityDate) return [];

  const [fy, fm] = fromDate.split("-").map(Number);
  const monthsToEligibility = (() => {
    const [ey, em] = eligibilityDate.split("-").map(Number);
    return (ey - fy) * 12 + (em - fm);
  })();

  const offsets = Array.from(
    new Set([0, Math.max(monthsToEligibility - 6, 0), monthsToEligibility, monthsToEligibility + 6].filter(
      (m) => m >= 0
    ))
  ).sort((a, b) => a - b);

  return offsets.map((offset) => {
    const date = new Date(Date.UTC(fy, fm - 1 + offset, 1)).toISOString().slice(0, 10);
    return {
      date,
      monthsFromNow: offset,
      eligible: date >= eligibilityDate,
    };
  });
}
