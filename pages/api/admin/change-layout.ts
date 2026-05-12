import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import type { SeatingConfig } from "@/types";

function configsEqual(a: SeatingConfig | undefined, b: SeatingConfig | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.style === b.style &&
    (a.seatsPerRow ?? null) === (b.seatsPerRow ?? null) &&
    (a.seatsPerTable ?? null) === (b.seatsPerTable ?? null)
  );
}

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, seatingConfig, assignmentMode } = req.body as {
    eventId: string;
    seatingConfig?: SeatingConfig;
    assignmentMode?: "seat" | "table";
  };

  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" });
  }
  if (!seatingConfig && !assignmentMode) {
    return res.status(400).json({ error: "Provide seatingConfig and/or assignmentMode" });
  }
  if (seatingConfig && !seatingConfig.style) {
    return res.status(400).json({ error: "seatingConfig.style is required" });
  }

  try {
    const eventRef = adminDb.collection("events").doc(eventId);
    const existing = await eventRef.get();
    if (!existing.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const existingData = existing.data() as { seatingConfig?: SeatingConfig } | undefined;

    const layoutChanged = !!seatingConfig && !configsEqual(existingData?.seatingConfig, seatingConfig);

    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (seatingConfig) update.seatingConfig = seatingConfig;
    if (assignmentMode) update.assignmentMode = assignmentMode;

    await eventRef.update(update);

    let cleared = 0;
    if (layoutChanged) {
      const rsvpsSnap = await eventRef
        .collection("rsvps")
        .where("status", "in", ["allocated", "checked_in"])
        .get();

      if (!rsvpsSnap.empty) {
        const batch = adminDb.batch();
        for (const doc of rsvpsSnap.docs) {
          batch.update(doc.ref, {
            status: "pending",
            seatNumber: null,
            qrToken: null,
            qrIssuedAt: null,
            updatedAt: new Date().toISOString(),
          });
        }
        await batch.commit();
        cleared = rsvpsSnap.size;
      }
    }

    return res.status(200).json({
      success: true,
      cleared,
      message: layoutChanged
        ? `Layout updated. ${cleared} guest(s) reset to pending.`
        : "Assignment mode updated.",
    });
  } catch (err) {
    console.error("change-layout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
