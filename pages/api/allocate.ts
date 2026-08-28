import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { generateQRPayload, signQRPayload } from "@/lib/qr";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { getTotalSeatCount } from "@/lib/seating";
import { eventTimezone } from "@/lib/eventTime";
import {
  takenSeats,
  lowestFreeSeat,
  adjacentFreeSeat,
  planAutoAllocation,
} from "@/lib/seatAllocation";

/**
 * Seat allocation.
 *
 * TWO BUGS THIS FILE USED TO HAVE
 *
 * 1. False-full lockout. The next seat was `maxSeat + 1`, where maxSeat was the
 *    highest seat number in use ACROSS THE WHOLE EVENT. VIP seats are numbered
 *    ABOVE totalSeats by design, so seating one VIP guest pushed maxSeat past
 *    capacity and every subsequent auto-allocation failed the `> totalSeats`
 *    test. Bulk allocate then reported "Allocated seats to 0 RSVPs" as a
 *    SUCCESS. It also meant a cancelled seat was never reused — the counter
 *    only ever went up.
 *
 *    Now: assign the LOWEST FREE seat, computed from the set of seats actually
 *    in use. Gaps get refilled and VIP numbering is irrelevant to the standard
 *    pool.
 *
 * 2. Non-atomic writes. Reads happened outside any transaction, so two admins
 *    seating guests at the same moment could both see a seat as free and both
 *    take it. Group allocation was worse: the client looped one HTTP request
 *    per guest, so a failure halfway left the group split across the room with
 *    no rollback.
 *
 *    Now: every seat decision is made inside a Firestore transaction that reads
 *    the RSVP collection first, so a concurrent write forces a retry against
 *    fresh data. Group allocation is one request, one transaction — all seats
 *    or none.
 */

/** Firestore caps a transaction at 500 writes; leave headroom for retries. */
const MAX_WRITES_PER_TXN = 400;

interface RsvpRow {
  id: string;
  status?: string;
  attending?: boolean;
  seatNumber?: number | null;
  plusOne?: boolean;
  plusOneSeatNumber?: number | null;
  name?: string;
}

/**
 * Every seat an RSVP occupies. A +1's seat is just as taken as their host's —
 * omitting it here would let the next guest be seated straight on top of them.
 */
function seatsOf(r: RsvpRow): (number | null | undefined)[] {
  return [r.seatNumber, r.plusOneSeatNumber];
}

/** Flatten rows into the shape takenSeats() expects, +1 seats included. */
function occupiedSeatRows(rows: RsvpRow[]): { id: string; seatNumber?: number | null }[] {
  return rows.flatMap((r) =>
    seatsOf(r).map((seatNumber, i) => ({ id: `${r.id}:${i}`, seatNumber })),
  );
}

function signedToken(
  rsvpId: string,
  eventId: string,
  seatNumber: number,
  event: { date: string; time: string; timezone?: string },
  guestIndex: 0 | 1 = 0,
): string {
  return signQRPayload(
    generateQRPayload(
      rsvpId, eventId, seatNumber, event.date, event.time, eventTimezone(event), guestIndex,
    ),
  );
}

/** Build the full allocation patch for one guest, companion pass included. */
function patchFor(
  req: AuthedRequest,
  a: { id: string; seatNumber: number; plusOneSeatNumber: number | null },
  eventId: string,
  event: { date: string; time: string; timezone?: string },
): Record<string, unknown> {
  return allocationPatch(
    req,
    a.seatNumber,
    signedToken(a.id, eventId, a.seatNumber, event, 0),
    a.plusOneSeatNumber == null
      ? null
      : {
          seatNumber: a.plusOneSeatNumber,
          qrToken: signedToken(a.id, eventId, a.plusOneSeatNumber, event, 1),
        },
  );
}

