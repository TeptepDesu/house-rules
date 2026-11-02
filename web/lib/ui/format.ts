// Display formatting for dates (design.md § Writing). Money formatting lives in lib/money.ts.

/** "2026-10-01" → "Oct 1" (date-only values are calendar dates: no timezone shift). */
export function shortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 1 – Oct 3" */
export function stayRange(checkIn: string, checkOut: string): string {
  return `${shortDate(checkIn)} – ${shortDate(checkOut)}`;
}

/** "2026-11-01" → "Nov 1, 2026" */
export function longDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
