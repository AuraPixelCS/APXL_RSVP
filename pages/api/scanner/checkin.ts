import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { scannerKeyValid } from "@/lib/apiAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS
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
    const { eventId, rsvpId } = req.body;

    if (!eventId || !rsvpId) {
      return res.status(400).json({ error: "eventId and rsvpId are required" });
    }

    const rsvpRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .doc(rsvpId);

    const rsvpSnap = await rsvpRef.get();
    
    if (!rsvpSnap.exists) {
      return res.status(404).json({ error: "RSVP not found" });
    }

    const rsvpData = rsvpSnap.data()!;

    // Allow checking in if they are allocated or attending
    if (rsvpData.status !== "allocated" && rsvpData.status !== "attending" && rsvpData.status !== "checked_in") {
      return res.status(400).json({ error: `Cannot check in. Guest status is ${rsvpData.status}` });
    }

    // Write both field names so the mobile app (reads checkInTime) and the web
    // report / event page (read checkedInAt) stay in sync from one check-in.
    const now = new Date().toISOString();
    await rsvpRef.update({
      status: "checked_in",
      checkInTime: now,
      checkedInAt: now,
    });

    return res.status(200).json({ success: true, message: "Checked in successfully" });
  } catch (err) {
    console.error("Scanner Checkin Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
