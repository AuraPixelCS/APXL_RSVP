import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { buildEventReportPdf } from "@/lib/eventReport";
import type { Event, RSVP } from "@/types";

// Allow a generous body/response — a large guest list produces a multi-page PDF.
export const config = {
  api: { responseLimit: "16mb" },
};

function slugifyFilename(title: string): string {
  const base = (title || "event")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "event"}-Report.pdf`;
}

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const eventId = (req.query.eventId as string) || "";
  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" });
  }

  try {
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = { id: eventSnap.id, ...eventSnap.data() } as Event;

    const rsvpsSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .get();
    const rsvps = rsvpsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as RSVP[];

    const pdfBytes = await buildEventReportPdf(event, rsvps);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${slugifyFilename(event.title)}"`,
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error("event-report error:", err);
    return res.status(500).json({ error: "Failed to generate report" });
  }
}

export default withAuth(handler);
