/**
 * Guest self-service API.
 *
 * Authenticated solely by the signed token in the request — guests have no
 * accounts. The token is scoped to one RSVP on one event (lib/manageToken.ts),
 * so every read and write here is pinned to the ids INSIDE the token; nothing
 * from the request body is allowed to redirect which document is touched.
 *
 * Scope is deliberately narrow. A guest may correct their own details, cancel,
 * or ask for their pass again. A guest may not change a seat, a status, anyone
 * else's record, or anything an organiser owns.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyManageToken } from "@/lib/manageToken";
import { isRsvpDeadlinePassed } from "@/lib/eventTime";

/** Fields a guest is allowed to edit, with their length caps. */
const EDITABLE: Record<string, number> = {
  name: 120,
  phone: 32,
  plusOneName: 120,
  dietaryRestrictions: 300,
  message: 1000,
};

/** Statuses from which a guest may still cancel themselves. */
const CANCELLABLE = new Set(["pending", "allocated", "waitlisted"]);

function tokenFrom(req: NextApiRequest): string {
  const q = req.query.t;
  if (typeof q === "string" && q) return q;
  const body = (req.body ?? {}) as { token?: string };
  return typeof body.token === "string" ? body.token : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = verifyManageToken(tokenFrom(req));
  if (!payload) {
    // One message for every failure mode — expired, forged, malformed. Telling
    // the difference would help someone probing the endpoint.
    return res.status(401).json({ error: "This link is invalid or has expired." });
  }

  const { rsvpId, eventId } = payload;
  const rsvpRef = adminDb.collection("events").doc(eventId).collection("rsvps").doc(rsvpId);

  try {
    const [eventSnap, rsvpSnap] = await Promise.all([
      adminDb.collection("events").doc(eventId).get(),
      rsvpRef.get(),
    ]);

    if (!eventSnap.exists || !rsvpSnap.exists) {
      return res.status(404).json({ error: "We couldn't find that RSVP." });
    }

    const event = eventSnap.data()!;
    const rsvp = rsvpSnap.data()!;

    // Only what the guest needs to see — no other guests, no admin fields.
    const view = () => ({
      rsvp: {
        id: rsvpId,
        name: rsvp.name ?? "",
        email: rsvp.email ?? "",
        phone: rsvp.phone ?? "",
        status: rsvp.status ?? "pending",
        attending: rsvp.attending !== false,
        plusOne: rsvp.plusOne === true,
        plusOneName: rsvp.plusOneName ?? "",
        dietaryRestrictions: rsvp.dietaryRestrictions ?? "",
        message: rsvp.message ?? "",
        seatNumber: rsvp.seatNumber ?? null,
        plusOneSeatNumber: rsvp.plusOneSeatNumber ?? null,
        hasPass: !!rsvp.qrToken,
      },
      event: {
        id: eventId,
        title: event.title ?? "",
        date: event.date ?? "",
        time: event.time ?? "",
        venue: event.venue ?? "",
        address: event.address ?? "",
        assignmentMode: event.assignmentMode ?? "seat",
      },
      // Edits close when RSVPs close — after that the guest list is being used
      // to plan the room, and a silent change nobody sees is worse than none.
      editable: !isRsvpDeadlinePassed(event) && event.isActive !== false,
    });

    if (req.method === "GET") {
      return res.status(200).json(view());
    }

    const { action } = (req.body ?? {}) as { action?: string };
    const snapshot = view();

    if (!snapshot.editable && action !== "resend_pass") {
      return res.status(403).json({
        error: "Changes are closed for this event. Please contact the organiser.",
      });
    }

    // ── Cancel ──────────────────────────────────────────────────────────────
    if (action === "cancel") {
      if (!CANCELLABLE.has(String(rsvp.status))) {
        return res.status(409).json({ error: "This RSVP can no longer be cancelled." });
      }
      await rsvpRef.update({
        status: "not_attending",
        attending: false,
        // Release the seats so the room is accurate immediately. The pass is
        // revoked with them — a cancelled guest holding a working QR is how
        // someone walks in on a seat that has been given away.
        seatNumber: null,
        plusOneSeatNumber: null,
        qrToken: null,
        plusOneQrToken: null,
        qrIssuedAt: null,
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, status: "not_attending" });
    }

    // ── Update details ──────────────────────────────────────────────────────
    if (action === "update") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      for (const [field, max] of Object.entries(EDITABLE)) {
        if (!(field in body)) continue;
        const raw = body[field];
        if (typeof raw !== "string") continue;
        if (raw.length > max) {
          return res.status(400).json({ error: `${field} is too long.` });
        }
        patch[field] = raw.trim() || null;
      }

      // A guest may drop their +1 but not add one — an extra body is a capacity
      // decision, and capacity is the organiser's to give away, not the guest's.
      if (body.plusOne === false && rsvp.plusOne === true) {
        patch.plusOne = false;
        patch.plusOneName = null;
        patch.plusOneSeatNumber = null;
        patch.plusOneQrToken = null;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nothing to update." });
      }

      // Name is required — an empty one breaks every email and the guest list.
      if (patch.name === null) {
        return res.status(400).json({ error: "Name can't be empty." });
      }

      patch.updatedAt = new Date().toISOString();
      await rsvpRef.update(patch);

      const updated = await rsvpRef.get();
      Object.assign(rsvp, updated.data());
      return res.status(200).json({ ok: true, ...view() });
    }

    // ── Re-request the entry pass ───────────────────────────────────────────
    // Deliberately not a send: this only flags the request. Letting an
    // unauthenticated link trigger outbound mail on demand is a spam relay, and
    // the guest may be asking precisely because delivery is failing — which an
    // admin needs to see rather than retry blindly.
    if (action === "resend_pass") {
      if (!rsvp.qrToken) {
        return res.status(409).json({
          error: "No entry pass has been issued for this RSVP yet.",
        });
      }
      await rsvpRef.update({
        passResendRequestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.status(200).json({
        ok: true,
        message: "We've let the organiser know. Your pass will be re-sent shortly.",
      });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error("[manage] error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
