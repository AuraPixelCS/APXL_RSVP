/**
 * Pure seat-picking logic for the allocation API.
 *
 * Kept dependency-free (no imports, no path aliases) so it can be exercised
 * directly by scripts/test-seat-allocation.ts without a bundler — the previous
 * allocation bug was arithmetic, and arithmetic should be testable in isolation.
 *
 * THE BUG THIS REPLACES
 * The old rule was `nextSeat = maxSeat + 1`, with maxSeat the highest seat
 * number in use anywhere in the event. Two consequences:
 *
 *   - VIP seats are numbered ABOVE totalSeats on purpose. Seating one VIP guest
 *     pushed maxSeat beyond capacity, so every later auto-allocation failed the
 *     `> totalSeats` check. Bulk allocate then seated nobody and reported
 *     success.
 *   - Freed seats were never reused. Cancel a guest and their seat stayed empty
 *     forever, because the counter only ever moved up.
 */

export interface SeatHolder {
  id: string;
  seatNumber?: number | null;
}

/** Seat numbers currently held by any guest in `rows`. */
export function takenSeats(rows: SeatHolder[]): Set<number> {
  const taken = new Set<number>();
  for (const r of rows) {
    const n = Number(r.seatNumber);
    if (r.seatNumber != null && Number.isFinite(n)) taken.add(n);
  }
  return taken;
}

/**
 * Lowest unused seat in 1..limit, or null when every seat is taken.
 *
 * `limit` is the STANDARD seat count, never the total: VIP seats sit above that
 * range and are reserved for deliberate placement, so an automatic pass must
 * never hand one out.
 */
export function lowestFreeSeat(taken: Set<number>, limit: number): number | null {
  for (let seat = 1; seat <= limit; seat++) {
    if (!taken.has(seat)) return seat;
  }
  return null;
}

/**
 * Plan an automatic allocation: pick the lowest free seat for each guest in
 * order, stopping when the standard seats run out.
 *
 * Returns the assignments plus whether capacity was the limiting factor, so the
 * caller can tell "seated everyone" apart from "ran out of room" — the old code
 * conflated the two and returned 200 either way.
 */
export function planAutoAllocation(
  pendingIds: string[],
  alreadyTaken: Set<number>,
  standardSeats: number,
  maxAssignments: number = Number.POSITIVE_INFINITY,
): { assignments: { id: string; seatNumber: number }[]; seatsExhausted: boolean } {
  const taken = new Set(alreadyTaken);
  const assignments: { id: string; seatNumber: number }[] = [];

  for (const id of pendingIds) {
    if (assignments.length >= maxAssignments) break;
    const seat = lowestFreeSeat(taken, standardSeats);
    if (seat == null) return { assignments, seatsExhausted: true };
    taken.add(seat);
    assignments.push({ id, seatNumber: seat });
  }

  return { assignments, seatsExhausted: false };
}
