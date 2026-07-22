import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { generateQRPayload, signQRPayload } from "@/lib/qr";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { getTotalSeatCount } from "@/lib/seating";
import { eventTimezone } from "@/lib/eventTime";
import { takenSeats, lowestFreeSeat, planAutoAllocation } from "@/lib/seatAllocation";

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
  name?: string;
}

function signedToken(
  rsvpId: string,
  eventId: string,
  seatNumber: number,
  event: { date: string; time: string; timezone?: string },
): string {
  return signQRPayload(
    generateQRPayload(rsvpId, eventId, seatNumber, event.date, event.time, eventTimezone(event)),
  );
}

function allocationPatch(
  req: AuthedRequest,
  seatNumber: number,
  qrToken: string,
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    status: "allocated",
    seatNumber,
    qrToken,
    qrIssuedAt: now,
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

          const pending = rows.filter(
            (r) => r.status === "pending" && r.attending === true && r.seatNumber == null,
          );
          if (pending.length === 0) return { count: 0, pending: 0, full: false };

          const { assignments, seatsExhausted } = planAutoAllocation(
            pending.map((r) => r.id),
            takenSeats(rows),
            standardSeats,
            MAX_WRITES_PER_TXN,
          );

          for (const a of assignments) {
            tx.update(
              rsvpsRef.doc(a.id),
              allocationPatch(req, a.seatNumber, signedToken(a.id, eventId, a.seatNumber, event)),
            );
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
          // the group can rotate among its own seats.
          for (const r of rows) {
            if (r.seatNumber == null || movingIds.has(r.id)) continue;
            if (seatSet.has(Number(r.seatNumber))) {
              throw new Error(`Seat #${r.seatNumber} is already taken by ${r.name ?? "another guest"}`);
            }
          }

          for (const a of requested) {
            tx.update(
              rsvpsRef.doc(a.rsvpId),
              allocationPatch(req, a.seatNumber, signedToken(a.rsvpId, eventId, a.seatNumber, event)),
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

        let seat: number;
        if (explicitSeat != null) {
          const holder = rows.find(
            (r) => r.id !== rsvpId && r.seatNumber != null && Number(r.seatNumber) === explicitSeat,
          );
          if (holder) {
            throw Object.assign(new Error(`Seat #${explicitSeat} is already taken`), { httpStatus: 409 });
          }
          seat = explicitSeat;
        } else {
          // Exclude this guest's own seat so a re-allocation can keep it.
          const taken = takenSeats(rows.filter((r) => r.id !== rsvpId));
          const free = lowestFreeSeat(taken, standardSeats);
          if (free == null) {
            throw Object.assign(new Error("No seats available"), { httpStatus: 409 });
          }
          seat = free;
        }

        tx.update(
          rsvpsRef.doc(rsvpId),
          allocationPatch(req, seat, signedToken(rsvpId, eventId, seat, event)),
        );
        return seat;
      });

      outcome = {
        status: 200,
        body: { success: true, seatNumber: assignedSeat, message: `Seat #${assignedSeat} allocated` },
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
