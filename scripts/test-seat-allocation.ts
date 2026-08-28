/**
 * Tests for the seat-allocation arithmetic.
 *
 *   node --experimental-strip-types scripts/test-seat-allocation.ts
 *
 * The allocation bug that shipped was pure arithmetic — the highest-seat
 * counter collided with VIP numbering — so this pins the behaviour that
 * replaced it, including a direct reproduction of the old lockout.
 */

import { takenSeats, lowestFreeSeat, planAutoAllocation } from "../lib/seatAllocation.ts";

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

// The rule the old code used, kept here so the regression is demonstrated
// against the real thing rather than described in a comment.
function legacyNextSeat(rows: { seatNumber?: number | null }[]): number {
  return rows.reduce((max, r) => (r.seatNumber != null && r.seatNumber > max ? r.seatNumber : max), 0) + 1;
}

console.log("\ntakenSeats");
check("collects assigned seats", [...takenSeats([
  { id: "a", seatNumber: 3 }, { id: "b", seatNumber: null }, { id: "c", seatNumber: 1 },
])].sort((x, y) => x - y), [1, 3]);
check("ignores undefined/null", [...takenSeats([{ id: "a" }, { id: "b", seatNumber: null }])], []);
check("seat 0 is not treated as absent", [...takenSeats([{ id: "a", seatNumber: 0 }])], [0]);

console.log("\nlowestFreeSeat");
check("empty room → seat 1", lowestFreeSeat(new Set(), 10), 1);
check("fills the gap left by a cancellation", lowestFreeSeat(new Set([1, 2, 4, 5]), 10), 3);
check("full room → null", lowestFreeSeat(new Set([1, 2, 3]), 3), null);
check("VIP seat above capacity does not block", lowestFreeSeat(new Set([201]), 200), 1);
check("zero capacity → null", lowestFreeSeat(new Set(), 0), null);

console.log("\nplanAutoAllocation");
// plusOneSeatNumber is null for every guest without a companion; the +1 cases
// live in scripts/test-capacity.ts.
check("seats everyone in order", planAutoAllocation(["a", "b", "c"], new Set(), 10), {
  assignments: [
    { id: "a", seatNumber: 1, plusOneSeatNumber: null },
    { id: "b", seatNumber: 2, plusOneSeatNumber: null },
    { id: "c", seatNumber: 3, plusOneSeatNumber: null },
  ],
  seatsExhausted: false,
});
check("reuses freed seats before extending", planAutoAllocation(["x"], new Set([1, 3]), 10), {
  assignments: [{ id: "x", seatNumber: 2, plusOneSeatNumber: null }],
  seatsExhausted: false,
});
check("stops and flags when capacity runs out", planAutoAllocation(["a", "b", "c"], new Set([1]), 2), {
  assignments: [{ id: "a", seatNumber: 2, plusOneSeatNumber: null }],
  seatsExhausted: true,
});
check("respects the per-transaction write cap", planAutoAllocation(["a", "b", "c"], new Set(), 10, 2), {
  assignments: [
    { id: "a", seatNumber: 1, plusOneSeatNumber: null },
    { id: "b", seatNumber: 2, plusOneSeatNumber: null },
  ],
  seatsExhausted: false,
});
check("no duplicate seats within one plan",
  (() => {
    const { assignments } = planAutoAllocation(["a", "b", "c", "d"], new Set([2]), 10);
    return new Set(assignments.map((x) => x.seatNumber)).size === assignments.length;
  })(), true);

// ── The regression: 200-seat event, one guest seated at VIP seat 201 ─────────
console.log("\nREGRESSION — VIP seat causes false-full lockout");
{
  const standardSeats = 200;
  const rows = [{ id: "vip", seatNumber: 201 }]; // VIP table numbered above capacity
  const pending = ["g1", "g2", "g3"];

  const legacy = legacyNextSeat(rows);
  check("old rule proposes seat 202 (past the 200-seat room)", legacy, 202);
  check("old rule's guard `202 > 200` rejects → zero allocated", legacy > standardSeats, true);

  const { assignments, seatsExhausted } = planAutoAllocation(pending, takenSeats(rows), standardSeats);
  check("new rule seats all three from seat 1", assignments, [
    { id: "g1", seatNumber: 1, plusOneSeatNumber: null },
    { id: "g2", seatNumber: 2, plusOneSeatNumber: null },
    { id: "g3", seatNumber: 3, plusOneSeatNumber: null },
  ]);
  check("new rule does not report the room as full", seatsExhausted, false);
  check("new rule never hands out the VIP seat",
    assignments.every((a) => a.seatNumber <= standardSeats), true);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
