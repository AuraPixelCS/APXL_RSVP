import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { sendEmail } from "@/lib/email";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { buildSeatEmail } from "@/lib/emailTemplates";
import { getSeatLabel } from "@/lib/seatLabel";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

// ─── Send notification to a single RSVP ─────────────────────────────────────

async function sendOneNotification(
  rsvp: any,
  event: any,
  eventId: string,
  rsvpId: string,
  htmlBody?: string
): Promise<void> {
  const rawBody = htmlBody ?? event.customEmailBody ?? "";
  const customBody = rawBody
    .replace(/\{\{name\}\}/g, rsvp.name)
    .replace(/\{\{event\}\}/g, event.title) || undefined;

  // Derive table number when event uses table-based assignment
  const seatsPerTable = event.seatingConfig?.seatsPerTable ?? 10;
  const tableNumber: number | undefined = event.assignmentMode === "table"
    ? Math.ceil(rsvp.seatNumber / seatsPerTable)
    : undefined;

  // In seat mode, derive row + position-within-row from the global seatNumber.
  // Only meaningful for grid/runway-style layouts; banquet variants describe seats
  // by table number instead, so we skip the row label there.
  let rowLabel: string | undefined;
  let seatPos: number | undefined;
  const rowableStyle =
    event.seatingConfig &&
    event.seatingConfig.style !== "banquet" &&
    event.seatingConfig.style !== "banquet-runway";
  if (event.assignmentMode !== "table" && rowableStyle) {
    const { row, pos } = getSeatLabel(rsvp.seatNumber, event.seatingConfig);
    rowLabel = row;
    seatPos = pos;
  }

  // Re-generate QR data URL from stored token
  const qrDataUrl = await QRCode.toDataURL(rsvp.qrToken, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: { dark: "#000000", light: "#ffffff" },
  });

  // ── Email ──────────────────────────────────────────────────────────────────
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      let bannerUrl = event.customEmailBanner;
      const attachments: any[] = [
        {
          filename: "qr-entry-pass.png",
          content: qrDataUrl.split(",")[1],
          encoding: "base64",
          cid: "qr_code",
        },
      ];

      if (event.title.toLowerCase().includes("peoplelogy") && !bannerUrl) {
        bannerUrl = "cid:email_banner";
        try {
          const bannerPath = path.join(process.cwd(), "public", "EmailBanner.png");
          if (fs.existsSync(bannerPath)) {
            attachments.push({
              filename: "EmailBanner.png",
              path: bannerPath,
              cid: "email_banner",
            });
          } else {
             bannerUrl = undefined;
          }
        } catch (e) {
           bannerUrl = undefined;
        }
      }

      const html = buildSeatEmail({
        name: rsvp.name,
        eventTitle: event.title,
        eventDate: event.date,
        eventTime: event.time,
        venue: event.venue ?? "",
        address: event.address,
        seatNumber: seatPos ?? rsvp.seatNumber,
        tableNumber,
        rowLabel,
        bannerUrl,
        headerTitle: event.customEmailTitle,
        showTitleOnBanner: !!event.showEventTitleOnBanner,
        customBody,
        // No qrDataUrl — cid:qr_code is used for actual email send
      });
      const subjectLabel = tableNumber != null
        ? `Table #${tableNumber}`
        : rowLabel && seatPos
          ? `Seat ${rowLabel}${seatPos}`
          : `Seat #${rsvp.seatNumber}`;
      await sendEmail({
        to: rsvp.email,
        subject: `Your Entry Pass — ${subjectLabel} | ${event.title}`,
        html,
        attachments,
      });
      console.log(`✉️  Email sent to ${rsvp.email}`);
    } catch (e) {
      console.error("Notify email error:", e);
    }
  }

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  if (process.env.WATI_API_ENDPOINT && process.env.WATI_API_TOKEN) {
    try {
      const cleanPhone = rsvp.phone.replace(/[^0-9]/g, "");
      const internationalPhone = cleanPhone.startsWith("0") ? "6" + cleanPhone : cleanPhone;
      const templateName = process.env.WATI_SEAT_TEMPLATE_NAME ?? "seat_confirmed";

      const seatParam = tableNumber != null
        ? `Table ${tableNumber}`
        : rowLabel && seatPos
          ? `${rowLabel}${seatPos}`
          : String(rsvp.seatNumber);
      const result = await sendWhatsAppTemplate(internationalPhone, templateName, [
        { name: "name",  value: rsvp.name },
        { name: "event", value: event.title },
        { name: "seat",  value: seatParam },
      ]);
      console.log(`💬 WhatsApp to ${internationalPhone}:`, result);
    } catch (e) {
      console.error("Notify WhatsApp error:", e);
    }
  }

  // ── Mark notifiedAt ────────────────────────────────────────────────────────
  await adminDb
    .collection("events")
    .doc(eventId)
    .collection("rsvps")
    .doc(rsvpId)
    .update({ notifiedAt: new Date().toISOString() });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvpId, bulk, htmlBody } = req.body;

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

    // ── Bulk mode ──────────────────────────────────────────────────────────────
    if (bulk) {
      const snap = await adminDb
        .collection("events")
        .doc(eventId)
        .collection("rsvps")
        .where("status", "in", ["allocated", "checked_in"])
        .get();

      // Filter to those not yet notified (notifiedAt null or missing)
      const targets = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r: any) => !r.notifiedAt) as any[];

      if (targets.length === 0) {
        return res.status(200).json({ success: true, notified: 0, failed: 0 });
      }

      const results = await Promise.allSettled(
        targets.map((rsvp) =>
          sendOneNotification(rsvp, event, eventId, rsvp.id, htmlBody)
        )
      );

      const notified = results.filter((r) => r.status === "fulfilled").length;
      const failed   = results.filter((r) => r.status === "rejected").length;

      return res.status(200).json({ success: true, notified, failed });
    }

    // ── Single mode ────────────────────────────────────────────────────────────
    if (!rsvpId) {
      return res.status(400).json({ error: "rsvpId is required for single notification" });
    }

    const rsvpSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .doc(rsvpId)
      .get();

    if (!rsvpSnap.exists) {
      return res.status(404).json({ error: "RSVP not found" });
    }

    const rsvp = { id: rsvpSnap.id, ...rsvpSnap.data() } as any;

    if (!rsvp.qrToken) {
      return res.status(400).json({ error: "RSVP has no QR token — allocate a seat first" });
    }

    await sendOneNotification(rsvp, event, eventId, rsvpId, htmlBody);

    return res.status(200).json({ success: true, notifiedAt: new Date().toISOString() });

  } catch (err) {
    console.error("Notify error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
