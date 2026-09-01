/**
 * Registration intake — the one place a new RSVP is written.
 *
 * pages/api/rsvp/submit.ts owned this logic (duplicate guard + capacity check in
 * a single transaction). Phase 4 adds a second entry point — a partner's form
 * calling /api/integrations/register — and two copies of a check-then-write
 * transaction is how the two paths drift and one of them double-books.
 *
 * FREE SEATING: when the event's `assignmentMode` is "free" there is nothing to
 * allocate, so an accepted registration is written straight to `allocated`
 * with a minted qrToken. That keeps every downstream consumer (scanner,
 * notify's bulk query, the check-in stats) working unchanged — to them a
 * free-seating registrant looks exactly like a seated one whose seat is null.
 */

import { adminDb } from "@/lib/firebaseAdmin";
import { sendResendEmail } from "@/lib/resend";
import {
  buildRsvpConfirmEmail,
  buildRsvpConfirmText,
  buildWaitlistEmail,
  buildWaitlistText,
} from "@/lib/emailTemplates";
import { loadPeoplelogyEmailBanner } from "@/lib/emailBanners";
import { getTotalSeatCount } from "@/lib/seating";
import { capacityOf, checkCapacity, decideIntake, type IntakeDecision } from "@/lib/capacity";
import { buildManageUrl } from "@/lib/manageToken";
import { deliveryTags } from "@/lib/emailDelivery";
import { resolveEventSender } from "@/lib/eventSender";
import { generateQRPayload, signQRPayload } from "@/lib/qr";
import { eventTimezone } from "@/lib/eventTime";
import {
  normalizeEmail,
  rsvpDocId,
  isAlreadyExistsError,
} from "@/lib/rsvpIdentity";
import type { RSVPStatus } from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface IntakeInput {
  name: string;
  email: string;
  phone: string;
  attending?: boolean;
  plusOne?: boolean;
  plusOneName?: string | null;
  dietaryRestrictions?: string | null;
  message?: string | null;
  partOf?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  industry?: string | null;
  // Provenance (Phase 4)
  source?: "form" | "integration" | "admin" | "csv";
  externalRef?: string | null;
  ticketType?: string | null;
  days?: string[] | null;
  consent?: boolean | null;
  // Payment (Phase 5): true → write the record as "unpaid" — no capacity
  // check (it holds no seat), no QR mint, no email. Confirmed later by an
  // admin or by the partner re-sending the registration as paid.
  paymentPending?: boolean;
  paymentMethod?: string | null;
}

export class IntakeError extends Error {
  code: "duplicate" | "full";
  remaining?: number;
  constructor(code: "duplicate" | "full", message: string, remaining?: number) {
    super(message);
    this.code = code;
    this.remaining = remaining;
  }
}

export interface IntakeResult {
  id: string;
  decision: IntakeDecision;
  status: RSVPStatus;
  /** Minted immediately on free-seating events; null otherwise (allocation mints it). */
  qrToken: string | null;
  /** The document as written — what the email builders need. */
  rsvp: Record<string, any> & { id: string; eventId: string };
}

const trimOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Create one RSVP under `events/{eventId}/rsvps`, atomically guarding against
 * duplicates and over-capacity. Throws IntakeError("duplicate" | "full").
 */
