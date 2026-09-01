/**
 * POST /api/admin/confirm-payment — { eventId, rsvpId }
 *
 * The manual half of the corporate-billing / HRD-claim flow: the partner
 * captured the delegate as "unpaid" (no seat, no email, no QR), finance later
 * confirms the invoice or claim, and an admin presses Confirm here.
 *
 * One click settles the WHOLE ticket, not just the event the admin is looking
 * at: a P2 delegate has unpaid records on E1, E2 and E3, and confirming them
 * one event at a time would mail three passes at three different moments (or
 * worse, forget one). Sibling records are found by the ticket's event list +
 * the same email; only ones still "unpaid" are touched.
 *
 * Per event it does exactly what a paid registration would have done at
 * intake: free seating mints and emails the QR pass; a seated event moves to
 * "pending" and emails the intake receipt (its pass follows table allocation).
 * Capacity is reported but not enforced — a delegate whose payment has been
 * verified is never turned away over working seat numbers.
 */

import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { publicBaseFor } from "@/lib/publicUrl";
import { rsvpDocId } from "@/lib/rsvpIdentity";
import { sendEntryPass } from "@/lib/entryPass";
import { sendIntakeEmail } from "@/lib/intake";
import { generateQRPayload, signQRPayload } from "@/lib/qr";
import { eventTimezone } from "@/lib/eventTime";
import { ticketRule, TEST_EVENT_SUFFIX } from "@/lib/integration";
import { syncSheetForEvents } from "@/lib/googleSheets";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ConfirmedPass {
  event: { code: string | null; title?: string };
  registrationId: string;
  status: string;
  passIssued: boolean;
  emailSent: boolean;
  emailError?: string;
}

async function confirmOne(
  event: any,
  rsvpId: string,
  rsvp: any,
  origin: string,
  by: { uid: string; displayName: string },
): Promise<ConfirmedPass> {
  const freeSeating = event.assignmentMode === "free";
  const now = new Date().toISOString();
  const qrToken = rsvp.qrToken ?? (freeSeating
    ? signQRPayload(generateQRPayload(rsvpId, event.id, null, event.date, event.time, eventTimezone(event)))
    : null);
  const confirmed: Record<string, any> = {
    ...rsvp,
    status: freeSeating ? "allocated" : "pending",
    qrToken,
    qrIssuedAt: qrToken ? rsvp.qrIssuedAt ?? now : null,
    allocatedBy: freeSeating ? { uid: "system", displayName: "Free seating" } : null,
    paymentConfirmedAt: now,
    paymentConfirmedBy: by,
    updatedAt: now,
  };
  await adminDb.collection("events").doc(event.id).collection("rsvps").doc(rsvpId).update(confirmed);

  const rsvpForEmail = { ...confirmed, id: rsvpId, eventId: event.id };
  let email: { sent: boolean; error?: string } = { sent: false };
  if (confirmed.status === "allocated" && confirmed.qrToken) {
    email = await sendEntryPass(rsvpForEmail, event, origin);
  } else {
    email = await sendIntakeEmail(rsvpForEmail as any, event, origin, "confirm");
  }
  return {
    event: { code: event.code ?? null, title: event.title },
    registrationId: rsvpId,
    status: confirmed.status,
    passIssued: !!confirmed.qrToken,
    emailSent: email.sent,
    ...(email.error ? { emailError: email.error } : {}),
  };
}

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { eventId, rsvpId } = req.body as { eventId?: string; rsvpId?: string };
  if (!eventId || !rsvpId) {
    return res.status(400).json({ error: "eventId and rsvpId are required" });
  }

  try {
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) return res.status(404).json({ error: "Event not found" });
    const event: any = { id: eventSnap.id, ...eventSnap.data() };

    const rsvpSnap = await adminDb.collection("events").doc(eventId).collection("rsvps").doc(rsvpId).get();
    if (!rsvpSnap.exists) return res.status(404).json({ error: "RSVP not found" });
    const rsvp: any = rsvpSnap.data();
    if (rsvp.status !== "unpaid") {
      return res.status(409).json({ error: `This guest is "${rsvp.status}", not awaiting payment` });
    }

    const origin = publicBaseFor(req);
    const by = {
      uid: req.decodedToken.uid,
      displayName: req.decodedToken.name || req.decodedToken.email || "Admin",
    };

    const confirmed: ConfirmedPass[] = [
      await confirmOne(event, rsvpSnap.id, rsvp, origin, by),
    ];

    // Sibling unpaid records across the rest of the ticket's events — same
    // email, same environment (a "-TEST" record only ever matches twins).
    const rule = rsvp.ticketType ? ticketRule(rsvp.ticketType) : null;
    const isTest = typeof event.code === "string" && event.code.endsWith(TEST_EVENT_SUFFIX);
    if (rule && rule.events.length > 1) {
      for (const code of rule.events) {
        const target = isTest ? `${code}${TEST_EVENT_SUFFIX}` : code;
        if (target === event.code) continue;
        const sibSnap = await adminDb.collection("events").where("code", "==", target).limit(1).get();
        if (sibSnap.empty) continue;
        const sibEvent: any = { id: sibSnap.docs[0].id, ...sibSnap.docs[0].data() };
        const sibId = rsvpDocId(sibEvent.id, rsvp.email);
        const sibRsvpSnap = await adminDb.collection("events").doc(sibEvent.id).collection("rsvps").doc(sibId).get();
        if (!sibRsvpSnap.exists || sibRsvpSnap.data()!.status !== "unpaid") continue;
        confirmed.push(await confirmOne(sibEvent, sibRsvpSnap.id, sibRsvpSnap.data(), origin, by));
      }
    }

    if (!isTest) {
      await syncSheetForEvents(confirmed.map((c) => c.event.code).filter((c): c is string => !!c));
    }

    return res.status(200).json({
      success: true,
      confirmed,
      message:
        `Payment confirmed — ${confirmed.length} record${confirmed.length === 1 ? "" : "s"} activated. ` +
        confirmed
          .map((c) => `${c.event.code ?? c.event.title}: ${c.passIssued ? "pass emailed" : "pending allocation"}`)
          .join(", "),
    });
  } catch (e) {
    console.error("[admin/confirm-payment]", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
