/**
 * Single-day passes (F12/F13/F14) — lib/eventDays.ts passDays/formatPassDays.
 *   node --experimental-strip-types scripts/test-pass-days.ts
 */
import { passDays, isDayRestricted, formatPassDays } from "../lib/eventDays.ts";
import { dateISOInZone } from "../lib/eventTime.ts";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

const summit = {
  date: "2026-11-12", endDate: "2026-11-14", time: "09:00",
  days: [
    { date: "2026-11-12", startTime: "09:00" },
    { date: "2026-11-13", startTime: "09:00" },
    { date: "2026-11-14", startTime: "09:00" },
  ],
};
const single = { date: "2026-11-18", time: "19:00" };

console.log("\npassDays");
check("null days → every event day", passDays(summit, null).length === 3);
check("empty days → every event day", passDays(summit, []).length === 3);
check("F12 → the one day", JSON.stringify(passDays(summit, ["2026-11-12"]).map((d) => d.date)) === '["2026-11-12"]');
check("two days kept in event order", JSON.stringify(passDays(summit, ["2026-11-14", "2026-11-13"]).map((d) => d.date)) === '["2026-11-13","2026-11-14"]');
check("days not on the event are ignored (no dead pass)", passDays(summit, ["2026-11-19", "2026-11-20"]).length === 3);
check("timestamps are trimmed to the date", passDays(summit, ["2026-11-13T00:00:00Z"]).map((d) => d.date)[0] === "2026-11-13");
check("legacy single-day event → its own day", passDays(single, null)[0].date === "2026-11-18");

console.log("\nisDayRestricted");
check("F3 (all days) not restricted", !isDayRestricted(summit, null));
check("explicit all three days not restricted", !isDayRestricted(summit, ["2026-11-12", "2026-11-13", "2026-11-14"]));
check("F13 restricted", isDayRestricted(summit, ["2026-11-13"]));
check("bogus days → not restricted", !isDayRestricted(summit, ["2026-11-20"]));

console.log("\nformatPassDays");
check("all days → range label", formatPassDays(summit, null) === "Thu 12 – Sat 14 Nov 2026", formatPassDays(summit, null));
check("F12 → single day", formatPassDays(summit, ["2026-11-12"]) === "Thu, 12 Nov 2026", formatPassDays(summit, ["2026-11-12"]));
check("two days → dotted list", formatPassDays(summit, ["2026-11-12", "2026-11-14"]) === "Thu, 12 Nov · Sat, 14 Nov 2026", formatPassDays(summit, ["2026-11-12", "2026-11-14"]));

console.log("\ndateISOInZone");
// 2026-11-12 23:30 UTC is already 13 Nov in Kuala Lumpur (UTC+8).
check("KL date rolls over ahead of UTC", dateISOInZone(Date.UTC(2026, 10, 12, 23, 30), "Asia/Kuala_Lumpur") === "2026-11-13");
check("UTC date unchanged", dateISOInZone(Date.UTC(2026, 10, 12, 23, 30), "UTC") === "2026-11-12");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
