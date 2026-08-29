import type { NextApiRequest, NextApiResponse } from "next";
import { verifyQRToken, isQRValidForEvent } from "@/lib/qr";
import { isDayRestricted, isEventDay, passDays } from "@/lib/eventDays";
import { dateISOInZone, eventTimezone } from "@/lib/eventTime";
import { formatAssignment } from "@/lib/seatLabel";
import { adminDb } from "@/lib/firebaseAdmin";
import { scannerKeyValid } from "@/lib/apiAuth";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS check, handle preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-scanner-key");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!scannerKeyValid(req)) {
    return res.status(401).json({ error: "Unauthorized scanner client" });
  }

  try {
    const { qrToken } = req.body;

    if (!qrToken) {
      return res.status(400).json({ error: "QR Token is required" });
    }

    // 1. Decrypt and verify payload signature
    const payload = verifyQRToken(qrToken);
    if (!payload) {
      return res.status(401).json({ error: "Not valid" });
    }

    const { eventId, rsvpId } = payload;

    // 2. Fetch Event and RSVP from Firebase
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;

    // 3. Time-based validity — event-aware so a three-day pass is still "in
    // time" on day two (the payload only carries the first day's start).
    const timeValid = isQRValidForEvent(payload, event as any);

    const rsvpSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .doc(rsvpId)
      .get();

    if (!rsvpSnap.exists) {
      return res.status(404).json({ error: "RSVP record not found" });
    }
    const rsvp = rsvpSnap.data()!;

    // 4. Validate check-in constraints
    if (rsvp.status === "checked_in") {
      return res.status(400).json({ error: "Already checked in" });
    }
    if (rsvp.status !== "attending" && rsvp.status !== "allocated") {
      return res.status(400).json({ error: `RSVP is marked as ${rsvp.status || 'not attending'}` });
    }

    // Cross-check token with stored token (to prevent old tokens if re-generated)
    if (rsvp.qrToken && rsvp.qrToken !== qrToken) {
      return res.status(401).json({ error: "This QR Code has been revoked (a newer one exists)" });
    }

    // Single-day passes (F12/F13/F14): a hard refusal when the holder turns up
    // on an event day their pass doesn't cover. Outside the event's days
    // entirely (a pre-event scanner test) it stays a soft `timeValid` warning.
    const todayISO = dateISOInZone(Date.now(), eventTimezone(event as any));
    const validDays = passDays(event as any, rsvp.days).map((d) => d.date);
    const dayValid = !isDayRestricted(event as any, rsvp.days) || validDays.includes(todayISO);
    if (!dayValid && isEventDay(event as any, todayISO)) {
      return res.status(400).json({
        error: `Pass not valid today — admits on ${validDays.join(", ")} only`,
        validDays,
      });
    }

    return res.status(200).json({
      success: true,
      timeValid, // Let scanner show a warning if out-of-time but still valid signature
      dayValid,
      validDays,
      event: {
        title: event.title || event.name || "Event",
        date: event.date,
        time: event.time,
        venue: event.venue || "TBD",
      },
      rsvp: {
        id: rsvpId,
        name: rsvp.name,
        email: rsvp.email,
        // null on a free-seating event — scanners should show `seatLabel`.
        seatNumber: rsvp.seatNumber ?? payload.seatNumber ?? null,
        seatLabel: formatAssignment(rsvp.seatNumber ?? payload.seatNumber ?? null, event as any)?.long ?? null,
        freeSeating: event.assignmentMode === "free",
        ticketType: rsvp.ticketType ?? null,
        days: rsvp.days ?? null,
        company: rsvp.company || "",
        dietary: rsvp.dietaryRequirements || "None",
      }
    });

  } catch (err) {
    console.error("QR Validation Error:", err);
    return res.status(500).json({ error: "Internal server error during validation" });
  }
}
