import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { generateQRPayload, signQRPayload } from "@/lib/qr";
import QRCode from "qrcode";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";

// ─── Helper: generate QR data URL and signed token ──────────────────────────

async function buildQR(
  rsvpId: string,
  eventId: string,
  seatNumber: number,
  eventDate: string,
  eventTime: string
): Promise<{ token: string; dataUrl: string }> {
  const payload = generateQRPayload(rsvpId, eventId, seatNumber, eventDate, eventTime);
  const token = signQRPayload(payload);
  const dataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return { token, dataUrl };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvpId, bulk, seatNumber, force } = req.body;

  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" });
  }

  try {
    // Fetch event
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;

    // Fetch all RSVPs (used for seat availability checks)
    const allRsvpsSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .get();

    const allRsvps = allRsvpsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

    const maxSeat = allRsvps.reduce((max: number, r: any) => {
      return r.seatNumber != null && r.seatNumber > max ? r.seatNumber : max;
    }, 0);

    // ── Bulk allocate ────────────────────────────────────────────────────────────
    if (bulk) {
      const pending = allRsvps.filter(
        (r) => r.status === "pending" && r.attending === true
      );

      if (pending.length === 0) {
        return res.status(400).json({ error: "No pending RSVPs to allocate" });
      }

      let nextSeat = maxSeat + 1;
      const batch = adminDb.batch();
      const allocated: string[] = [];

      for (const rsvp of pending) {
        if (nextSeat > event.totalSeats) break;
        const ref = adminDb
          .collection("events")
          .doc(eventId)
          .collection("rsvps")
          .doc(rsvp.id);

        // Generate QR for each
        const { token } = await buildQR(rsvp.id, eventId, nextSeat, event.date, event.time);

        batch.update(ref, {
          status: "allocated",
          seatNumber: nextSeat,
          qrToken: token,
          qrIssuedAt: new Date().toISOString(),
          allocatedBy: {
            uid: req.decodedToken.uid,
            displayName: req.decodedToken.name ?? req.decodedToken.email ?? "Unknown",
          },
          updatedAt: new Date().toISOString(),
        });
        allocated.push(rsvp.id);
        nextSeat++;
      }

      await batch.commit();

      return res.status(200).json({
        success: true,
        allocated: allocated.length,
        message: `Allocated seats to ${allocated.length} RSVPs`,
      });
    }

    // ── Single allocate ──────────────────────────────────────────────────────────
    if (!rsvpId) {
      return res.status(400).json({ error: "rsvpId is required for single allocation" });
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
    if (!force && rsvpData.status !== "pending") {
      return res.status(400).json({ error: "RSVP is not pending" });
    }

    // Determine which seat to assign
    let targetSeat: number;

    if (typeof seatNumber === "number" && seatNumber >= 1) {
      const alreadyTaken = allRsvps.some(
        (r) => r.seatNumber === seatNumber && r.id !== rsvpId
      );
      if (alreadyTaken) {
        return res.status(409).json({ error: `Seat #${seatNumber} is already taken` });
      }
      if (seatNumber > event.totalSeats) {
        return res.status(400).json({ error: `Seat #${seatNumber} exceeds total seats (${event.totalSeats})` });
      }
      targetSeat = seatNumber;
    } else {
      targetSeat = maxSeat + 1;
      if (targetSeat > event.totalSeats) {
        return res.status(400).json({ error: "No seats available" });
      }
    }

    // Generate QR
    const { token: qrToken } = await buildQR(
      rsvpId, eventId, targetSeat, event.date, event.time
    );

    // Save to Firestore
    await rsvpRef.update({
      status: "allocated",
      seatNumber: targetSeat,
      qrToken,
      qrIssuedAt: new Date().toISOString(),
      allocatedBy: {
        uid: req.decodedToken.uid,
        displayName: req.decodedToken.name ?? req.decodedToken.email ?? "Unknown",
      },
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      seatNumber: targetSeat,
      message: `Seat #${targetSeat} allocated`,
    });

  } catch (err) {
    console.error("Allocation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler);
