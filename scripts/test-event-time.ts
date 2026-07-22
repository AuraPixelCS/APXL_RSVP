/**
 * Tests for event-timezone arithmetic.
 *
 *   node --experimental-strip-types scripts/test-event-time.ts
 *
 * Run under at least two server timezones — the whole point of this module is
 * that the answer must NOT depend on where the code runs:
 *
 *   TZ=UTC              node --experimental-strip-types scripts/test-event-time.ts
 *   TZ=America/Chicago  node --experimental-strip-types scripts/test-event-time.ts
 */

import {
  zonedWallClockToUtc,
  endOfDayInZone,
  isRsvpDeadlinePassed,
  eventTimezone,
  isValidTimezone,
  timezoneShortLabel,
  DEFAULT_EVENT_TIMEZONE,
} from "../lib/eventTime.ts";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`);
  }
}

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

console.log(`\nserver TZ = ${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}`);

console.log("\nzonedWallClockToUtc");
check("KL 19:00 → 11:00Z", iso(zonedWallClockToUtc("2026-08-14", "19:00", "Asia/Kuala_Lumpur")), "2026-08-14T11:00:00.000Z");
check("KL midnight → previous 16:00Z", iso(zonedWallClockToUtc("2026-08-14", "00:00", "Asia/Kuala_Lumpur")), "2026-08-13T16:00:00.000Z");
check("Kolkata half-hour offset", iso(zonedWallClockToUtc("2026-08-14", "19:00", "Asia/Kolkata")), "2026-08-14T13:30:00.000Z");
check("NY summer (EDT −4)", iso(zonedWallClockToUtc("2026-07-04", "19:00", "America/New_York")), "2026-07-04T23:00:00.000Z");
check("NY winter (EST −5)", iso(zonedWallClockToUtc("2026-01-15", "19:00", "America/New_York")), "2026-01-16T00:00:00.000Z");
check("London summer (BST +1)", iso(zonedWallClockToUtc("2026-07-04", "19:00", "Europe/London")), "2026-07-04T18:00:00.000Z");
check("UTC is identity", iso(zonedWallClockToUtc("2026-08-14", "19:00", "UTC")), "2026-08-14T19:00:00.000Z");
check("DST spring-forward: 03:00 is already EDT", iso(zonedWallClockToUtc("2026-03-08", "03:00", "America/New_York")), "2026-03-08T07:00:00.000Z");
check("garbage date → null", zonedWallClockToUtc("not-a-date", "19:00", "UTC"), null);
check("garbage time → null", zonedWallClockToUtc("2026-08-14", "99:99", "UTC"), null);

console.log("\nendOfDayInZone");
// Millisecond precision matters: an earlier version folded the .999 into the
// offset and landed on 00:00:00.997 the FOLLOWING day.
check("KL end of day keeps .999", iso(endOfDayInZone("2026-08-14", "Asia/Kuala_Lumpur")), "2026-08-14T15:59:59.999Z");
check("Kolkata end of day", iso(endOfDayInZone("2026-08-14", "Asia/Kolkata")), "2026-08-14T18:29:59.999Z");
check("UTC end of day", iso(endOfDayInZone("2026-08-14", "UTC")), "2026-08-14T23:59:59.999Z");
check("Sydney end of day (AEDT)", iso(endOfDayInZone("2026-01-15", "Australia/Sydney")), "2026-01-15T12:59:59.999Z");

console.log("\nisRsvpDeadlinePassed");
const klDeadline = { rsvpDeadline: "2026-08-14", timezone: "Asia/Kuala_Lumpur" };
check("one second before cut-off → open", isRsvpDeadlinePassed(klDeadline, Date.parse("2026-08-14T15:59:59.000Z")), false);
check("one second after cut-off → closed", isRsvpDeadlinePassed(klDeadline, Date.parse("2026-08-14T16:00:01.000Z")), true);
// The live bug: at 23:00Z the KL deadline had passed hours earlier (07:00 the
// next morning local), yet the old server-local check still accepted RSVPs.
check("23:00Z on deadline day → closed (old code accepted)", isRsvpDeadlinePassed(klDeadline, Date.parse("2026-08-14T23:00:00.000Z")), true);
check("no deadline → never closed", isRsvpDeadlinePassed({ timezone: "UTC" }, Date.parse("2030-01-01T00:00:00Z")), false);
check("malformed deadline → never closed", isRsvpDeadlinePassed({ rsvpDeadline: "soon" }, Date.now()), false);
check("null event → never closed", isRsvpDeadlinePassed(null, Date.now()), false);

console.log("\neventTimezone / helpers");
check("unset → default", eventTimezone({}), DEFAULT_EVENT_TIMEZONE);
check("undefined event → default", eventTimezone(undefined), DEFAULT_EVENT_TIMEZONE);
check("bogus zone → default", eventTimezone({ timezone: "Mars/Olympus" }), DEFAULT_EVENT_TIMEZONE);
check("valid zone honoured", eventTimezone({ timezone: "Europe/Paris" }), "Europe/Paris");
check("isValidTimezone rejects junk", isValidTimezone("Nope/Nope"), false);
check("short label for KL", timezoneShortLabel("Asia/Kuala_Lumpur", Date.parse("2026-08-14T00:00:00Z")), "GMT+8");
check("short label handles half-hours", timezoneShortLabel("Asia/Kolkata", Date.parse("2026-08-14T00:00:00Z")), "GMT+5:30");
check("short label handles negatives", timezoneShortLabel("America/New_York", Date.parse("2026-01-15T00:00:00Z")), "GMT−5");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
