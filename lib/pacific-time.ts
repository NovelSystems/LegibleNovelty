// Pacific-time day boundaries for the publish quota's daily reset (Seed Editor
// Task 5).
//
// The daily quota resets at midnight PACIFIC, using the America/Los_Angeles
// timezone IDENTIFIER — never a fixed UTC offset. Pacific Time shifts between
// PST (UTC-8) and PDT (UTC-7) across the year, so a hardcoded offset would put
// the reset an hour off for roughly half the year and break outright across a
// DST transition. This is a single, fixed reference point for every account —
// not localized to each architect's own timezone.

const TZ = "America/Los_Angeles";

// The offset (localWallClock − UTC), in milliseconds, that America/Los_Angeles
// is at for a given instant. +/- derived by formatting the instant AS Pacific
// wall-clock time and re-reading it as if it were UTC.
function pacificOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  // `hour` can be "24" at midnight in some environments; normalize to 0.
  const hour = get("hour") % 24;
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asIfUtc - instant.getTime();
}

// The UTC instant of the most recent midnight Pacific — i.e. the start of the
// Pacific calendar day that contains `now`. Correct across DST transitions
// because the offset is resolved for the target day, not assumed constant.
export function startOfPacificDay(now: Date = new Date()): Date {
  // Pacific wall-clock calendar date of `now`.
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = dtf.format(now).split("-").map(Number);

  // Midnight of that Pacific date, first treated as if it were UTC...
  const midnightAsIfUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  // ...then corrected by the offset in effect AT that Pacific midnight. Using
  // the offset of the midnight instant itself (rather than of `now`) is what
  // keeps this correct on a DST-transition day, where the two can differ.
  const offsetAtMidnight = pacificOffsetMs(new Date(midnightAsIfUtc));
  return new Date(midnightAsIfUtc - offsetAtMidnight);
}
