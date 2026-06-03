import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { sendBulkEmails } from "@/lib/email";
import { buildBlastEmail } from "@/lib/emailTemplates";

// ─── Send an ad-hoc email blast to selected guests ──────────────────────────
//
// A general announcement — no QR, no seat info, no calendar CTA. Just the
// event's banner + the admin's subject and message body. Independent of
// `notifiedAt`, so it can be re-sent any number of times.

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

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(500).json({ error: "Email is not configured (missing SMTP credentials)" });
  }

  try {
    // Fetch event
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;

    // Resolve banner once. Unlike the transactional emails (which embed the
    // PEOPLElogy banner as a ~185KB CID attachment per message), the blast
    // references it by its HOSTED public URL instead. Attaching 185KB to each
    // of ~200 emails is ~35MB through one SMTP connection — enough to time the
    // serverless function out (504). A hosted URL keeps each email tiny and the
    // whole blast fast.
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

      return {
        to: rsvp.email,
        subject: subbedSubject,
        html: buildBlastEmail({
          name: rsvp.name,
          eventTitle: event.title,
          body: subbedBody,
          eventDate: event.date,
          eventTime: event.time,
          venue: event.venue,
          address: event.address,
          bannerUrl,
          showTitleOnBanner: !!event.showEventTitleOnBanner,
        }),
      };
    });

    // …and send them all over one pooled, rate-limited connection.
    const results = await sendBulkEmails(messages);

    const sent = results.filter((r) => r.success).length;
    const failed = results.length - sent;
    const firstError = results.find((r) => !r.success)?.error;
    if (firstError) console.error(`Blast: ${failed} failed. First error:`, firstError);

    return res.status(200).json({ success: true, sent, failed, firstError });
  } catch (err) {
    console.error("Blast error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Bulk sending over Gmail takes time — give the function room beyond the
// default so a large blast isn't cut off mid-send.
export const config = { maxDuration: 60 };

export default withAuth(handler, "admin");
