import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";

/** Deletes all docs in a subcollection in batches of 400. */
async function deleteSubcollection(eventId: string, subcollection: string) {
  const ref = adminDb.collection("events").doc(eventId).collection(subcollection);
  let deleted = 0;

  while (true) {
    const snap = await ref.limit(400).get();
    if (snap.empty) break;

    const batch = adminDb.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.docs.length;
  }

  return deleted;
}

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId } = req.body;
  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" });
  }

  try {
    const eventRef = adminDb.collection("events").doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }

    const rsvpsDeleted = await deleteSubcollection(eventId, "rsvps");
    await eventRef.delete();

    return res.status(200).json({
      success: true,
      message: `Event deleted along with ${rsvpsDeleted} RSVP(s)`,
    });
  } catch (err) {
    console.error("delete-event error:", err);
    return res.status(500).json({ error: "Failed to delete event" });
  }
}

export default withAuth(handler, "admin");