export async function createRsvp(eventId: string, event: any, input: IntakeInput): Promise<IntakeResult> {
  const rsvpsRef = adminDb.collection("events").doc(eventId).collection("rsvps");
  const normalizedEmail = normalizeEmail(input.email);
  const isAttending = input.attending !== false;
  const wantsPlusOne = input.plusOne === true;
  const freeSeating = event.assignmentMode === "free";

  const capacity = capacityOf(
    event,
    getTotalSeatCount(event.seatingConfig, Number(event.totalSeats) || 0),
  );

  const now = new Date().toISOString();
  const ref = rsvpsRef.doc(rsvpDocId(eventId, normalizedEmail));

  const base = {
    eventId,
    name: input.name.trim(),
    email: normalizedEmail,
    phone: input.phone.trim(),
    attending: isAttending,
    plusOne: wantsPlusOne,
    plusOneName: trimOrNull(input.plusOneName),
    dietaryRestrictions: trimOrNull(input.dietaryRestrictions),
    message: trimOrNull(input.message),
    partOf: trimOrNull(input.partOf),
    company: trimOrNull(input.company),
    jobTitle: trimOrNull(input.jobTitle),
    industry: trimOrNull(input.industry),
    source: input.source ?? "form",
    externalRef: trimOrNull(input.externalRef),
    ticketType: trimOrNull(input.ticketType),
    days: Array.isArray(input.days) && input.days.length ? input.days.map(String) : null,
    consent: typeof input.consent === "boolean" ? input.consent : null,
    paymentMethod: trimOrNull(input.paymentMethod),
    paymentConfirmedAt: null as string | null,
    paymentConfirmedBy: null as { uid: string; displayName: string } | null,
    status: "pending" as RSVPStatus,
    waitlistedAt: null as string | null,
    promotedAt: null,
    seatNumber: null as number | null,
    plusOneSeatNumber: null,
    qrToken: null as string | null,
    plusOneQrToken: null,
    qrIssuedAt: null as string | null,
    allocatedBy: null as { uid: string; displayName: string } | null,
    whatsappConfirmSent: false,
    whatsappQRSent: false,
    // Explicit null rather than absent: the field is declared required, and
    // its absence breaks the natural server-side "not yet notified" query.
    notifiedAt: null,
    submittedAt: now,
    updatedAt: now,
  };

  // One transaction covers BOTH guards, because both are check-then-write:
  //
  //   - Duplicate: the id is derived from (eventId, email) and written with
  //     create(), so two simultaneous submissions race for the same id and
  //     exactly one wins.
  //   - Capacity: counting seats and then writing in a separate step would
  //     let two guests both claim the last chair. The count is taken inside
  //     the transaction, so a concurrent write forces a retry.
  let written: typeof base = base;
  let decision: IntakeDecision = "accept";
  try {
    decision = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(rsvpsRef);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as {
        id: string; email?: string; status?: string; attending?: boolean; plusOne?: boolean;
      });

      if (rows.some((r) => r.id === ref.id || normalizeEmail(r.email ?? "") === normalizedEmail)) {
        throw new IntakeError("duplicate", "already registered");
      }

      // Awaiting payment: no capacity check (the record holds no seat until
      // payment is confirmed) and nothing minted — the record is the whole point.
      if (input.paymentPending && isAttending) {
        written = { ...base, status: "unpaid" as RSVPStatus };
        tx.create(ref, written);
        return "accept";
      }

      let outcome: IntakeDecision = "accept";
      if (isAttending) {
        const check = checkCapacity(rows, { attending: true, plusOne: wantsPlusOne }, capacity);
        outcome = decideIntake(check, event.waitlistEnabled);
        if (outcome === "reject") {
          throw new IntakeError("full", "event is full", check.remaining);
        }
      }

      let status: RSVPStatus = !isAttending ? "not_attending" : outcome === "waitlist" ? "waitlisted" : "pending";
      let qrToken: string | null = null;
      let qrIssuedAt: string | null = null;
      let allocatedBy: { uid: string; displayName: string } | null = null;

      // Free seating: accepted → pass minted here, nothing left to allocate.
      if (freeSeating && isAttending && outcome === "accept") {
        qrToken = signQRPayload(
          generateQRPayload(ref.id, eventId, null, event.date, event.time, eventTimezone(event)),
        );
        qrIssuedAt = now;
        status = "allocated";
        allocatedBy = { uid: "system", displayName: "Free seating" };
      }

      written = {
        ...base,
        status,
        qrToken,
        qrIssuedAt,
        allocatedBy,
        waitlistedAt: outcome === "waitlist" ? now : null,
      };
      tx.create(ref, written);
      return outcome;
    });
  } catch (e) {
    if (e instanceof IntakeError) throw e;
    if (isAlreadyExistsError(e)) throw new IntakeError("duplicate", "already registered");
    throw e;
  }

  return {
    id: ref.id,
    decision,
    status: written.status,
    qrToken: written.qrToken,
    rsvp: { id: ref.id, ...written },
  };
}

/**
 * The post-registration email for a SEATED event: "RSVP received" (a seat
 * follows once allocated) or "you're on the waitlist". Free-seating events
 * send the entry pass instead — see lib/entryPass.ts.
 */
export async function sendIntakeEmail(
  rsvp: IntakeResult["rsvp"],
  event: any,
  origin: string,
  kind: "confirm" | "waitlist",
): Promise<{ sent: boolean; error?: string }> {
  try {
    let bannerUrl: string | undefined = event.customRsvpConfirmBanner;
    let attachments;
    if (!bannerUrl) {
      const fallback = loadPeoplelogyEmailBanner(event.title, "rsvp_banner");
      bannerUrl = fallback.bannerUrl;
      if (fallback.attachment) attachments = [fallback.attachment];
    }
    const manageUrl = buildManageUrl(origin, rsvp.id, rsvp.eventId);
    const sender = resolveEventSender(event);
    if (sender.warning) console.warn("[intake] sender:", sender.warning);

    const common = {
      name: rsvp.name,
      eventTitle: event.title,
      eventDate: event.date,
      venue: event.venue ?? "",
      address: event.address,
      bannerUrl,
      showTitleOnBanner: !!event.showEventTitleOnBanner,
      manageUrl,
    };
    const isWaitlisted = kind === "waitlist";
    const result = await sendResendEmail({
      to: rsvp.email,
      subject: isWaitlisted
        ? (typeof event.waitlistSubject === "string" && event.waitlistSubject.trim()) ||
          `You're on the waitlist – ${event.title}`
        : (typeof event.rsvpConfirmSubject === "string" && event.rsvpConfirmSubject.trim()) ||
          `RSVP Confirmation – ${event.title}`,
      html: isWaitlisted
        ? buildWaitlistEmail(common)
        : buildRsvpConfirmEmail({ ...common, eventTime: event.time }),
      text: isWaitlisted
        ? buildWaitlistText(common)
        : buildRsvpConfirmText({ ...common, eventTime: event.time }),
      attachments,
      from: sender.from,
      replyTo: sender.replyTo,
      tags: deliveryTags(rsvp.eventId, rsvp.id, kind),
    });
    if (!result.success) return { sent: false, error: String(result.error ?? "send failed") };
    return { sent: true };
  } catch (e) {
    console.error("[intake] email threw:", e);
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
