import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { isRsvpDeadlinePassed, eventTimezone } from "@/lib/eventTime";
import { publicBaseFor } from "@/lib/publicUrl";
import { rsvpDocId } from "@/lib/rsvpIdentity";
import { createRsvp, sendIntakeEmail, IntakeError } from "@/lib/intake";
import { sendEntryPass } from "@/lib/entryPass";
import { generateQRPayload, signQRPayload } from "@/lib/qr";
import { syncSheetForEvents } from "@/lib/googleSheets";
import {
  normalizeRegisterPayload,
  partitionTransfer,
  resolveKeyKind,
  targetEventCode,
  ticketRule,
  TEST_EVENT_SUFFIX,
  type TicketRule,
} from "@/lib/integration";

/**
 * POST /api/integrations/register — the partner's form hands us a registration.
 *
 * Contract: docs/complimentary-pass-integration.md. Authenticated by
 * `X-API-Key`: the production key (INTEGRATION_API_KEY) writes into the real
 * events, the test key (INTEGRATION_TEST_API_KEY) into their "-TEST" twins.
 *
 * One ticket can open several events (Build Brief v3: P1 = E1 + E3, P2 = E1 +
 * E2 + E3). We keep one RSVP per event, so a P2 registration produces up to
 * three records and up to three passes — one QR per venue, which is what the
 * client's own ticketing sheet asks for ("2QR" / "3QR"). Free-seating events
 * (E1, E3) mint and email the pass here; the seated Gala (E2) records the RSVP
 * and its pass follows once a table is allocated in the panel.
 *
 * Idempotent on the partner's `externalRef` per event: the same submission
 * sent twice returns what exists and sends nothing. On a secondary event a
 * record that already exists under a DIFFERENT reference is reused rather than
 * refused — the common case is someone who took the free Summit pass and later
 * bought a BAFT ticket that includes the Summit. The primary event (the one the
 * ticket is really for) still answers 409 on a different reference.
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

type PublicStatus = "confirmed" | "waitlisted" | "pending_allocation" | "not_attending" | "awaiting_payment";

interface PassResult {
  event: { code: string | null; title: string | undefined };
  registrationId: string;
  status: PublicStatus;
  passIssued: boolean;
  emailSent: boolean;
  emailError?: string;
  /** Same externalRef seen before on this event — nothing changed. */
  duplicate?: boolean;
  /** Existing record under another reference kept as the pass for this event. */
  reused?: boolean;
  /** This pass was (re)issued as part of a delegate transfer. */
  transferred?: boolean;
}

