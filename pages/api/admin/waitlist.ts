/**
 * Waitlist promotion.
 *
 * Two modes:
 *   { eventId, rsvpIds: [...] }  — promote specific guests
 *   { eventId, auto: true }      — promote as many as the free seats allow
 *
 * Promotion moves a guest from `waitlisted` to `pending`; it does NOT seat them.
 * Seating stays with the allocation flow so there is exactly one place where
 * seats are assigned, and so an admin can review the list before the room is
 * committed.
 *
 * Deliberately NOT automatic on cancellation. A cancellation can be a mistake,
 * and auto-promoting on one would fire an email the moment someone fat-fingers
 * a booking — with no way to recall it. An admin presses the button.
 */

import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { getTotalSeatCount } from "@/lib/seating";
import { capacityOf, committedSeats, waitlistOrder, planPromotions } from "@/lib/capacity";

interface Row {
  id: string;
  name?: string;
  status?: string;
  attending?: boolean;
  plusOne?: boolean;
  waitlistedAt?: string | null;
  submittedAt?: string;
}

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvpIds, auto } = req.body as {
    eventId?: string;
    rsvpIds?: string[];
    auto?: boolean;
  };

  if (!eventId) return res.status(400).json({ error: "eventId is required" });
  if (!auto && (!Array.isArray(rsvpIds) || rsvpIds.length === 0)) {
    return res.status(400).json({ error: "Provide rsvpIds, or set auto: true" });
  }

  try {
    const eventRef = adminDb.collection("events").doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) return res.status(404).json({ error: "Event not found" });

    const event = eventSnap.data() as {
      totalSeats?: number;
      capacityLimit?: number;
      seatingConfig?: Parameters<typeof getTotalSeatCount>[0];
    };
    const capacity = capacityOf(
      event,
      getTotalSeatCount(event.seatingConfig, Number(event.totalSeats) || 0),
    );
    const rsvpsRef = eventRef.collection("rsvps");

    // A transaction because capacity is read then written — two admins clicking
    // "promote" together would otherwise both see the same free seats and
    // between them promote past capacity, recreating the exact over-booking
    // this feature exists to prevent.
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(rsvpsRef);
      const rows: Row[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);

      const used = committedSeats(rows);
      const freeSeats = capacity <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, capacity - used);

      let candidates: Row[];
      if (auto) {
        candidates = waitlistOrder(rows);
      } else {
        const wanted = new Set(rsvpIds);
        // Keep waitlist order even for an explicit selection, so promoting a
        // batch by hand doesn't quietly reorder the queue.
        candidates = waitlistOrder(rows).filter((r) => wanted.has(r.id));
        const missing = [...wanted].filter((id) => !candidates.some((c) => c.id === id));
        if (missing.length) {
          throw Object.assign(
            new Error(`${missing.length} of those guests are not on the waitlist.`),
            { httpStatus: 409 },
          );
        }
      }

      if (candidates.length === 0) {
        return { promoted: [] as { id: string; name: string }[], freeSeats, skipped: 0 };
      }

      const { promote } = planPromotions(candidates, freeSeats);

      const now = new Date().toISOString();
      for (const guest of promote) {
        tx.update(rsvpsRef.doc(guest.id), {
          status: "pending",
          waitlistedAt: null,
          promotedAt: now,
          updatedAt: now,
        });
      }

      return {
        promoted: promote.map((g) => ({ id: g.id, name: g.name ?? "" })),
        freeSeats,
        skipped: candidates.length - promote.length,
      };
    });

    if (result.promoted.length === 0) {
      return res.status(409).json({
        error:
          result.freeSeats === 0
            ? "No seats are free — cancel or increase capacity first."
            : "Nobody could be promoted with the seats available.",
        freeSeats: result.freeSeats === Number.POSITIVE_INFINITY ? null : result.freeSeats,
      });
    }

    return res.status(200).json({
      success: true,
      promoted: result.promoted.length,
      names: result.promoted.map((p) => p.name),
      skipped: result.skipped,
      // Promotion alone doesn't seat or notify anyone — say so rather than
      // letting "Promoted 5" imply five people were told.
      message:
        `Promoted ${result.promoted.length} from the waitlist. ` +
        `They are now pending — allocate seats and send their entry pass to notify them.`,
    });
  } catch (e) {
    const status = (e as { httpStatus?: number }).httpStatus;
    if (status) {
      return res.status(status).json({ error: e instanceof Error ? e.message : "Promotion failed" });
    }
    console.error("Waitlist promotion error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
