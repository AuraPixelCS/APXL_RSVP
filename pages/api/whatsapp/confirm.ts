import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvpId, action } = req.body;
  // action: "confirm" | "decline"

  if (!eventId || !rsvpId || !action) {
    return res.status(400).json({ error: "eventId, rsvpId, and action are required" });
  }

  try {
    const rsvpRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .doc(rsvpId);
    const rsvpSnap = await rsvpRef.get();

    if (!rsvpSnap.exists) {
      return res.status(404).json({ error: "RSVP not found" });
    }

    if (action === "confirm") {
      await rsvpRef.update({
        attending: true,
        updatedAt: new Date().toISOString(),
      });
      return res.status(200).json({ success: true, message: "RSVP confirmed" });
    } else if (action === "decline") {
      await rsvpRef.update({
        attending: false,
        status: "not_attending",
        updatedAt: new Date().toISOString(),
      });
      return res.status(200).json({ success: true, message: "RSVP declined" });
    }

    return res.status(400).json({ error: "Invalid action. Use 'confirm' or 'decline'" });
  } catch (err) {
    console.error("WhatsApp confirm error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
