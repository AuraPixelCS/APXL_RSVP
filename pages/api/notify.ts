import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import {
  isResendConfigured,
  sendResendEmail,
  sendResendBatch,
  type ResendMessage,
  type ResendAttachment,
} from "@/lib/resend";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { buildSeatEmail } from "@/lib/emailTemplates";
import { formatAssignment } from "@/lib/seatLabel";
import QRCode from "qrcode";

// Resolve a reliable, publicly-reachable base URL for email assets (banner) and
// the online pass link. The request `origin` is used when it's a real host, but
// when an admin sends from a local dev session it resolves to localhost — which
// recipients can't reach (the cause of the broken banner). Prefer an explicit
// env override, then a non-localhost request origin, then the production domain.
function resolvePublicBase(origin: string): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  if (origin && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin)) return origin;
  return "https://www.aurapixel.live/rsvp";
}

// Resend's batch endpoint sends up to 100 messages per HTTP call.
const RESEND_BATCH_SIZE = 100;

// ─── Build the entry-pass email for one RSVP ────────────────────────────────
//
// The QR code is embedded INLINE as a CID attachment (small — a few KB) so it
// renders without the recipient having to "load remote images". The banner, by
// contrast, is referenced by its HOSTED public URL (it's ~185KB — embedding it
// inline across a 100-message batch would blow Resend's request-size limit, the
// same reason blast.ts uses a hosted banner). `origin` already includes the
// app basePath (e.g. https://host/rsvp).

