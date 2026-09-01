/**
 * Tests for capacity accounting, waitlist ordering, and plus-one seating.
 *
 *   node --experimental-strip-types scripts/test-capacity.ts
 */

import {
  seatsHeldBy, committedSeats, capacityOf, checkCapacity,
  decideIntake, waitlistOrder, planPromotions,
} from "../lib/capacity.ts";
import { planAutoAllocation, adjacentFreeSeat } from "../lib/seatAllocation.ts";

let passed = 0, failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`); }
}

console.log("\nseatsHeldBy");
check("plain attendee holds 1", seatsHeldBy({ attending: true, status: "pending" }), 1);
check("+1 holds 2", seatsHeldBy({ attending: true, plusOne: true, status: "pending" }), 2);
check("decline holds 0", seatsHeldBy({ attending: false, plusOne: true }), 0);
check("not_attending holds 0", seatsHeldBy({ status: "not_attending", attending: true }), 0);
// A waitlisted guest holding a seat would make the room look full and block
// the very promotion the waitlist exists to enable.
check("waitlisted holds 0", seatsHeldBy({ status: "waitlisted", attending: true, plusOne: true }), 0);
check("allocated holds its seat", seatsHeldBy({ status: "allocated", attending: true }), 1);

console.log("\ncommittedSeats");
check("counts +1s", committedSeats([
  { attending: true, status: "pending" },
  { attending: true, plusOne: true, status: "allocated" },
  { attending: true, status: "waitlisted" },
  { attending: false },
]), 3);
check("empty is zero", committedSeats([]), 0);

console.log("\ncapacityOf");
check("explicit limit wins", capacityOf({ capacityLimit: 50 }, 200), 50);
check("falls back to seats", capacityOf({}, 200), 200);
check("zero limit means uncapped→seats", capacityOf({ capacityLimit: 0 }, 200), 200);
check("no seats and no limit → 0 (uncapped)", capacityOf({}, 0), 0);

console.log("\ncheckCapacity / decideIntake");
const nearlyFull = [{ attending: true, status: "pending" }, { attending: true, status: "pending" }];
check("fits when room remains", checkCapacity(nearlyFull, { attending: true }, 3).fits, true);
check("does not fit when full", checkCapacity(nearlyFull, { attending: true }, 2).fits, false);
// The +1 case: one seat left, party of two. Splitting them is worse than a
// clear "you're on the list".
const oneLeft = checkCapacity(nearlyFull, { attending: true, plusOne: true }, 3);
check("party of 2 does not fit in 1 seat", oneLeft.fits, false);
check("remaining reported honestly", oneLeft.remaining, 1);
check("uncapped always fits", checkCapacity(nearlyFull, { attending: true, plusOne: true }, 0).fits, true);
check("full + waitlist enabled → waitlist", decideIntake(oneLeft, true), "waitlist");
check("full + waitlist disabled → reject", decideIntake(oneLeft, false), "reject");
check("full + waitlist unset → reject", decideIntake(oneLeft, undefined), "reject");
check("fits → accept regardless", decideIntake(checkCapacity([], { attending: true }, 10), false), "accept");

console.log("\nwaitlistOrder");
check("oldest first", waitlistOrder([
  { id: "b", status: "waitlisted", waitlistedAt: "2026-02-01T00:00:00Z" },
  { id: "a", status: "waitlisted", waitlistedAt: "2026-01-01T00:00:00Z" },
  { id: "x", status: "pending", waitlistedAt: "2020-01-01T00:00:00Z" },
].map((r) => r as never)).map((r: { id: string }) => r.id), ["a", "b"]);
check("falls back to submittedAt", waitlistOrder([
  { id: "b", status: "waitlisted", submittedAt: "2026-02-01T00:00:00Z" },
  { id: "a", status: "waitlisted", submittedAt: "2026-01-01T00:00:00Z" },
].map((r) => r as never)).map((r: { id: string }) => r.id), ["a", "b"]);

console.log("\nplanPromotions");
check("promotes what fits", planPromotions(
  [{ id: "a" }, { id: "b" }, { id: "c" }], 2,
).promote.map((g) => g.id), ["a", "b"]);
// Skipping a couple to fit a later solo guest silently reorders the queue —
// the one promise a waitlist makes.
check("stops at a party too big rather than skipping it", planPromotions(
  [{ id: "couple", plusOne: true }, { id: "solo" }], 1,
).promote.map((g) => g.id), []);
check("seats used counts +1", planPromotions([{ id: "couple", plusOne: true }], 2).seatsUsed, 2);
check("no free seats promotes nobody", planPromotions([{ id: "a" }], 0).promote, []);

console.log("\nadjacentFreeSeat");
check("prefers the seat after", adjacentFreeSeat(new Set([5]), 5, 10), 6);
check("falls back to the seat before", adjacentFreeSeat(new Set([5, 6]), 5, 10), 4);
check("null when boxed in", adjacentFreeSeat(new Set([4, 5, 6]), 5, 10), null);
check("respects the room's last seat", adjacentFreeSeat(new Set([10]), 10, 10), 9);

console.log("\nplanAutoAllocation with +1s");
check("+1 seated adjacent", planAutoAllocation(
  [{ id: "a", plusOne: true }], new Set(), 10,
).assignments, [{ id: "a", seatNumber: 1, plusOneSeatNumber: 2 }]);
check("mixed party sizes stay contiguous", planAutoAllocation(
  [{ id: "a", plusOne: true }, { id: "b" }, { id: "c", plusOne: true }], new Set(), 10,
).assignments, [
  { id: "a", seatNumber: 1, plusOneSeatNumber: 2 },
  { id: "b", seatNumber: 3, plusOneSeatNumber: null },
  { id: "c", seatNumber: 4, plusOneSeatNumber: 5 },
]);
// The pair must be indivisible: seating the host into the last chair and
// stranding the companion is the bug this replaces.
check("pair is all-or-nothing when only one seat is left", planAutoAllocation(
  [{ id: "a", plusOne: true }], new Set([1, 2]), 3,
), { assignments: [], seatsExhausted: true });
check("host's seat is released when the pair can't be placed", (() => {
  const r = planAutoAllocation([{ id: "a", plusOne: true }, { id: "b" }], new Set([1, 2]), 3);
  // 'a' could not be seated, so seat 3 must still be free — not silently held.
  return r.assignments.length === 0 && r.seatsExhausted === true;
})(), true);
check("falls back to a non-adjacent seat rather than stranding the +1", planAutoAllocation(
  [{ id: "a", plusOne: true }], new Set([2, 3, 4]), 10,
).assignments, [{ id: "a", seatNumber: 1, plusOneSeatNumber: 5 }]);
check("string entries still work (back-compat)", planAutoAllocation(
  ["a", "b"], new Set(), 10,
).assignments, [
  { id: "a", seatNumber: 1, plusOneSeatNumber: null },
  { id: "b", seatNumber: 2, plusOneSeatNumber: null },
]);

check("cancelled RSVP holds no seat", seatsHeldBy({ status: "cancelled", attending: true, plusOne: true }), 0);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