async function findEventByCode(code: string): Promise<EventDoc | null> {
  const snap = await adminDb.collection("events").where("code", "==", code).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function publicStatus(status: string): PublicStatus {
  if (status === "allocated" || status === "checked_in") return "confirmed";
  if (status === "waitlisted") return "waitlisted";
  if (status === "not_attending") return "not_attending";
  if (status === "unpaid") return "awaiting_payment";
  return "pending_allocation";
}

/**
 * Void a registration for a delegate transfer. The record stays (paper trail);
 * `status: "cancelled"` is what makes the scanner refuse its QR.
 */
async function cancelForTransfer(
  ref: FirebaseFirestore.CollectionReference,
  doc: { id: string },
  replacement: { name: string; email: string },
): Promise<void> {
  await ref.doc(doc.id).update({
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancelReason: "transfer",
    transferredTo: { name: replacement.name, email: replacement.email },
    updatedAt: new Date().toISOString(),
  });
}

function passFromExisting(event: EventDoc, id: string, existing: any, flag: "duplicate" | "reused"): PassResult {
  return {
    event: { code: event.code ?? null, title: event.title },
    registrationId: id,
    status: publicStatus(existing.status),
    passIssued: !!existing.qrToken,
    emailSent: !!existing.notifiedAt,
    [flag]: true,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const keys = { production: process.env.INTEGRATION_API_KEY, test: process.env.INTEGRATION_TEST_API_KEY };
  if (!keys.production) {
    return res.status(503).json({ error: "integration_not_configured" });
  }
  const keyKind = resolveKeyKind(req.headers["x-api-key"], keys);
  if (!keyKind) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const suffix = keyKind === "test" ? TEST_EVENT_SUFFIX : "";

  const parsed = normalizeRegisterPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: "invalid_payload", message: parsed.error, field: parsed.field });
  }
  const reg = parsed.value;

  const rule: TicketRule | null = ticketRule(reg.ticketType);
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
    // Resolve every event the ticket opens before writing anything, so a
    // missing twin or a closed event fails the whole request cleanly.
    const events: EventDoc[] = [];
    for (const code of rule.events) {
      const ev = await findEventByCode(targetEventCode(code, suffix));
      if (!ev) {
        return res.status(422).json({
          error: "event_not_found",
          message: `No event "${targetEventCode(code, suffix)}" for ticket ${rule.code}${keyKind === "test" ? " (test twin missing)" : ""}`,
        });
      }
      if (isRsvpDeadlinePassed(ev)) {
        return res.status(422).json({ error: "registration_closed", message: `Registration for ${ev.title ?? code} has closed` });
      }
      events.push(ev);
    }

    const origin = publicBaseFor(req);
    const passes: PassResult[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const primary = i === 0;
      const rsvpsRef = adminDb.collection("events").doc(event.id).collection("rsvps");
      const docId = rsvpDocId(event.id, reg.attendee.email);

      // ── Delegate transfer ─────────────────────────────────────────────
      // Same externalRef, new person: void the old holder's record (their QR
      // stops scanning) and fall through to issue this event's pass to the
      // replacement. Requires the explicit `transfer: true` flag — without it
      // a typo'd email on a retry would silently revoke someone's pass.
      if (reg.transfer) {
        const matchesSnap = await rsvpsRef.where("externalRef", "==", reg.externalRef).get();
        const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const { existing: sameEmail, toCancel } = partitionTransfer(matches, reg.attendee.email);

        if (primary && !matches.length) {
          return res.status(422).json({
            error: "transfer_target_not_found",
            message: `No registration under "${reg.externalRef}" on ${event.title ?? event.code} — nothing to transfer`,
          });
        }
        for (const old of toCancel) {
          await cancelForTransfer(rsvpsRef, old, reg.attendee);
        }
        if (sameEmail && sameEmail.status !== "cancelled") {
          // Retry of a completed transfer (or the "new" person already held
          // this pass) — nothing to reissue.
          passes.push(passFromExisting(event, sameEmail.id, sameEmail, "duplicate"));
          continue;
        }
        // Fall through: create (or reactivate) the replacement's record below.
      }

      const existingSnap = await rsvpsRef.doc(docId).get();
      if (existingSnap.exists) {
        const existing = existingSnap.data()!;

        // An unpaid record re-sent as PAID is the partner confirming payment
        // (invoice settled / HRD claim approved): issue everything the
        // original registration withheld. Free seating mints the pass here;
        // the seated Gala moves to pending and waits for table allocation.
        if (existing.status === "unpaid" && !reg.paymentPending) {
          const freeSeating = event.assignmentMode === "free";
          const now = new Date().toISOString();
          const qrToken = existing.qrToken ?? (freeSeating
            ? signQRPayload(generateQRPayload(existingSnap.id, event.id, null, event.date, event.time, eventTimezone(event)))
            : null);
          const confirmed: Record<string, any> = {
            ...existing,
            externalRef: reg.externalRef,
            ticketType: rule.code,
            paymentMethod: reg.paymentMethod ?? existing.paymentMethod ?? null,
            paymentConfirmedAt: now,
            paymentConfirmedBy: { uid: "partner", displayName: "Partner (sent as paid)" },
            status: freeSeating ? "allocated" : "pending",
            qrToken,
            qrIssuedAt: qrToken ? existing.qrIssuedAt ?? now : null,
            allocatedBy: freeSeating ? { uid: "system", displayName: "Free seating" } : null,
            updatedAt: now,
          };
          await rsvpsRef.doc(existingSnap.id).update(confirmed);
          const rsvpForEmail = { ...confirmed, id: existingSnap.id, eventId: event.id };
          let email: { sent: boolean; error?: string } = { sent: false };
          if (confirmed.status === "allocated" && confirmed.qrToken) {
            email = await sendEntryPass(rsvpForEmail, event, origin);
          } else {
            email = await sendIntakeEmail(rsvpForEmail, event, origin, "confirm");
          }
          passes.push({
            event: { code: event.code ?? null, title: event.title },
            registrationId: existingSnap.id,
            status: publicStatus(confirmed.status),
            passIssued: !!confirmed.qrToken,
            emailSent: email.sent,
            ...(email.error ? { emailError: email.error } : {}),
          });
          continue;
        }

        // A cancelled record at this email is a re-registration, not a
        // duplicate: bring it back to life under the incoming reference.
        if (existing.status === "cancelled") {
          const freeSeating = event.assignmentMode === "free";
          const revived: Record<string, any> = {
            ...existing,
            name: reg.attendee.name,
            phone: reg.attendee.phone || existing.phone || "",
            company: reg.attendee.company ?? existing.company ?? null,
            jobTitle: reg.attendee.jobTitle ?? existing.jobTitle ?? null,
            industry: reg.attendee.industry ?? existing.industry ?? null,
            externalRef: reg.externalRef,
            ticketType: rule.code,
            status: freeSeating && existing.qrToken ? "allocated" : freeSeating ? "allocated" : "pending",
            cancelledAt: null,
            cancelReason: null,
            transferredTo: null,
            updatedAt: new Date().toISOString(),
          };
          await rsvpsRef.doc(existingSnap.id).update(revived);
          const rsvpForEmail = { ...revived, id: existingSnap.id, eventId: event.id };
          let email: { sent: boolean; error?: string } = { sent: false };
          if (revived.status === "allocated" && revived.qrToken) {
            email = await sendEntryPass(rsvpForEmail, event, origin);
          } else if (revived.status === "pending") {
            email = await sendIntakeEmail(rsvpForEmail, event, origin, "confirm");
          }
          passes.push({
            event: { code: event.code ?? null, title: event.title },
            registrationId: existingSnap.id,
            status: publicStatus(revived.status),
            passIssued: !!revived.qrToken,
            emailSent: email.sent,
            ...(email.error ? { emailError: email.error } : {}),
            ...(reg.transfer ? { transferred: true } : {}),
          });
          continue;
        }

        if (existing.externalRef && existing.externalRef === reg.externalRef) {
          passes.push(passFromExisting(event, existingSnap.id, existing, "duplicate"));
          continue;
        }
        if (primary) {
          return res.status(409).json({
            error: "duplicate_email",
            message: `This email address is already registered for ${event.title ?? event.code} under another submission`,
            registrationId: existingSnap.id,
            event: { code: event.code ?? null, title: event.title },
          });
        }
        passes.push(passFromExisting(event, existingSnap.id, existing, "reused"));
        continue;
      }

      // Single-day Summit codes carry their day; a partner-supplied list wins
      // when present. Days only mean anything on the Summit record.
      const isSummit = (event.code ?? "").startsWith("E3");
      const days = isSummit ? (reg.days ?? rule.days ?? null) : null;

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
          days,
          consent: reg.consent,
          paymentPending: reg.paymentPending,
          paymentMethod: reg.paymentMethod,
        });
      } catch (e) {
        if (e instanceof IntakeError && e.code === "duplicate") {
          // Lost a race with a concurrent identical call — read what won.
          const raced = await rsvpsRef.doc(docId).get();
          const data = raced.data() ?? {};
          if (primary && data.externalRef !== reg.externalRef) {
            return res.status(409).json({ error: "duplicate_email", message: "This email address is already registered for this event", registrationId: raced.id });
          }
          passes.push(passFromExisting(event, raced.id, data, data.externalRef === reg.externalRef ? "duplicate" : "reused"));
          continue;
        }
        if (e instanceof IntakeError && e.code === "full") {
          if (primary) {
            return res.status(409).json({ error: "event_full", message: `${event.title ?? event.code} is fully booked` });
          }
          // A secondary event at capacity must not sink a paid registration
          // that already wrote its primary record — report it and carry on.
          passes.push({
            event: { code: event.code ?? null, title: event.title },
            registrationId: "",
            status: "waitlisted",
            passIssued: false,
            emailSent: false,
            emailError: "event_full",
          });
          continue;
        }
        throw e;
      }

      // Email: the pass on a free-seating event, otherwise the intake receipt
      // (the Gala pass follows table allocation from the panel).
      let email: { sent: boolean; error?: string } = { sent: false };
      if (result.status === "allocated") {
        email = await sendEntryPass({ ...result.rsvp, id: result.id }, event, origin);
      } else if (result.status === "waitlisted") {
        email = await sendIntakeEmail(result.rsvp, event, origin, "waitlist");
      } else if (result.status === "pending") {
        email = await sendIntakeEmail(result.rsvp, event, origin, "confirm");
      }

      passes.push({
        event: { code: event.code ?? null, title: event.title },
        registrationId: result.id,
        status: publicStatus(result.status),
        passIssued: !!result.qrToken,
        emailSent: email.sent,
        ...(email.error ? { emailError: email.error } : {}),
        ...(reg.transfer ? { transferred: true } : {}),
      });
    }

    // Mirror the change into the client's Google Sheet (best-effort — a sheet
    // hiccup must never fail a registration). Test-twin traffic stays out.
    if (keyKind === "production") {
      await syncSheetForEvents(events.map((e) => e.code).filter((c): c is string => !!c));
    }

    const head = passes[0];
    const allDuplicate = passes.every((p) => p.duplicate);
    return res.status(allDuplicate ? 200 : 201).json({
      // Primary-event fields kept flat for the single-event (complimentary) case.
      registrationId: head.registrationId,
      status: head.status,
      passIssued: head.passIssued,
      emailSent: head.emailSent,
      ...(head.emailError ? { emailError: head.emailError } : {}),
      event: head.event,
      ticketType: rule.code,
      ticketLabel: rule.label,
      environment: keyKind,
      ...(reg.transfer ? { transfer: true } : {}),
      ...(allDuplicate ? { duplicate: true } : {}),
      passes,
    });
  } catch (err) {
    console.error("[integrations/register]", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
