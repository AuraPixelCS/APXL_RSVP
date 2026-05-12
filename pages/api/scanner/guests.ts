import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";

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

    const rsvpsSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .get();

    const guests = rsvpsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({ success: true, guests });
  } catch (err) {
    console.error("Scanner Guests Fetch Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
