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
 * Find a free seat directly beside `seat`, preferring the one after it.
 *
 * Used to sit a +1 next to their host. Returns null when neither neighbour is
 * free — the caller then falls back to any free seat, because a companion
 * seated across the room still beats a companion with no seat at all, which is
 * what they got before.
 */
export function adjacentFreeSeat(
  taken: Set<number>,
  seat: number,
  limit: number,
): number | null {
  const after = seat + 1;
  if (after <= limit && !taken.has(after)) return after;
  const before = seat - 1;
  if (before >= 1 && !taken.has(before)) return before;
  return null;
}

/** A guest to seat. `plusOne` means they need two adjacent seats, not one. */
export interface AllocationRequest {
  id: string;
  plusOne?: boolean;
}

export interface SeatAssignment {
  id: string;
  seatNumber: number;
  /** Seat for the companion — null when this guest has no +1. */
  plusOneSeatNumber: number | null;
}

/**
 * Plan an automatic allocation: lowest free seat per guest, in order, stopping
 * when the standard seats run out.
 *
 * A guest with a +1 is seated as a PAIR — both seats or neither. Placing the
 * host and then discovering there is no room for the companion would strand
 * them exactly as before, so the pair is treated as one indivisible unit.
 *
 * Returns whether capacity was the limiting factor, so the caller can tell
 * "seated everyone" from "ran out of room" — the old code conflated the two and
 * returned 200 either way.
 */
export function planAutoAllocation(
  pending: (string | AllocationRequest)[],
  alreadyTaken: Set<number>,
  standardSeats: number,
  maxAssignments: number = Number.POSITIVE_INFINITY,
): { assignments: SeatAssignment[]; seatsExhausted: boolean } {
  const taken = new Set(alreadyTaken);
  const assignments: SeatAssignment[] = [];

  for (const entry of pending) {
    if (assignments.length >= maxAssignments) break;

    const req: AllocationRequest = typeof entry === "string" ? { id: entry } : entry;

    const seat = lowestFreeSeat(taken, standardSeats);
    if (seat == null) return { assignments, seatsExhausted: true };

    if (!req.plusOne) {
      taken.add(seat);
      assignments.push({ id: req.id, seatNumber: seat, plusOneSeatNumber: null });
      continue;
    }

    // Reserve the host's seat only long enough to look for a neighbour; if the
    // companion can't be placed, release it so the pair stays intact.
    taken.add(seat);
    const companion =
      adjacentFreeSeat(taken, seat, standardSeats) ?? lowestFreeSeat(taken, standardSeats);

    if (companion == null) {
      taken.delete(seat);
      return { assignments, seatsExhausted: true };
    }

    taken.add(companion);
    assignments.push({ id: req.id, seatNumber: seat, plusOneSeatNumber: companion });
  }

  return { assignments, seatsExhausted: false };
}
