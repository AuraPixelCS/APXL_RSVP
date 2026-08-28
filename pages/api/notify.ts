import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { resolveEventSender } from "@/lib/eventSender";
import { deliveryTags } from "@/lib/emailDelivery";
import {
  isResendConfigured,
  sendResendEmail,
  sendResendBatch,
  type ResendMessage,
} from "@/lib/resend";
import {
  buildThankYouEmail,
  buildThankYouText,
  type ThankYouCta,
} from "@/lib/emailTemplates";
import { buildEntryPassMessage } from "@/lib/entryPass";

type NotifyTemplate = "pass" | "thankyou";

// Resolve a reliable, publicly-reachable base URL for the banner asset.
// The request `origin` is used when it's a real host, but when an admin
// sends from a local dev session it resolves to localhost — which recipients
// can't reach. Prefer an explicit env override, then a non-localhost request
// origin, then the production domain.
function resolvePublicBase(origin: string): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  if (origin && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin)) return origin;
  return "https://www.aurapixel.live/rsvp";
}

// Resend's batch endpoint sends up to 100 messages per HTTP call.
const RESEND_BATCH_SIZE = 100;

// ─── Build the thank-you email for one RSVP ─────────────────────────────────

function buildThankYouMessage(
  rsvp: any,
  event: any,
  origin: string,
): ResendMessage {
  const publicBase = resolvePublicBase(origin);

  // Drop a trailing " Event" from the title for nicer copy.
  const displayTitle = String(event.title ?? "").replace(/\s+Event$/i, "");

  // Admin-provided banner URL, or fall back to the hosted EmailBanner.png.
  const bannerUrl: string = event.customEmailBanner ?? `${publicBase}/EmailBanner.png`;

  // Default: a generic, event-driven thank-you with no baked-in branding or
  // external links, so any future event gets a correct message with no code
  // change. Per-event overrides can live on the event doc (thankYou* fields).
  let orgName: string = event.thankYouOrgName || displayTitle;
  let subject = `Thank You for Joining ${displayTitle}`;
  let ctas: ThankYouCta[] = Array.isArray(event.thankYouCtas) ? event.thankYouCtas : [];

  // TEMPORARY single-tenant bridge for the legacy PEOPLElogy event — preserves
  // its exact subject/body/links until the per-event thank-you editor (Phase 2)
  // lands. New events never enter this branch, so they never inherit this copy.
  if (String(event.title ?? "").toLowerCase().includes("peoplelogy")) {
    orgName = "PEOPLElogy Berhad";
    subject = "Thank You for Celebrating PEOPLElogy's 25th Anniversary With Us";
    ctas = [
      {
        label: "📸  View Event Photos Here",
        url: "https://harimau.run/peoplelogy26",
        blurb:
          "We're delighted to share a special keepsake from the event. Click below and scan your face — our system will securely retrieve photos featuring you from the celebration.",
      },
      {
        label: "🤖  Take the IMAIREADY AI Readiness Assessment",
        url: "https://imaiready.asia",
        blurb:
          "As we look to the future, take the complimentary IMAIREADY AI Readiness Assessment for insights into your organisation's AI maturity, growth opportunities, and areas for development.",
      },
    ];
  }

  // A per-event subject override (set in the Email Editor) wins over everything.
  if (typeof event.thankYouSubject === "string" && event.thankYouSubject.trim()) {
    subject = event.thankYouSubject.trim();
  }

  return {
    to: rsvp.email,
    subject,
    html: buildThankYouEmail({ name: rsvp.name, eventTitle: displayTitle, bannerUrl, orgName, ctas }),
    text: buildThankYouText({ name: rsvp.name, eventTitle: displayTitle, orgName, ctas }),
  };
}

