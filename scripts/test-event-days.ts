/**
 * Tests for multi-day event resolution.
 *
 *   node --experimental-strip-types scripts/test-event-days.ts
 *
 * The load-bearing case is the FALLBACK: every event created before `days`
 * existed has no `days` array, and must still read as exactly one day — its
 * `date`. If that ever returns [] instead, a legacy pass stops resolving.
 */

import {
  eventDays,
  eventDateRange,
  isMultiDay,
  isEventDay,
  eventDay,
  dayIndex,
  formatEventDayRange,
} from "../lib/eventDays.ts";

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

// A pre-`days` event, exactly as it sits in Firestore today.
const legacy = { date: "2026-06-19", time: "17:00" };

// The three I Am AI Ready events.
const e1 = {
  date: "2026-11-17",
  time: "09:00",
  endDate: "2026-11-18",
  days: [
    { date: "2026-11-17", label: "Day 1", startTime: "09:00" },
    { date: "2026-11-18", label: "Day 2", startTime: "09:00" },
  ],
};
const e2 = {
  date: "2026-11-18",
  time: "19:00",
  endDate: "2026-11-18",
  days: [{ date: "2026-11-18", label: "Evening", startTime: "19:00" }],
};
const e3 = {
  date: "2026-11-19",
  time: "09:00",
  endDate: "2026-11-21",
  days: [
    { date: "2026-11-19", label: "Day 1", theme: "SME & Public", startTime: "09:00" },
    { date: "2026-11-20", label: "Day 2", theme: "Workforce & Public", startTime: "09:00" },
    { date: "2026-11-21", label: "Day 3", theme: "Uni & Youth / Public", startTime: "09:00" },
  ],
};

console.log("\n── legacy event with no `days` ─────────────────────────────");
check("resolves to one day, not none", eventDays(legacy).length, 1);
check("that day is `date`", eventDays(legacy)[0].date, "2026-06-19");
check("carries `time` as the start", eventDays(legacy)[0].startTime, "17:00");
check("range is a single day", eventDateRange(legacy), { start: "2026-06-19", end: "2026-06-19" });
check("not multi-day", isMultiDay(legacy), false);
check("runs on its own date", isEventDay(legacy, "2026-06-19"), true);
check("does not run the day after", isEventDay(legacy, "2026-06-20"), false);
check("null event → empty, no throw", eventDays(null), []);

console.log("\n── E1 · BAFT Conference, 17–18 Nov ─────────────────────────");
check("two days", eventDays(e1).length, 2);
check("range spans both", eventDateRange(e1), { start: "2026-11-17", end: "2026-11-18" });
check("is multi-day", isMultiDay(e1), true);
check("runs on day 2", isEventDay(e1, "2026-11-18"), true);
check("does not run on the 19th", isEventDay(e1, "2026-11-19"), false);
check("day 2 is index 2", dayIndex(e1, "2026-11-18"), 2);
check("a date it doesn't run is index 0", dayIndex(e1, "2026-11-19"), 0);

console.log("\n── E2 · Award Gala Dinner, 18 Nov evening ──────────────────");
check("one day", eventDays(e2).length, 1);
check("not multi-day", isMultiDay(e2), false);
check("evening start survives", eventDay(e2, "2026-11-18")?.startTime, "19:00");

console.log("\n── E3 · Summit (NAIRW), 19–21 Nov ──────────────────────────");
check("three days", eventDays(e3).length, 3);
check("range spans all three", eventDateRange(e3), { start: "2026-11-19", end: "2026-11-21" });
check("20 Nov carries its theme", eventDay(e3, "2026-11-20")?.theme, "Workforce & Public");
check("21 Nov is index 3", dayIndex(e3, "2026-11-21"), 3);
// F19/F20/F21 differ only by which of these days they open — the reason
// entitlement is per day and not per event.
check("F20's day is not F19's day", isEventDay({ ...e3, days: [e3.days[1]] }, "2026-11-19"), false);

console.log("\n── out-of-order `days` ─────────────────────────────────────");
check(
  "sorted ascending regardless of stored order",
  eventDays({ ...e3, days: [e3.days[2], e3.days[0], e3.days[1]] }).map((d) => d.date),
  ["2026-11-19", "2026-11-20", "2026-11-21"]
);

console.log("\n── labels ──────────────────────────────────────────────────");
check("single day keeps the existing format", formatEventDayRange(legacy), "Fri, 19 Jun 2026");
check("E1 collapses the shared month", formatEventDayRange(e1), "Tue 17 – Wed 18 Nov 2026");
check("E2 reads as one day", formatEventDayRange(e2), "Wed, 18 Nov 2026");
check("E3 spans three", formatEventDayRange(e3), "Thu 19 – Sat 21 Nov 2026");
check("weekday can be dropped", formatEventDayRange(e3, { weekday: false }), "19 – 21 Nov 2026");
check(
  "a range crossing months keeps both",
  formatEventDayRange({ date: "2026-11-30", time: "09:00", endDate: "2026-12-01" }),
  "Mon 30 Nov – Tue 01 Dec 2026"
);
check("garbage date falls back to the raw string", formatEventDayRange({ date: "not-a-date", time: "09:00" }), "not-a-date");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
