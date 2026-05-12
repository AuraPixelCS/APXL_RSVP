import type { NextApiRequest, NextApiResponse } from "next";
import QRCode from "qrcode";
import { generateQRPayload, signQRPayload } from "@/lib/qr";
import { adminDb } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvpId } = req.body;

  if (!eventId || !rsvpId) {
    return res.status(400).json({ error: "eventId and rsvpId are required" });
  }

  try {
    // Fetch event
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;

    // Fetch RSVP
    const rsvpRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .doc(rsvpId);
    const rsvpSnap = await rsvpRef.get();
    if (!rsvpSnap.exists) {
      return res.status(404).json({ error: "RSVP not found" });
    }

    const rsvp = rsvpSnap.data()!;
    if (rsvp.seatNumber == null) {
      return res.status(400).json({ error: "RSVP must be allocated a seat first" });
    }

    // Generate signed QR payload
    const payload = generateQRPayload(
      rsvpId,
      eventId,
      rsvp.seatNumber,
      event.date,
      event.time
    );
    const token = signQRPayload(payload);

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(token, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });

    // Update RSVP with QR token
    await rsvpRef.update({
      qrToken: token,
      qrIssuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      qrDataUrl,
      token,
    });
  } catch (err) {
    console.error("QR generation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
