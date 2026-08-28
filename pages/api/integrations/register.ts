import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { isRsvpDeadlinePassed } from "@/lib/eventTime";
import { publicBaseFor } from "@/lib/publicUrl";
import { rsvpDocId } from "@/lib/rsvpIdentity";
import { createRsvp, sendIntakeEmail, IntakeError } from "@/lib/intake";
import { sendEntryPass } from "@/lib/entryPass";
import {
  apiKeyMatches,
  normalizeRegisterPayload,
  targetEventCode,
  ticketRule,
} from "@/lib/integration";

/**
 * POST /api/integrations/register — a partner's form hands us a registration.
 *
 * Contract: docs/rsvp-form-integration.md §4. Authenticated by `X-API-Key`
 * (INTEGRATION_API_KEY). Idempotent on the partner's `externalRef`: the same
 * submission sent twice returns the same registration and does not send a
 * second pass. On a free-seating event the QR pass is minted here and emailed
 * before we respond, so "201 confirmed" means the guest's pass is on its way.
 *
 * Staging shares production Firestore; INTEGRATION_EVENT_SUFFIX redirects
 * writes into twin events ("E3-TEST") so a partner's test submissions never
 * land in the real guest list.
 */

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

/* eslint-disable @typescript-eslint/no-explicit-any */

type EventDoc = {
  id: string;
  code?: string;
  title?: string;
  rsvpDeadline?: string;
  timezone?: string;
  [key: string]: any;
};

async function findEvent(eventHint: string | null, ticketEventCode: string): Promise<EventDoc | null> {
  const events = adminDb.collection("events");
  const suffix = process.env.INTEGRATION_EVENT_SUFFIX;

  // Explicit event: a short code ("E3") or a Firestore document id.
  if (eventHint) {
    const byCode = await events.where("code", "==", targetEventCode(eventHint, suffix)).limit(1).get();
    if (!byCode.empty) return { id: byCode.docs[0].id, ...byCode.docs[0].data() };
    const byId = await events.doc(eventHint).get();
    if (byId.exists) return { id: byId.id, ...byId.data() };
    return null;
  }

  const snap = await events.where("code", "==", targetEventCode(ticketEventCode, suffix)).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function publicStatus(status: string): "confirmed" | "waitlisted" | "pending_allocation" | "not_attending" {
  if (status === "allocated" || status === "checked_in") return "confirmed";
  if (status === "waitlisted") return "waitlisted";
  if (status === "not_attending") return "not_attending";
  return "pending_allocation";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const expectedKey = process.env.INTEGRATION_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({ error: "integration_not_configured" });
  }
  if (!apiKeyMatches(req.headers["x-api-key"], expectedKey)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const parsed = normalizeRegisterPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: "invalid_payload", message: parsed.error, field: parsed.field });
  }
  const reg = parsed.value;

  const rule = ticketRule(reg.ticketType);
  if (!rule) {
    return res.status(422).json({ error: "unknown_ticket", message: `Unknown ticket type "${reg.ticketType}"` });
  }
  if (!rule.enabled) {
    return res.status(422).json({
      error: "ticket_not_enabled",
      message: `Ticket "${reg.ticketType}" (${rule.code}) is not open for registration through this endpoint yet`,
    });
  }

  try {
    const event = await findEvent(reg.event, rule.event);
    if (!event) {
      return res.status(422).json({ error: "event_not_found", message: `No event for ticket "${reg.ticketType}"` });
    }
    if (isRsvpDeadlinePassed(event)) {
      return res.status(422).json({ error: "registration_closed", message: "Registration for this event has closed" });
    }

    const rsvpsRef = adminDb.collection("events").doc(event.id).collection("rsvps");

    // Idempotent retry: same partner reference for the same (event, email) →
    // return what we already have, and do NOT send another pass.
    const existingSnap = await rsvpsRef.doc(rsvpDocId(event.id, reg.attendee.email)).get();
    if (existingSnap.exists) {
      const existing = existingSnap.data()!;
      if (existing.externalRef && existing.externalRef === reg.externalRef) {
        return res.status(200).json({
          registrationId: existingSnap.id,
          status: publicStatus(existing.status),
          duplicate: true,
          passIssued: !!existing.qrToken,
          emailSent: !!existing.notifiedAt,
          event: { code: event.code ?? null, title: event.title },
        });
      }
      return res.status(409).json({
        error: "duplicate_email",
        message: "This email address is already registered for this event",
        registrationId: existingSnap.id,
      });
    }

    let result;
    try {
      result = await createRsvp(event.id, event, {
        name: reg.attendee.name,
        email: reg.attendee.email,
        phone: reg.attendee.phone,
        company: reg.attendee.company,
        jobTitle: reg.attendee.jobTitle,
        industry: reg.attendee.industry,
        message: reg.message,
        source: "integration",
        externalRef: reg.externalRef,
        ticketType: rule.code,
        days: reg.days,
        consent: reg.consent,
      });
    } catch (e) {
      if (e instanceof IntakeError) {
        if (e.code === "duplicate") {
          return res.status(409).json({ error: "duplicate_email", message: "This email address is already registered for this event" });
        }
        return res.status(409).json({ error: "event_full", message: "This event is fully booked" });
      }
      throw e;
    }

    // Email: the pass on a free-seating event, otherwise the intake receipt.
    const origin = publicBaseFor(req);
    let email: { sent: boolean; error?: string } = { sent: false };
    if (result.status === "allocated") {
      email = await sendEntryPass({ ...result.rsvp, id: result.id }, event, origin);
    } else if (result.status === "waitlisted") {
      email = await sendIntakeEmail(result.rsvp, event, origin, "waitlist");
    } else if (result.status === "pending") {
      email = await sendIntakeEmail(result.rsvp, event, origin, "confirm");
    }

    return res.status(201).json({
      registrationId: result.id,
      status: publicStatus(result.status),
      passIssued: !!result.qrToken,
      emailSent: email.sent,
      ...(email.error ? { emailError: email.error } : {}),
      event: { code: event.code ?? null, title: event.title },
      ticketType: rule.code,
    });
  } catch (err) {
    console.error("[integrations/register]", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
