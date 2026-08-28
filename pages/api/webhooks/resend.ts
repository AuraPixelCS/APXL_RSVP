/**
 * Resend delivery webhook.
 *
 * Turns "we handed it to Resend" into "the guest actually received it". Resend
 * POSTs delivery events here; each carries the tags we attached at send time,
 * which identify the event and RSVP without needing a message id stored
 * up front (batch sends never return one).
 *
 * SETUP
 *   1. Resend dashboard → Webhooks → add endpoint:
 *        https://www.aurapixel.live/rsvp/api/webhooks/resend
 *      Subscribe to email.sent, delivered, opened, clicked, bounced,
 *      complained, delivery_delayed.
 *   2. Copy the signing secret (starts `whsec_`) into RESEND_WEBHOOK_SECRET.
 *
 * SECURITY: this endpoint is public by necessity, so the Svix signature is
 * verified before anything is written. Without a configured secret the endpoint
 * REFUSES traffic rather than trusting it — an unauthenticated writer that can
 * mark any guest's mail as bounced is worse than no delivery tracking.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  readDeliveryTags,
  statusFromWebhookType,
  shouldPromoteStatus,
} from "@/lib/emailDelivery";
import type { EmailDeliveryEvent, EmailDeliveryStatus } from "@/types";

// Signature verification needs the exact bytes Resend signed, so Next must not
// parse the body first.
export const config = { api: { bodyParser: false } };

/** Keep the stored history bounded — a chatty mailbox can emit many opens. */
const MAX_EVENTS_STORED = 25;

/** Reject replays of an old signed payload. Svix's own tolerance is 5 minutes. */
const TIMESTAMP_TOLERANCE_SEC = 5 * 60;

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function headerValue(req: NextApiRequest, name: string): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/**
 * Verify a Svix signature (the scheme Resend uses).
 *
 * Signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the
 * base64-decoded secret. The header may carry several space-separated
 * `v1,<sig>` values during a secret rotation, so any match counts.
 *
 * Implemented directly rather than pulling in the `svix` package — it's ~15
 * lines of standard-library crypto and one fewer dependency in a payment-free
 * path that runs on every delivery event.
 */
function verifySignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TIMESTAMP_TOLERANCE_SEC) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${svixId}.${svixTimestamp}.${body}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  for (const part of signatureHeader.split(" ")) {
    const sig = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    const given = Buffer.from(sig);
    if (given.length === expectedBuf.length && crypto.timingSafeEqual(given, expectedBuf)) {
      return true;
    }
  }
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set — refusing unverified events");
    return res.status(503).json({ error: "Webhook not configured" });
  }

  const raw = await readRawBody(req);

  if (
    !verifySignature(
      secret,
      headerValue(req, "svix-id"),
      headerValue(req, "svix-timestamp"),
      raw,
      headerValue(req, "svix-signature"),
    )
  ) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let payload: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "Malformed payload" });
  }

  const status = statusFromWebhookType(String(payload.type ?? ""));
  if (!status) {
    // An event type we don't track. Acknowledge it — returning an error would
    // make Resend retry forever.
    return res.status(200).json({ ok: true, ignored: payload.type });
  }

  const data = payload.data ?? {};
  const { eventId, rsvpId, kind } = readDeliveryTags(data.tags);

  if (!eventId || !rsvpId) {
    // Mail sent before tagging existed, or a non-guest message. Nothing to
    // attach it to; acknowledge so it isn't retried.
    return res.status(200).json({ ok: true, unattributed: true });
  }

  const at = typeof payload.created_at === "string" ? payload.created_at : new Date().toISOString();
  const detail =
    typeof (data as { bounce?: { message?: string } }).bounce?.message === "string"
      ? (data as { bounce: { message: string } }).bounce.message
      : undefined;

  try {
    const ref = adminDb.collection("events").doc(eventId).collection("rsvps").doc(rsvpId);

    // A transaction because out-of-order webhooks race each other: two events
    // arriving together could each read the old status and both write, losing
    // one. shouldPromoteStatus decides which one is allowed to win.
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const current = snap.data() as {
        emailStatus?: EmailDeliveryStatus | null;
        emailEvents?: EmailDeliveryEvent[];
      };

      const entry: EmailDeliveryEvent = {
        status,
        at,
        ...(kind ? { kind } : {}),
        ...(detail ? { detail } : {}),
      };

      const history = [...(current.emailEvents ?? []), entry].slice(-MAX_EVENTS_STORED);
      const patch: Record<string, unknown> = { emailEvents: history };

      if (shouldPromoteStatus(current.emailStatus, status)) {
        patch.emailStatus = status;
        patch.emailStatusAt = at;
      }

      tx.update(ref, patch);
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[resend-webhook] write failed:", err);
    // 500 tells Resend to retry — the event is real, our write failed.
    return res.status(500).json({ error: "Failed to record delivery event" });
  }
}
