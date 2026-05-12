import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvpId } = req.body;
  if (!eventId || !rsvpId) {
    return res.status(400).json({ error: "eventId and rsvpId are required" });
  }

  try {
    const rsvpRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .doc(rsvpId);

    const snap = await rsvpRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "RSVP not found" });
    }

    await rsvpRef.delete();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("delete-rsvp error:", err);
    return res.status(500).json({ error: "Failed to delete RSVP" });
  }
}

export default withAuth(handler, "admin");
