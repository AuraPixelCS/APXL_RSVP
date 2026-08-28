/**
 * Email delivery tracking.
 *
 * THE PROBLEM: `notifiedAt` and `blastSentAt` were stamped the moment Resend
 * accepted a message. Acceptance is not delivery — a hard bounce, a spam
 * rejection, and a message sitting in someone's junk folder all looked
 * identical to "sent". Given how much of this project's history was spent
 * fighting Outlook and Gmail filtering, "we sent it" was the least useful thing
 * the UI could tell you.
 *
 * THE MECHANISM: every outbound message carries tags identifying the event, the
 * RSVP, and which email it is. Resend echoes those tags back on delivery
 * webhooks, which is how an async callback finds the right document without
 * needing to store a message id at send time (batch sends don't return one).
 *
 * Tag values are constrained by Resend to ASCII letters, digits, underscores
 * and dashes — Firestore ids satisfy this, but sanitise anyway.
 */

import type { EmailDeliveryStatus } from "@/types";

/** Which email a message is, for display in the admin UI. */
export type EmailKind = "confirm" | "waitlist" | "pass" | "thankyou" | "blast";

export interface ResendTag {
  name: string;
  value: string;
}

/** Resend rejects tag values outside [A-Za-z0-9_-]. */
function sanitizeTagValue(value: string): string {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

/** Tags that let a delivery webhook find the RSVP this message belongs to. */
export function deliveryTags(eventId: string, rsvpId: string, kind: EmailKind): ResendTag[] {
  return [
    { name: "event_id", value: sanitizeTagValue(eventId) },
    { name: "rsvp_id", value: sanitizeTagValue(rsvpId) },
    { name: "kind", value: sanitizeTagValue(kind) },
  ];
}

/** Pull our identifiers back out of a webhook payload's tags. */
export function readDeliveryTags(
  tags: unknown,
): { eventId?: string; rsvpId?: string; kind?: string } {
  const out: { eventId?: string; rsvpId?: string; kind?: string } = {};

  // Resend has shipped tags both as an array of {name,value} and as a plain
  // object map. Accept either rather than silently dropping every event.
  if (Array.isArray(tags)) {
    for (const t of tags) {
      const name = (t as ResendTag)?.name;
      const value = (t as ResendTag)?.value;
      if (name === "event_id") out.eventId = value;
      else if (name === "rsvp_id") out.rsvpId = value;
      else if (name === "kind") out.kind = value;
    }
  } else if (tags && typeof tags === "object") {
    const map = tags as Record<string, string>;
    if (map.event_id) out.eventId = map.event_id;
    if (map.rsvp_id) out.rsvpId = map.rsvp_id;
    if (map.kind) out.kind = map.kind;
  }

  return out;
}

/** Resend webhook event type → the status we store. */
export function statusFromWebhookType(type: string): EmailDeliveryStatus | null {
  switch (type) {
    case "email.sent": return "sent";
    case "email.delivered": return "delivered";
    case "email.opened": return "opened";
    case "email.clicked": return "clicked";
    case "email.bounced": return "bounced";
    case "email.complained": return "complained";
    case "email.delivery_delayed": return "delayed";
    default: return null;
  }
}

/**
 * Ranking used to decide whether an incoming event should overwrite the stored
 * status. Webhooks arrive out of order — an `opened` can land before the
 * `delivered` that preceded it — and a naive last-write-wins would downgrade
 * the record. Failures outrank everything: a bounce is the most important thing
 * to know and must never be masked by a late `sent`.
 */
const RANK: Record<EmailDeliveryStatus, number> = {
  sent: 1,
  delayed: 2,
  delivered: 3,
  opened: 4,
  clicked: 5,
  complained: 90,
  bounced: 100,
};

/** Should `incoming` replace `current` as the headline status? */
export function shouldPromoteStatus(
  current: EmailDeliveryStatus | null | undefined,
  incoming: EmailDeliveryStatus,
): boolean {
  if (!current) return true;
  return RANK[incoming] > RANK[current];
}

/** Does this status mean the guest did not receive the email? */
export function isDeliveryFailure(status: EmailDeliveryStatus | null | undefined): boolean {
  return status === "bounced" || status === "complained";
}

/** Human-facing label for the admin UI. */
export const DELIVERY_LABEL: Record<EmailDeliveryStatus, string> = {
  sent: "Sent",
  delayed: "Delayed",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  complained: "Marked spam",
  bounced: "Bounced",
};
