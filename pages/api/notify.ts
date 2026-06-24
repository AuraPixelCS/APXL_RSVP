import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import {
  isResendConfigured,
  sendResendEmail,
  sendResendBatch,
  type ResendMessage,
} from "@/lib/resend";
import { buildThankYouEmail, buildThankYouText } from "@/lib/emailTemplates";

const THANK_YOU_SUBJECT =
  "Thank You for Celebrating PEOPLElogy's 25th Anniversary With Us";

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

  // Drop trailing " Event" so the email reads "PEOPLElogy 25th Anniversary".
  const displayTitle = event.title.replace(/\s+Event$/i, "");

  // Admin-provided banner URL, or fall back to the hosted EmailBanner.png.
  const bannerUrl: string = event.customEmailBanner ?? `${publicBase}/EmailBanner.png`;

  return {
    to: rsvp.email,
    subject: THANK_YOU_SUBJECT,
    html: buildThankYouEmail({ name: rsvp.name, eventTitle: displayTitle, bannerUrl }),
    text: buildThankYouText({ name: rsvp.name, eventTitle: displayTitle }),
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
      const messages = targets.map((rsvp) =>
        buildThankYouMessage(rsvp, event, origin)
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

    const message = buildThankYouMessage(rsvp, event, origin);
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
