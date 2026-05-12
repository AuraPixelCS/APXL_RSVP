import type { NextApiRequest, NextApiResponse } from "next";
import { sendWhatsAppTemplate, sendWhatsAppImage } from "@/lib/whatsapp";
import { adminDb } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvpId, type } = req.body;
  // type: "confirmation" | "qr"

  if (!eventId || !rsvpId || !type) {
    return res.status(400).json({ error: "eventId, rsvpId, and type are required" });
  }

  try {
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;

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

    if (type === "confirmation") {
      // Send RSVP confirmation template
      const result = await sendWhatsAppTemplate(rsvp.phone, "rsvp_confirmation", [
        rsvp.name,
        event.title,
        event.date,
        event.time,
        event.venue,
      ]);

      if (result.success) {
        await rsvpRef.update({
          whatsappConfirmSent: true,
          updatedAt: new Date().toISOString(),
        });
      }

      return res.status(result.success ? 200 : 500).json(result);
    } else if (type === "qr") {
      // Send QR code image via WhatsApp
      if (!rsvp.qrToken) {
        return res.status(400).json({ error: "QR token not generated yet" });
      }

      // We need a public URL for the QR image — for now use a placeholder approach
      // In production, upload to Firebase Storage and get public URL
      const result = await sendWhatsAppImage(
        rsvp.phone,
        `${process.env.NEXT_PUBLIC_BASE_URL || "https://rsvp.aurapixel.com"}/api/qr/image?token=${encodeURIComponent(rsvp.qrToken)}`,
        `🎟️ Your ticket for ${event.title}\nSeat #${rsvp.seatNumber}\n\nShow this QR code at the entrance.`
      );

      if (result.success) {
        await rsvpRef.update({
          whatsappQRSent: true,
          updatedAt: new Date().toISOString(),
        });
      }

      return res.status(result.success ? 200 : 500).json(result);
    }

    return res.status(400).json({ error: "Invalid type. Use 'confirmation' or 'qr'" });
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