async function buildEntryPassMessage(
  rsvp: any,
  event: any,
  origin: string,
  htmlBody?: string
): Promise<ResendMessage> {
  const rawBody = htmlBody ?? event.customEmailBody ?? "";
  const customBody = rawBody
    .replace(/\{\{name\}\}/g, rsvp.name)
    .replace(/\{\{event\}\}/g, event.title) || undefined;

  // Single source of truth for the seat/table label (VIP-, mode- and style-aware).
  const assignment = formatAssignment(rsvp.seatNumber, event);

  const isPeoplelogy = event.title.toLowerCase().includes("peoplelogy");
  const publicBase = resolvePublicBase(origin);

  // QR is embedded inline as a small CID PNG (cid:qr_code) — crisp in the inbox
  // and lightweight (keeps the email under Gmail's clipping limit). When the
  // image is blocked in junk, the prominent "View or download your entry pass"
  // button below is the fallback.
  const qrDataUrl = await QRCode.toDataURL(rsvp.qrToken, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const attachments: ResendAttachment[] = [
    {
      filename: "qr-entry-pass.png",
      content: qrDataUrl.split(",")[1],
      contentId: "qr_code",
    },
  ];

  // Banner: admin-provided URL, else the bundled PEOPLElogy banner. Hosted by
  // ABSOLUTE public URL (not the request origin, which is localhost in dev and
  // unreachable by recipients — the cause of the broken banner). Not inlined:
  // it's ~185KB and would blow the 100-message Resend batch request size.
  let bannerUrl: string | undefined = event.customEmailBanner;
  if (!bannerUrl && isPeoplelogy) {
    bannerUrl = `${publicBase}/EmailBanner.png`;
  }

  // Online fallback pass — a plain link that survives image-blocking in junk.
  const passUrl = `${publicBase}/pass?t=${encodeURIComponent(rsvp.qrToken)}`;

  // Dress code — per-event field; defaults to "Office attire" for PEOPLElogy so
  // it shows without a data write while staying configurable for other events.
  const dressCode: string | undefined =
    event.dressCode ?? (isPeoplelogy ? "Office attire" : undefined);

  const html = buildSeatEmail({
    name: rsvp.name,
    eventTitle: event.title,
    eventDate: event.date,
    eventTime: event.time,
    venue: event.venue ?? "",
    address: event.address,
    seatNumber: rsvp.seatNumber,
    assignmentRows: assignment?.rows,
    dressCode,
    bannerUrl,
    headerTitle: event.customEmailTitle,
    showTitleOnBanner: !!event.showEventTitleOnBanner,
    customBody,
    passUrl,
    // No qrDataUrl — cid:qr_code (the PNG attachment) is the inline QR for the real send.
  });

  const subjectLabel = assignment ? assignment.long : `Seat #${rsvp.seatNumber}`;

  return {
    to: rsvp.email,
    subject: `Your Entry Pass — ${subjectLabel} | ${event.title}`,
    html,
    text: buildEntryPassText(rsvp, event, subjectLabel, passUrl, dressCode),
    attachments,
  };
}

// Plain-text alternative — improves deliverability (spam score) and a11y.
function buildEntryPassText(
  rsvp: any,
  event: any,
  label: string,
  passUrl?: string,
  dressCode?: string
): string {
  const welcome = `We are pleased to welcome you to the ${event.title}${event.venue ? ` at ${event.venue}` : ""}. Your booking is confirmed.`;
  const parts = [
    `Dear ${rsvp.name},`,
    "",
    welcome,
    "",
    `Date: ${event.date}`,
    `Time: ${event.time}`,
  ];
  if (event.venue) parts.push(`Venue: ${event.venue}`);
  if (event.address) parts.push(`Address: ${event.address}`);
  if (dressCode) parts.push(`Dress Code: ${dressCode}`);
  parts.push(label);
  parts.push("");
  parts.push("Your QR entry pass is attached to this email.");
  if (passUrl) {
    parts.push(`If you can't see the QR code, open your pass here: ${passUrl}`);
  }
  parts.push("");
  parts.push("See you there!");
  return parts.join("\n");
}

// ─── WhatsApp + mark-as-notified for one RSVP ───────────────────────────────

async function sendWhatsAppAndMark(
  rsvp: any,
  event: any,
  eventId: string,
  rsvpId: string
): Promise<void> {
  const assignment = formatAssignment(rsvp.seatNumber, event);

  if (process.env.WATI_API_ENDPOINT && process.env.WATI_API_TOKEN) {
    try {
      const cleanPhone = rsvp.phone.replace(/[^0-9]/g, "");
      const internationalPhone = cleanPhone.startsWith("0") ? "6" + cleanPhone : cleanPhone;
      const templateName = process.env.WATI_SEAT_TEMPLATE_NAME ?? "seat_confirmed";

      const seatParam = assignment ? assignment.long : String(rsvp.seatNumber);
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

  if (!isResendConfigured()) {
    return res.status(500).json({ error: "RESEND_API_KEY is not configured" });
  }

  const { eventId, rsvpId, bulk, htmlBody } = req.body;

  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" });
  }

  // Origin for hosted banner + online pass link (includes the app basePath).
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const origin = host ? `${proto}://${host}${basePath}` : "";

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

      // Build every email up front, then send via Resend's batch API in chunks
      // of 100 — one HTTP request per chunk, no SMTP connection churn, no
      // per-message rate-limit 429s.
      const messages = await Promise.all(
        targets.map((rsvp) => buildEntryPassMessage(rsvp, event, origin, htmlBody))
      );

      let notified = 0;
      let failed = 0;

      for (let i = 0; i < messages.length; i += RESEND_BATCH_SIZE) {
        const chunk = messages.slice(i, i + RESEND_BATCH_SIZE);
        const chunkTargets = targets.slice(i, i + RESEND_BATCH_SIZE);
        const result = await sendResendBatch(chunk);

        if (result.success) {
          notified += chunk.length;
          // WhatsApp + mark notifiedAt only for the chunk that was accepted.
          await Promise.allSettled(
            chunkTargets.map((rsvp) =>
              sendWhatsAppAndMark(rsvp, event, eventId, rsvp.id)
            )
          );
        } else {
          failed += chunk.length;
          console.error("Bulk notify batch error:", result.error);
        }
      }

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

    const message = await buildEntryPassMessage(rsvp, event, origin, htmlBody);
    const result = await sendResendEmail(message);
    if (result.success) {
      console.log(`✉️  Email sent to ${rsvp.email}`);
    } else {
      console.error("Notify email error:", result.error);
    }

    await sendWhatsAppAndMark(rsvp, event, eventId, rsvpId);

    return res.status(200).json({ success: true, notifiedAt: new Date().toISOString() });

  } catch (err) {
    console.error("Notify error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
