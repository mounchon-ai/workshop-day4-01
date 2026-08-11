// All times are displayed in a single Asia/Bangkok timezone (DR-07, ASM-05,
// IR-05) — never the browser's local timezone.

export function todayInBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

// Converts a stored UTC instant back to the "YYYY-MM-DD" Bangkok wall-clock
// date it represents, for pre-filling a date input.
export function toBangkokDateString(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso));
}

// Converts a stored UTC instant back to the "HH:MM" Bangkok wall-clock time
// it represents, for pre-filling a time input.
export function toBangkokTimeString(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

// Human-readable Thai date+time for read-only display (IR-05: 24-hour,
// Asia/Bangkok).
export function formatBangkok(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}

// Compact form of the above for table rows, where "long" wraps awkwardly.
export function formatBangkokCompact(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
