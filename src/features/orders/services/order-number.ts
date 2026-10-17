/** The calendar year in the restaurant's timezone, so a late-night order on 31 Dec counts as that year. */
export function orderYear(date: Date, timeZone = 'Asia/Karachi'): number {
  const year = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(date);
  return Number(year);
}

/** BBQ-2026-0042. The sequence is padded to four digits but never truncated past 9999. */
export function formatOrderNumber(year: number, sequence: number): string {
  return `BBQ-${String(year)}-${String(sequence).padStart(4, '0')}`;
}
