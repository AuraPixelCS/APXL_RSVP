/**
 * Tests for free-seating passes (Phase 4).
 *
 *   node --experimental-strip-types scripts/test-free-seating.ts
 *
 * A free-seating pass has no seat, so every place that derived meaning from
 * `seatNumber` — the label, the QR payload, the validity window — needs a
 * defined answer for null. And a three-day event must not reject its own
 * pass on day two.
 */

import { formatAssignment, FREE_SEATING_LABEL } from "../lib/seatLabel.ts";
import { generateQRPayload, signQRPayload, verifyQRToken, isQRValid, isQRValidForEvent } from "../lib/qr.ts";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

console.log("\nformatAssignment — free seating");
const freeEvent = { assignmentMode: "free" as const, totalSeats: 300 };
check("null seat → Free seating", formatAssignment(null, freeEvent)?.long === "Free seating");
check("stray seat number still reads Free seating", formatAssignment(42, freeEvent)?.long === "Free seating");
check("short code is 'Free'", formatAssignment(null, freeEvent)?.short === "Free");
check("row label is Seating", formatAssignment(null, freeEvent)?.rows[0].label === "Seating");
check("never VIP", formatAssignment(999, freeEvent)?.isVip === false);
check("exported constant is what's returned", formatAssignment(null, freeEvent) === FREE_SEATING_LABEL);

console.log("\nformatAssignment — seated modes unchanged");
check("seat mode, null seat → null", formatAssignment(null, { assignmentMode: "seat", totalSeats: 100 }) === null);
check("seat mode, seat 3 → Row A · Seat 3", formatAssignment(3, { assignmentMode: "seat", totalSeats: 100 })?.long === "Row A · Seat 3");
check("table mode, seat 11 → Table 2", formatAssignment(11, { assignmentMode: "table", totalSeats: 100 })?.long === "Table 2");

console.log("\nQR payload with no seat");
const payload = generateQRPayload("rsvp-1", "evt-1", null, "2026-11-19", "09:00", "Asia/Kuala_Lumpur");
check("seatNumber is null", payload.seatNumber === null);
check("eventTime resolved (19 Nov 09:00 MYT = 01:00Z)", payload.eventTime === Date.UTC(2026, 10, 19, 1, 0, 0) / 1000);
const token = signQRPayload(payload);
const back = verifyQRToken(token);
check("signs and verifies", !!back && back.rsvpId === "rsvp-1" && back.seatNumber === null);
check("tampered token rejected", verifyQRToken(token.slice(0, -2) + "zz") === null);
check("no guestIndex stamped for the primary guest", !("guestIndex" in payload));

console.log("\nValidity window — single day (legacy rule)");
const oneDay = { date: "2026-11-18", time: "19:00", timezone: "Asia/Kuala_Lumpur" };
const galaPayload = generateQRPayload("r", "e", 5, oneDay.date, oneDay.time, oneDay.timezone);
const galaStart = galaPayload.eventTime * 1000;
check("valid 1h before start", isQRValidForEvent(galaPayload, oneDay, galaStart - 3600_000));
check("valid 3h after start", isQRValidForEvent(galaPayload, oneDay, galaStart + 3 * 3600_000));
check("invalid 5h after start", !isQRValidForEvent(galaPayload, oneDay, galaStart + 5 * 3600_000));
check("invalid a day early", !isQRValidForEvent(galaPayload, oneDay, galaStart - 24 * 3600_000));

console.log("\nValidity window — three-day summit");
const summit = {
  date: "2026-11-19", endDate: "2026-11-21", time: "09:00", timezone: "Asia/Kuala_Lumpur",
  days: [
    { date: "2026-11-19", startTime: "09:00" },
    { date: "2026-11-20", startTime: "09:00" },
    { date: "2026-11-21", startTime: "09:00" },
  ],
};
const day1 = Date.UTC(2026, 10, 19, 1, 0, 0); // 19 Nov 09:00 MYT
check("day 1 morning valid", isQRValidForEvent(payload, summit, day1 + 3600_000));
check("day 2 afternoon valid (legacy rule would say no)", isQRValidForEvent(payload, summit, day1 + 24 * 3600_000 + 5 * 3600_000) && !isQRValid(payload));
check("day 3 evening valid", isQRValidForEvent(payload, summit, day1 + 2 * 24 * 3600_000 + 9 * 3600_000));
check("11h before day 1 valid (12h grace)", isQRValidForEvent(payload, summit, day1 - 11 * 3600_000));
check("13h before day 1 invalid", !isQRValidForEvent(payload, summit, day1 - 13 * 3600_000));
// 21 Nov 23:59:59 MYT = 21 Nov 15:59:59Z; +4h grace → 22 Nov 19:59:59Z
const lastDayEnd = Date.UTC(2026, 10, 21, 15, 59, 59, 999);
check("3h after last day ends valid", isQRValidForEvent(payload, summit, lastDayEnd + 3 * 3600_000));
check("5h after last day ends invalid", !isQRValidForEvent(payload, summit, lastDayEnd + 5 * 3600_000));
check("unparseable event → never locks out", isQRValidForEvent(payload, { ...summit, time: "nope" }, 0));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
