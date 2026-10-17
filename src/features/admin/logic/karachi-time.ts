/** Pakistan has no daylight saving, so Karachi is always UTC+5. */
const KARACHI_OFFSET_MINUTES = 5 * 60;
const MINUTE = 60_000;

/** "2026-10-17T18:30" typed by an admin (Karachi time) -> ISO instant. Null when not a valid time. */
export function karachiLocalToIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d, h, mi) - KARACHI_OFFSET_MINUTES * MINUTE;
  const date = new Date(utc);
  // Reject things like February 31st, which Date silently rolls into March.
  const back = isoToKarachiLocal(date.toISOString());
  return back === local ? date.toISOString() : null;
}

/** ISO instant -> "2026-10-17T18:30" in Karachi time, for a datetime-local input. */
export function isoToKarachiLocal(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + KARACHI_OFFSET_MINUTES * MINUTE);
  return shifted.toISOString().slice(0, 16);
}

const BUSINESS_DAY_STARTS_AT_HOUR = 12;

/**
 * The restaurant works 6 PM to 2 AM, so "today" runs noon to noon: an order at 1 AM still belongs
 * to the evening that began the day before. Returns the instant the current business day began.
 */
export function businessDayStart(now: Date): Date {
  const local = new Date(now.getTime() + KARACHI_OFFSET_MINUTES * MINUTE);
  const startLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    BUSINESS_DAY_STARTS_AT_HOUR,
  );
  const dayMs = 24 * 60 * MINUTE;
  const adjusted = local.getTime() >= startLocal ? startLocal : startLocal - dayMs;
  return new Date(adjusted - KARACHI_OFFSET_MINUTES * MINUTE);
}

/** Start of a calendar day (00:00) in Karachi, from "YYYY-MM-DD". Null when invalid. */
export function karachiDayStart(day: string): Date | null {
  const iso = karachiLocalToIso(`${day}T00:00`);
  return iso ? new Date(iso) : null;
}
