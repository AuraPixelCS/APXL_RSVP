/**
 * Capacity accounting and waitlist ordering.
 *
 * Dependency-free on purpose (no imports, no path aliases) so the arithmetic is
 * directly testable — see scripts/test-capacity.ts.
 *
 * WHY THIS EXISTS
 * Intake accepted RSVPs without ever looking at the seat count. A 200-seat room
 * could take 300 confirmations, and nobody found out until allocation time —
 * by which point 300 people had been told they were coming. The fix is to
 * decide at the door: either turn the guest away or put them on a waitlist,
 * while they are still on the form.
 *
 * A "+1" is a real body in a real chair, so it counts as a second seat. That is
 * the whole reason the old count was wrong even when someone did check it.
 */

/** Minimal shape needed to count what an RSVP consumes. */
export interface SeatConsumer {
  status?: string;
  attending?: boolean;
  plusOne?: boolean;
}

/**
 * Seats an RSVP occupies: 0 if they aren't coming, otherwise 1 (+1 for a
 * companion). Waitlisted guests hold nothing — that's what being waitlisted is.
 */
export function seatsHeldBy(rsvp: SeatConsumer): number {
  if (rsvp.attending === false) return 0;
  if (
    rsvp.status === "not_attending" ||
    rsvp.status === "waitlisted" ||
    rsvp.status === "cancelled" ||
    // Awaiting payment (corporate billing / HRD claim): captured but not
    // committed — the seat is theirs only once payment is confirmed.
    rsvp.status === "unpaid"
  ) return 0;
  return rsvp.plusOne === true ? 2 : 1;
}

/** Total seats committed across all RSVPs. */
export function committedSeats(rsvps: SeatConsumer[]): number {
  return rsvps.reduce((sum, r) => sum + seatsHeldBy(r), 0);
}

/**
 * The event's capacity in seats.
 *
 * `capacityLimit` wins when set — an organiser may deliberately sell fewer
 * seats than the room holds. Otherwise fall back to the physical seat count.
 * A non-positive value means "uncapped", which preserves the behaviour of every
 * event created before this field existed.
 */
export function capacityOf(
  event: { capacityLimit?: number } | null | undefined,
  totalSeatCount: number,
): number {
  const limit = Number(event?.capacityLimit);
  if (Number.isFinite(limit) && limit > 0) return Math.floor(limit);
  return Number.isFinite(totalSeatCount) && totalSeatCount > 0 ? Math.floor(totalSeatCount) : 0;
}

export interface CapacityCheck {
  /** Seats already committed. */
  used: number;
  /** Total seats available (0 = uncapped). */
  capacity: number;
  /** Seats left, or Infinity when uncapped. */
  remaining: number;
  /** Seats this submission wants. */
  requested: number;
  /** Can it be seated outright? */
  fits: boolean;
  /** Uncapped events never reject and never waitlist. */
  uncapped: boolean;
}

/** Would one more submission fit? */
export function checkCapacity(
  existing: SeatConsumer[],
  incoming: SeatConsumer,
  capacity: number,
): CapacityCheck {
  const used = committedSeats(existing);
  const requested = seatsHeldBy(incoming);
  const uncapped = capacity <= 0;
  const remaining = uncapped ? Number.POSITIVE_INFINITY : Math.max(0, capacity - used);
  return {
    used,
    capacity,
    remaining,
    requested,
    fits: uncapped || used + requested <= capacity,
    uncapped,
  };
}

export type IntakeDecision = "accept" | "waitlist" | "reject";

/**
 * What to do with a submission that doesn't fit.
 *
 * A guest bringing a +1 who could fit alone is still waitlisted rather than
 * split up — seating half a party and turning the other half away at the door
 * is worse than an honest "you're on the list".
 */
export function decideIntake(
  check: CapacityCheck,
  waitlistEnabled: boolean | undefined,
): IntakeDecision {
  if (check.fits) return "accept";
  return waitlistEnabled ? "waitlist" : "reject";
}

/** Waitlist entries, oldest first — promotion order must be arrival order. */
export function waitlistOrder<T extends { status?: string; waitlistedAt?: string | null; submittedAt?: string }>(
  rsvps: T[],
): T[] {
  return rsvps
    .filter((r) => r.status === "waitlisted")
    .slice()
    .sort((a, b) => {
      const at = a.waitlistedAt ?? a.submittedAt ?? "";
      const bt = b.waitlistedAt ?? b.submittedAt ?? "";
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
}

/**
 * Which waitlisted guests fit into the seats that just freed up.
 *
 * Stops at the first guest too large to fit rather than skipping over them:
 * jumping a solo guest ahead of a couple who arrived earlier silently reorders
 * the queue, and the queue is the only promise a waitlist makes.
 */
export function planPromotions<T extends SeatConsumer & { id?: string }>(
  waitlisted: T[],
  freeSeats: number,
): { promote: T[]; seatsUsed: number } {
  const promote: T[] = [];
  let seatsUsed = 0;

  for (const guest of waitlisted) {
    const need = guest.plusOne === true ? 2 : 1;
    if (seatsUsed + need > freeSeats) break;
    promote.push(guest);
    seatsUsed += need;
  }

  return { promote, seatsUsed };
}
