import type { NextApiRequest, NextApiResponse } from "next";
import { verifyQRToken, isQRValid } from "@/lib/qr";
import { adminDb } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS check, handle preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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

    // 2. Initial time-based validity check
    const timeValid = isQRValid(payload);

    const { eventId, rsvpId } = payload;

    // 3. Fetch Event and RSVP from Firebase
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;

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

    return res.status(200).json({
      success: true,
      timeValid, // Let scanner show a warning if out-of-time but still valid signature
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
        seatNumber: rsvp.seatNumber || payload.seatNumber,
        company: rsvp.company || "",
        dietary: rsvp.dietaryRequirements || "None",
      }
    });

  } catch (err) {
    console.error("QR Validation Error:", err);
    return res.status(500).json({ error: "Internal server error during validation" });
  }
}
