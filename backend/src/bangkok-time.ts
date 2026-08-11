// All times are stored and interpreted in a single Asia/Bangkok timezone
// (DR-07, ASM-05) — never the host server's timezone.
const BANGKOK_OFFSET = "+07:00";

// Combines a "YYYY-MM-DD" date and "HH:MM" time (both Bangkok wall-clock)
// into the absolute instant they represent, for storing/comparing datetimes.
export function toBangkokInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${BANGKOK_OFFSET}`);
}

// Day-of-week (0 = Sunday ... 6 = Saturday, matching BusinessHours.dayOfWeek)
// is a pure calendar property of the date, independent of time and
// timezone — computed via UTC math so it never depends on the host's
// timezone, and deliberately does NOT go through toBangkokInstant (applying
// a +07:00 offset before reading getUTCDay() can shift the calendar day).
export function dayOfWeekForDate(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Rejects calendar-invalid dates (e.g. 2026-02-30) that Date.UTC would
// otherwise silently roll over into the following month.
export function isValidCalendarDate(date: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
