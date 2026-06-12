import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { formatAssignment } from "@/lib/seatLabel";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { eventId } = req.query;

    if (!eventId || typeof eventId !== "string") {
      return res.status(400).json({ error: "eventId is required" });
    }

    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;

    const rsvpsSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .get();

    const guests = rsvpsSnap.docs.map(doc => {
      const data = doc.data();
      // Canonical seat/table label (seat- vs table-mode + VIP aware), so the
      // scanner app shows "Table 4" in table mode instead of "Seat 31".
      const label = formatAssignment(
        typeof data.seatNumber === "number" ? data.seatNumber : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event as any
      );
      return {
        id: doc.id,
        ...data,
        seatLabel: label?.long ?? null,
        seatLabelShort: label?.short ?? null,
      };
    });

    return res.status(200).json({
      success: true,
      assignmentMode: event.assignmentMode ?? "seat",
      guests,
    });
  } catch (err) {
    console.error("Scanner Guests Fetch Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