function allocationPatch(
  req: AuthedRequest,
  seatNumber: number,
  qrToken: string,
  plusOne?: { seatNumber: number; qrToken: string } | null,
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    status: "allocated",
    seatNumber,
    qrToken,
    qrIssuedAt: now,
    // Explicit null (not undefined) when there is no +1, so re-allocating a
    // guest who dropped their companion actually clears the stale seat.
    plusOneSeatNumber: plusOne ? plusOne.seatNumber : null,
    plusOneQrToken: plusOne ? plusOne.qrToken : null,
    allocatedBy: {
      uid: req.decodedToken.uid,
      displayName: req.decodedToken.name ?? req.decodedToken.email ?? "Unknown",
    },
    updatedAt: now,
  };
}

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvpId, bulk, seatNumber, force, assignments } = req.body;

  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" });
  }

  try {
    const eventRef = adminDb.collection("events").doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data() as {
      date: string; time: string; timezone?: string;
      totalSeats: number; seatingConfig?: Parameters<typeof getTotalSeatCount>[0];
    };

    const rsvpsRef = eventRef.collection("rsvps");
    const standardSeats = Number(event.totalSeats) || 0;
    const totalCapacity = getTotalSeatCount(event.seatingConfig, standardSeats);

    // ── Bulk allocate ────────────────────────────────────────────────────────
    if (bulk) {
      let allocatedTotal = 0;
      let ranOutOfSeats = false;
      let sawPending = false;

      // Chunked transactions: each re-reads current state, so the seat map is
      // never stale, and no single transaction exceeds the write cap.
      for (let pass = 0; pass < 20; pass++) {
        const result = await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(rsvpsRef);
          const rows: RsvpRow[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RsvpRow);

          // Waitlisted guests are deliberately excluded — they hold no seat
          // until an admin promotes them.
          const pending = rows.filter(
            (r) => r.status === "pending" && r.attending === true && r.seatNumber == null,
          );
          if (pending.length === 0) return { count: 0, pending: 0, full: false };

          const { assignments, seatsExhausted } = planAutoAllocation(
            pending.map((r) => ({ id: r.id, plusOne: r.plusOne === true })),
            takenSeats(occupiedSeatRows(rows)),
            standardSeats,
            MAX_WRITES_PER_TXN,
          );

          for (const a of assignments) {
            tx.update(rsvpsRef.doc(a.id), patchFor(req, a, eventId, event));
          }

          return { count: assignments.length, pending: pending.length, full: seatsExhausted };
        });

        if (result.pending > 0) sawPending = true;
        allocatedTotal += result.count;
        if (result.full) { ranOutOfSeats = true; break; }
        // Nothing pending left, or this pass couldn't place anyone.
        if (result.pending === 0 || result.count === 0) break;
      }

      if (!sawPending) {
        return res.status(400).json({ error: "No pending RSVPs to allocate" });
      }
      // A zero-allocation run is a failure, not a success — the old code
      // returned 200 "Allocated seats to 0 RSVPs" and looked like it worked.
      if (allocatedTotal === 0) {
        return res.status(409).json({
          error: `No seats available — all ${standardSeats} seats are taken.`,
        });
      }

      return res.status(200).json({
        success: true,
        allocated: allocatedTotal,
        seatsExhausted: ranOutOfSeats,
        message: ranOutOfSeats
          ? `Allocated ${allocatedTotal} — then ran out of seats (${standardSeats} total).`
          : `Allocated seats to ${allocatedTotal} RSVPs`,
      });
    }

    // ── Group allocate (atomic, all-or-nothing) ──────────────────────────────
    // `assignments`: [{ rsvpId, seatNumber }]. One transaction for the whole
    // group, so a conflict on the last guest rolls back the first.
    if (Array.isArray(assignments) && assignments.length > 0) {
      if (assignments.length > MAX_WRITES_PER_TXN) {
        return res.status(400).json({ error: `Group is too large (max ${MAX_WRITES_PER_TXN}).` });
      }

      const requested = assignments.map((a: { rsvpId?: string; seatNumber?: number }) => ({
        rsvpId: String(a?.rsvpId ?? ""),
        seatNumber: Number(a?.seatNumber),
      }));
      for (const a of requested) {
        if (!a.rsvpId || !Number.isInteger(a.seatNumber) || a.seatNumber < 1) {
          return res.status(400).json({ error: "Each assignment needs an rsvpId and a seat number." });
        }
        if (a.seatNumber > totalCapacity) {
          return res.status(400).json({ error: `Seat #${a.seatNumber} exceeds total seats (${totalCapacity})` });
        }
      }
      const seatSet = new Set(requested.map((a) => a.seatNumber));
      if (seatSet.size !== requested.length) {
        return res.status(400).json({ error: "The same seat was requested twice in this group." });
      }

      try {
        await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(rsvpsRef);
          const rows: RsvpRow[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RsvpRow);
          const byId = new Map(rows.map((r) => [r.id, r]));
          const movingIds = new Set(requested.map((a) => a.rsvpId));

          for (const a of requested) {
            if (!byId.has(a.rsvpId)) throw new Error(`RSVP ${a.rsvpId} not found`);
          }
          // Seats held by guests OUTSIDE the group are unavailable; seats held
          // by guests INSIDE it are being vacated by this same transaction, so
          // the group can rotate among its own seats. A +1's seat counts as
          // occupied just like their host's.
          for (const r of rows) {
            if (movingIds.has(r.id)) continue;
            for (const held of seatsOf(r)) {
              if (held != null && seatSet.has(Number(held))) {
                throw new Error(`Seat #${held} is already taken by ${r.name ?? "another guest"}`);
              }
            }
          }

          // Place each guest's +1 beside them, drawing from the seats this
          // group is not already using.
          const claimed = new Set(seatSet);
          for (const r of rows) {
            if (movingIds.has(r.id)) continue;
            for (const held of seatsOf(r)) if (held != null) claimed.add(Number(held));
          }

          for (const a of requested) {
            const guest = byId.get(a.rsvpId)!;
            let companionSeat: number | null = null;
            if (guest.plusOne === true) {
              companionSeat =
                adjacentFreeSeat(claimed, a.seatNumber, standardSeats) ??
                lowestFreeSeat(claimed, standardSeats);
              if (companionSeat == null) {
                throw new Error(`No free seat for ${guest.name ?? "a guest"}'s +1`);
              }
              claimed.add(companionSeat);
            }
            tx.update(
              rsvpsRef.doc(a.rsvpId),
              patchFor(
                req,
                { id: a.rsvpId, seatNumber: a.seatNumber, plusOneSeatNumber: companionSeat },
                eventId,
                event,
              ),
            );
          }
        });
      } catch (e) {
        return res.status(409).json({
          error: e instanceof Error ? e.message : "Group allocation failed",
        });
      }

      return res.status(200).json({
        success: true,
        allocated: requested.length,
        message: `Group of ${requested.length} allocated`,
      });
    }

    // ── Single allocate ──────────────────────────────────────────────────────
    if (!rsvpId) {
      return res.status(400).json({ error: "rsvpId is required for single allocation" });
    }

    const explicitSeat =
      typeof seatNumber === "number" && Number.isInteger(seatNumber) && seatNumber >= 1
        ? seatNumber
        : null;

    if (explicitSeat != null && explicitSeat > totalCapacity) {
      return res.status(400).json({ error: `Seat #${explicitSeat} exceeds total seats (${totalCapacity})` });
    }

    let outcome: { status: number; body: Record<string, unknown> };
    try {
      const assignedSeat = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(rsvpsRef);
        const rows: RsvpRow[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RsvpRow);

        const target = rows.find((r) => r.id === rsvpId);
        if (!target) throw Object.assign(new Error("RSVP not found"), { httpStatus: 404 });
        if (!force && target.status !== "pending") {
          throw Object.assign(new Error("RSVP is not pending"), { httpStatus: 400 });
        }

        // Seats held by everyone except this guest — their own current seats
        // are free to keep or move within.
        const othersTaken = takenSeats(occupiedSeatRows(rows.filter((r) => r.id !== rsvpId)));

        let seat: number;
        if (explicitSeat != null) {
          if (othersTaken.has(explicitSeat)) {
            throw Object.assign(new Error(`Seat #${explicitSeat} is already taken`), { httpStatus: 409 });
          }
          seat = explicitSeat;
        } else {
          const free = lowestFreeSeat(othersTaken, standardSeats);
          if (free == null) {
            throw Object.assign(new Error("No seats available"), { httpStatus: 409 });
          }
          seat = free;
        }

        let companionSeat: number | null = null;
        if (target.plusOne === true) {
          const claimed = new Set(othersTaken);
          claimed.add(seat);
          companionSeat =
            adjacentFreeSeat(claimed, seat, standardSeats) ?? lowestFreeSeat(claimed, standardSeats);
          if (companionSeat == null) {
            throw Object.assign(
              new Error("No free seat for this guest's +1"),
              { httpStatus: 409 },
            );
          }
        }

        tx.update(
          rsvpsRef.doc(rsvpId),
          patchFor(req, { id: rsvpId, seatNumber: seat, plusOneSeatNumber: companionSeat }, eventId, event),
        );
        return { seat, companionSeat };
      });

      outcome = {
        status: 200,
        body: {
          success: true,
          seatNumber: assignedSeat.seat,
          plusOneSeatNumber: assignedSeat.companionSeat,
          message: assignedSeat.companionSeat
            ? `Seats #${assignedSeat.seat} and #${assignedSeat.companionSeat} allocated`
            : `Seat #${assignedSeat.seat} allocated`,
        },
      };
    } catch (e) {
      const status = (e as { httpStatus?: number }).httpStatus ?? 409;
      outcome = { status, body: { error: e instanceof Error ? e.message : "Allocation failed" } };
    }

    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.error("Allocation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler);