// Pick the builder for the requested template. Thank-you is the default so
// existing callers are unchanged; "pass" sends the QR entry pass (built in
// lib/entryPass.ts, shared with intake so free-seating events can send it
// straight from registration).
async function buildMessage(
  rsvp: any,
  event: any,
  origin: string,
  template: NotifyTemplate,
): Promise<ResendMessage> {
  const message =
    template === "pass"
      ? await buildEntryPassMessage(rsvp, event, origin)
      : await buildThankYouMessage(rsvp, event, origin);

  // Stamp this event's own sender identity onto every outbound message, so two
  // clients' events don't both mail as whatever RESEND_FROM happens to be.
  const sender = resolveEventSender(event);
  return {
    ...message,
    from: sender.from,
    replyTo: sender.replyTo,
    // Tags come back on Resend's delivery webhooks, which is how an async
    // callback knows which RSVP a bounce belongs to.
    tags: deliveryTags(event.id ?? rsvp.eventId, rsvp.id, template === "pass" ? "pass" : "thankyou"),
  };
}

// ─── Mark notifiedAt for one RSVP ───────────────────────────────────────────

async function markNotified(eventId: string, rsvpId: string): Promise<void> {
  await adminDb
    .collection("events")
    .doc(eventId)
    .collection("rsvps")
    .doc(rsvpId)
    .update({ notifiedAt: new Date().toISOString() });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isResendConfigured()) {
    return res.status(500).json({ error: "RESEND_API_KEY is not configured" });
  }

  const { eventId, rsvpId, bulk, all } = req.body;
  // Which email to send. Default "thankyou" preserves existing behaviour;
  // "pass" sends the QR entry pass (pre-event).
  const template: NotifyTemplate = req.body?.template === "pass" ? "pass" : "thankyou";

  if (!eventId) {
    return res.status(400).json({ error: "eventId is required" });
  }

  // Origin for the hosted banner URL (includes the app basePath).
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

    // ── Bulk mode ────────────────────────────────────────────────────────────
    if (bulk) {
      const snap = await adminDb
        .collection("events")
        .doc(eventId)
        .collection("rsvps")
        .where("status", "in", ["allocated", "checked_in"])
        .get();

      // Default: only those not yet notified. When `all` is true, re-send to
      // every allocated/checked-in guest (used to resend an updated email).
      const targets = (snap.docs
        .map((d) => ({ id: d.id, ...d.data() })) as any[])
        .filter((r: any) => all || !r.notifiedAt);

      if (targets.length === 0) {
        return res.status(200).json({ success: true, notified: 0, failed: 0 });
      }

      // Build every email up front, then send via Resend's batch API in chunks
      // of 100 — one HTTP request per chunk, no rate-limit 429s.
      const messages = await Promise.all(
        targets.map((rsvp) => buildMessage(rsvp, event, origin, template))
      );

      let notified = 0;
      let failed = 0;

      for (let i = 0; i < messages.length; i += RESEND_BATCH_SIZE) {
        const chunk = messages.slice(i, i + RESEND_BATCH_SIZE);
        const chunkTargets = targets.slice(i, i + RESEND_BATCH_SIZE);
        const result = await sendResendBatch(chunk);

        if (result.success) {
          notified += chunk.length;
          await Promise.allSettled(
            chunkTargets.map((rsvp) => markNotified(eventId, rsvp.id))
          );
        } else {
          failed += chunk.length;
          console.error("Bulk notify batch error:", result.error);
        }
      }

      return res.status(200).json({ success: true, notified, failed });
    }

    // ── Single mode ──────────────────────────────────────────────────────────
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

    const message = await buildMessage(rsvp, event, origin, template);
    const result = await sendResendEmail(message);
    if (result.success) {
      console.log(`✉️  Thank you email sent to ${rsvp.email}`);
    } else {
      console.error("Notify email error:", result.error);
    }

    await markNotified(eventId, rsvpId);

    return res.status(200).json({ success: true, notifiedAt: new Date().toISOString() });

  } catch (err) {
    console.error("Notify error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
