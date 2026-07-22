/**
 * Event-timezone arithmetic.
 *
 * WHY THIS EXISTS
 * An event's `date` ("YYYY-MM-DD") and `time` ("HH:MM") describe a WALL CLOCK
 * reading at the venue — "7pm on the 14th, in the room". They carry no offset.
 * Turning that into a real instant requires knowing the venue's timezone.
 *
 * Before this module, two places guessed instead of knowing:
 *   - the RSVP deadline used `setHours()`, i.e. the *server's* local zone. On
 *     Vercel that is UTC, so a Malaysian 23:59 deadline actually expired at
 *     07:59 the NEXT morning — guests could RSVP ~8h past the cut-off.
 *   - the QR validity window used `setUTCHours()`, i.e. it read a local wall
 *     clock as if it were UTC — the same 8h skew in the other direction.
 *
 * Both now resolve through `zonedWallClockToUtc`, so the answer no longer
 * depends on which region the function happens to be running in.
 *
 * No dependency: the conversion uses Intl, which ships with Node.
 */

/** Used when an event has no explicit timezone (every pre-existing event). */
export const DEFAULT_EVENT_TIMEZONE = "Asia/Kuala_Lumpur";

/** Timezones offered in the event form. Malaysia first — that's the home market. */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (GMT+8)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
  { value: "Asia/Jakarta", label: "Jakarta (GMT+7)" },
  { value: "Asia/Bangkok", label: "Bangkok (GMT+7)" },
  { value: "Asia/Manila", label: "Manila (GMT+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" },
  { value: "Asia/Shanghai", label: "Shanghai (GMT+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)" },
  { value: "Asia/Seoul", label: "Seoul (GMT+9)" },
  { value: "Asia/Kolkata", label: "India (GMT+5:30)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10/+11)" },
  { value: "Europe/London", label: "London (GMT+0/+1)" },
  { value: "Europe/Paris", label: "Central Europe (GMT+1/+2)" },
  { value: "America/New_York", label: "New York (GMT−5/−4)" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT−8/−7)" },
  { value: "UTC", label: "UTC" },
];

/** True when the runtime recognises the IANA zone id. */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone to interpret an event's wall-clock date/time in. */
export function eventTimezone(event: { timezone?: string } | null | undefined): string {
  const tz = event?.timezone?.trim();
  return tz && isValidTimezone(tz) ? tz : DEFAULT_EVENT_TIMEZONE;
}

/**
 * Offset (ms) that `timeZone` is ahead of UTC at the given instant.
 * Derived by asking Intl to render the instant in that zone and reading the
 * result back as if it were UTC — the difference IS the offset. This is the
 * standard dependency-free approach and it accounts for DST automatically.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  // Intl reports no finer than seconds, so measure from a second-aligned
  // instant. Comparing a truncated reading against an unaligned input would
  // fold the dropped milliseconds into the "offset" — that made an
  // end-of-day 23:59:59.999 deadline land at 00:00:00.997 the NEXT day.
  // Real zone offsets are whole minutes, so alignment costs nothing.
  const base = Math.floor(utcMs / 1000) * 1000;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(base));

  const at: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") at[p.type] = Number(p.value);
  }
  // Some ICU builds render midnight as hour "24" under hour12:false.
  const hour = at.hour === 24 ? 0 : at.hour;

  const asIfUtc = Date.UTC(at.year, at.month - 1, at.day, hour, at.minute, at.second);
  return asIfUtc - base;
}

/**
 * Convert a wall-clock reading in `timeZone` to a real UTC instant (epoch ms).
 *
 * The offset depends on the instant we're solving for, so this guesses once
 * (treating the wall clock as UTC), measures the offset there, corrects, then
 * re-measures. The second pass matters only near a DST transition, where the
 * first guess can land on the wrong side of the jump.
 */
function zonedPartsToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number, ms: number,
  timeZone: string,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstPass = wall - zoneOffsetMs(wall, timeZone);
  const refined = wall - zoneOffsetMs(firstPass, timeZone);
  return refined;
}

/** Parse "YYYY-MM-DD" without letting the host timezone reinterpret it. */
function parseDateParts(dateISO: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateISO ?? "").trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Parse "HH:MM" (or "HH:MM:SS"). Returns null when unparseable. */
function parseTimeParts(timeHHMM: string): { h: number; min: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(timeHHMM ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

/**
 * The UTC instant (epoch ms) of `dateISO` at `timeHHMM`, read in `timeZone`.
 * Returns null when either input is unparseable — callers decide the fallback
 * rather than silently getting an Invalid Date.
 */
export function zonedWallClockToUtc(
  dateISO: string,
  timeHHMM: string,
  timeZone: string,
): number | null {
  const d = parseDateParts(dateISO);
  const t = parseTimeParts(timeHHMM);
  if (!d || !t) return null;
  return zonedPartsToUtc(d.y, d.m, d.d, t.h, t.min, 0, 0, timeZone);
}

/**
 * The last millisecond of `dateISO` in `timeZone` — i.e. 23:59:59.999 local.
 * This is what an "RSVP by <date>" deadline means to the person who set it.
 */
export function endOfDayInZone(dateISO: string, timeZone: string): number | null {
  const d = parseDateParts(dateISO);
  if (!d) return null;
  return zonedPartsToUtc(d.y, d.m, d.d, 23, 59, 59, 999, timeZone);
}

/**
 * Has the RSVP deadline passed? `false` when there is no deadline or it can't
 * be parsed — never lock guests out because of a malformed field.
 */
export function isRsvpDeadlinePassed(
  event: { rsvpDeadline?: string; timezone?: string } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!event?.rsvpDeadline) return false;
  const cutoff = endOfDayInZone(event.rsvpDeadline, eventTimezone(event));
  if (cutoff == null) return false;
  return now > cutoff;
}

/** Short zone label for UI ("GMT+8"), derived from the actual current offset. */
export function timezoneShortLabel(timeZone: string, at: number = Date.now()): string {
  if (!isValidTimezone(timeZone)) return "";
  const offsetMin = Math.round(zoneOffsetMs(at, timeZone) / 60000);
  const sign = offsetMin < 0 ? "−" : "+";
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}
