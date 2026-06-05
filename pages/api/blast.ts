import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { sendResendBatch } from "@/lib/resend";
import { buildBlastEmail, buildBlastText } from "@/lib/emailTemplates";

// Unsubscribe contact for the List-Unsubscribe header (deliverability signal —
// Gmail/Yahoo bulk guidelines + Outlook trust). Reply-to address, else the
// sender mailbox on the verified domain.
const UNSUB_MAILTO = process.env.RESEND_REPLY_TO ?? "events@aurapixel.live";

// ─── Send an ad-hoc email blast to selected guests ──────────────────────────
//
// A general announcement — no QR, no seat info, no calendar CTA. Just the
// event's banner + the admin's subject and message body. Sent via Resend
// (verified domain, no Gmail concurrency/daily-cap limits). Independent of
// `notifiedAt`; stamps `blastSentAt` per recipient so a re-send can target
// only those who haven't received it yet.

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, subject, body, rsvpIds } = req.body as {
    eventId?: string;
    subject?: string;
    body?: string;
    rsvpIds?: string[];
  };

  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" });
  }
  if (!subject?.trim()) {
    return res.status(400).json({ error: "subject is required" });
  }
  if (!body?.trim()) {
    return res.status(400).json({ error: "body is required" });
  }
  if (!Array.isArray(rsvpIds) || rsvpIds.length === 0) {
    return res.status(400).json({ error: "rsvpIds must be a non-empty array" });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "Email is not configured (missing RESEND_API_KEY)" });
  }

  try {
    // Fetch event
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;

    // Resolve banner once. Unlike the transactional emails (which embed the
    // PEOPLElogy banner as a CID attachment), the blast references it by its
    // HOSTED public URL — the same image, rendered identically, but it keeps
    // each message tiny. Falls back to the public EmailBanner.png for
    // PEOPLElogy events when no custom banner URL is set.
    let bannerUrl: string | undefined = event.customRsvpConfirmBanner;
    if (!bannerUrl && event.title.toLowerCase().includes("peoplelogy")) {
      const proto = (req.headers["x-forwarded-proto"] as string) || "https";
      const host = req.headers.host;
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      if (host) bannerUrl = `${proto}://${host}${basePath}/EmailBanner.png`;
    }

    // Fetch the selected RSVPs, skipping any that declined.
    const refs = rsvpIds.map((id) =>
      adminDb.collection("events").doc(eventId).collection("rsvps").doc(id)
    );
    const snaps = await adminDb.getAll(...refs);
    const targets = snaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...s.data() }) as any)
      .filter((r) => r.status !== "not_attending" && r.email);

    if (targets.length === 0) {
      return res.status(200).json({ success: true, sent: 0, failed: 0 });
    }

    // Build one personalized message per recipient…
    const messages = targets.map((rsvp) => {
      const subbedSubject = subject
        .replace(/\{\{name\}\}/g, rsvp.name)
        .replace(/\{\{event\}\}/g, event.title);
      const subbedBody = body
        .replace(/\{\{name\}\}/g, rsvp.name)
        .replace(/\{\{event\}\}/g, event.title);

      const blastOpts = {
        name: rsvp.name,
        eventTitle: event.title,
        body: subbedBody,
        eventDate: event.date,
        eventTime: event.time,
        venue: event.venue,
        address: event.address,
        bannerUrl,
        showTitleOnBanner: !!event.showEventTitleOnBanner,
      };
      return {
        to: rsvp.email,
        subject: subbedSubject,
        html: buildBlastEmail(blastOpts),
        text: buildBlastText(blastOpts),
        headers: {
          "List-Unsubscribe": `<mailto:${UNSUB_MAILTO}?subject=Unsubscribe>`,
        },
      };
    });

    // …and hand the whole batch to Resend (one fast HTTP call, ≤100/batch).
    // The client sends ~20 ids per request, so this is a single batch.
    const result = await sendResendBatch(messages);

    if (!result.success) {
      console.error("Blast send failed:", result.error);
      return res.status(200).json({ success: true, sent: 0, failed: targets.length, firstError: result.error });
    }

    // Stamp blastSentAt on every delivered recipient so a follow-up send can
    // target only those who haven't received it yet.
    const sentAt = new Date().toISOString();
    await Promise.allSettled(
      targets.map((rsvp) =>
        adminDb
          .collection("events").doc(eventId)
          .collection("rsvps").doc(rsvp.id)
          .update({ blastSentAt: sentAt })
      )
    );

    return res.status(200).json({ success: true, sent: targets.length, failed: 0 });
  } catch (err) {
    console.error("Blast error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
