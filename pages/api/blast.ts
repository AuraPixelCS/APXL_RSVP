import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { sendEmail } from "@/lib/email";
import { buildBlastEmail } from "@/lib/emailTemplates";
import { loadPeoplelogyEmailBanner } from "@/lib/emailBanners";

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

    // Resolve banner once (reuses the RSVP-confirmation banner + PEOPLElogy fallback).
    let bannerUrl: string | undefined = event.customRsvpConfirmBanner;
    let attachments: any[] | undefined;
    if (!bannerUrl) {
      const fallback = loadPeoplelogyEmailBanner(event.title, "blast_banner");
      bannerUrl = fallback.bannerUrl;
      if (fallback.attachment) attachments = [fallback.attachment];
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

    const results = await Promise.allSettled(
      targets.map(async (rsvp) => {
        const subbedSubject = subject
          .replace(/\{\{name\}\}/g, rsvp.name)
          .replace(/\{\{event\}\}/g, event.title);
        const subbedBody = body
          .replace(/\{\{name\}\}/g, rsvp.name)
          .replace(/\{\{event\}\}/g, event.title);

        const html = buildBlastEmail({
          name: rsvp.name,
          eventTitle: event.title,
          body: subbedBody,
          eventDate: event.date,
          eventTime: event.time,
          venue: event.venue,
          address: event.address,
          bannerUrl,
          showTitleOnBanner: !!event.showEventTitleOnBanner,
        });

        const result = await sendEmail({
          to: rsvp.email,
          subject: subbedSubject,
          html,
          attachments,
        });
        if (!result.success) {
          throw new Error((result as any).error || (result as any).message || "send failed");
        }
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return res.status(200).json({ success: true, sent, failed });
  } catch (err) {
    console.error("Blast error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
