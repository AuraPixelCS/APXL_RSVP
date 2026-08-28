import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendResendEmail } from "@/lib/resend";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import {
  buildRsvpConfirmEmail,
  buildRsvpConfirmText,
  buildWaitlistEmail,
  buildWaitlistText,
} from "@/lib/emailTemplates";
import { loadPeoplelogyEmailBanner } from "@/lib/emailBanners";
import { isRsvpDeadlinePassed } from "@/lib/eventTime";
import { getTotalSeatCount } from "@/lib/seating";
import { capacityOf, checkCapacity, decideIntake, type IntakeDecision } from "@/lib/capacity";
import { buildManageUrl } from "@/lib/manageToken";
import { publicBaseFor } from "@/lib/publicUrl";
import { deliveryTags } from "@/lib/emailDelivery";
import { resolveEventSender } from "@/lib/eventSender";
import {
  normalizeEmail,
  rsvpDocId,
  rsvpEmailAlreadyExists,
  isAlreadyExistsError,
} from "@/lib/rsvpIdentity";

// Best-effort in-memory rate limiter (per IP). This is a public endpoint that
// sends an email + WhatsApp on every call, so it must not be trivially abusable.
// Serverless instances are ephemeral and horizontally scaled, so this throttles
// a single hot instance rather than guaranteeing a global cap — a shared store
// (e.g. Upstash Redis) is the durable fix (roadmap). It still blunts rapid-fire abuse.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 5; // submissions per IP per window
const rlHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rlHits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (recent.length >= RL_MAX) {
    rlHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  rlHits.set(ip, recent);
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) {
      if (v.every((t) => now - t >= RL_WINDOW_MS)) rlHits.delete(k);
    }
  }
  return false;
}

// Field length caps — bound abuse and junk records on this public endpoint.
const FIELD_MAX_LEN: Record<string, number> = {
  name: 120, email: 200, phone: 32, plusOneName: 120,
  dietaryRestrictions: 300, message: 1000, partOf: 120,
  company: 160, jobTitle: 160, industry: 120,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many submissions. Please try again in a minute." });
  }

  const { eventId, name, email, phone, attending, plusOne, plusOneName, dietaryRestrictions, message, partOf, company, jobTitle, industry } = req.body;

  if (!eventId || !name || !email || !phone) {
    return res.status(400).json({ error: "eventId, name, email, and phone are required" });
  }

  // Reject oversized fields before doing any work.
  for (const [field, max] of Object.entries(FIELD_MAX_LEN)) {
    const val = (req.body as Record<string, unknown>)?.[field];
    if (typeof val === "string" && val.length > max) {
      return res.status(400).json({ error: `${field} exceeds the maximum length` });
    }
  }

  try {
    // Verify event exists and is active
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;
    if (!event.isActive) {
      return res.status(400).json({ error: "This event is no longer accepting RSVPs" });
    }

    // Deadline — evaluated in the EVENT's timezone, not the server's. See
    // lib/eventTime.ts: `setHours` here meant UTC on Vercel, which let guests
    // RSVP roughly 8 hours past a Malaysian cut-off.
    if (isRsvpDeadlinePassed(event)) {
      return res.status(400).json({ error: "RSVP deadline has passed" });
    }

    const rsvpsRef = adminDb.collection("events").doc(eventId).collection("rsvps");
    const normalizedEmail = normalizeEmail(email);

    // Fast path: a clear message for the common "I already RSVPed" case. This
    // now queries the NORMALISED address — the old code compared the raw input
    // against the lower-cased stored value, so it missed anyone who typed a
    // capital letter. The real guard is the atomic `.create()` below.
    if (await rsvpEmailAlreadyExists(rsvpsRef, eventId, normalizedEmail)) {
      return res.status(400).json({ error: "You have already submitted an RSVP for this event" });
    }

    const isAttending = attending !== false;
    const wantsPlusOne = plusOne === true;
    const capacity = capacityOf(
      event,
      getTotalSeatCount(event.seatingConfig, Number(event.totalSeats) || 0),
    );

    const now = new Date().toISOString();
    const rsvpData = {
      eventId,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      attending: isAttending,
      plusOne: wantsPlusOne,
      plusOneName: plusOneName?.trim() || null,
      dietaryRestrictions: dietaryRestrictions?.trim() || null,
      message: message?.trim() || null,
      partOf: partOf?.trim() || null,
      company: company?.trim() || null,
      jobTitle: jobTitle?.trim() || null,
      industry: industry?.trim() || null,
      // status/waitlistedAt are decided inside the transaction below, where the
      // capacity count and the write happen together.
      status: "pending" as string,
      waitlistedAt: null as string | null,
      promotedAt: null,
      seatNumber: null,
      plusOneSeatNumber: null,
      qrToken: null,
      plusOneQrToken: null,
      qrIssuedAt: null,
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
    const ref = rsvpsRef.doc(rsvpDocId(eventId, normalizedEmail));
    let decision: IntakeDecision = "accept";

    try {
      decision = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(rsvpsRef);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as {
          id: string; email?: string; status?: string; attending?: boolean; plusOne?: boolean;
        });

        if (rows.some((r) => r.id === ref.id || normalizeEmail(r.email ?? "") === normalizedEmail)) {
          throw Object.assign(new Error("DUPLICATE"), { duplicate: true });
        }

        let outcome: IntakeDecision = "accept";
        if (isAttending) {
          const check = checkCapacity(rows, { attending: true, plusOne: wantsPlusOne }, capacity);
          outcome = decideIntake(check, event.waitlistEnabled);
          if (outcome === "reject") {
            throw Object.assign(new Error("FULL"), { full: true, remaining: check.remaining });
          }
        }

        tx.create(ref, {
          ...rsvpData,
          status: !isAttending ? "not_attending" : outcome === "waitlist" ? "waitlisted" : "pending",
          waitlistedAt: outcome === "waitlist" ? now : null,
        });
        return outcome;
      });
    } catch (e) {
      const err = e as { duplicate?: boolean; full?: boolean; remaining?: number };
      if (err.duplicate || isAlreadyExistsError(e)) {
        return res.status(400).json({ error: "You have already submitted an RSVP for this event" });
      }
      if (err.full) {
        return res.status(409).json({
          full: true,
          error:
            wantsPlusOne && err.remaining === 1
              ? "Only one seat is left, so we can't seat you and your guest together. Please contact the organiser."
              : "This event is fully booked.",
        });
      }
      throw e;
    }

    // Send confirmation email — must be awaited before response so Vercel doesn't freeze the function
    try {
      let bannerUrl: string | undefined = event.customRsvpConfirmBanner;
      let attachments;
      if (!bannerUrl) {
        const fallback = loadPeoplelogyEmailBanner(event.title, "rsvp_banner");
        bannerUrl = fallback.bannerUrl;
        if (fallback.attachment) attachments = [fallback.attachment];
      }
      const origin = publicBaseFor(req);
      const manageUrl = buildManageUrl(origin, ref.id, eventId);

      const sender = resolveEventSender(event);
      if (sender.warning) console.warn("[submit] sender:", sender.warning);

      // A waitlisted guest must NOT get the confirmation email — it says a seat
      // is reserved, which is exactly what hasn't happened.
      const isWaitlisted = decision === "waitlist";

      const waitlistOpts = {
        name: rsvpData.name,
        eventTitle: event.title,
        eventDate: event.date,
        venue: event.venue ?? "",
        address: event.address,
        bannerUrl,
        showTitleOnBanner: !!event.showEventTitleOnBanner,
        manageUrl,
      };
      const confirmOpts = {
        name: rsvpData.name,
        eventTitle: event.title,
        eventDate: event.date,
        eventTime: event.time,
        venue: event.venue ?? "",
        address: event.address,
        bannerUrl,
        showTitleOnBanner: !!event.showEventTitleOnBanner,
        manageUrl,
      };

      const emailResult = await sendResendEmail({
        to: rsvpData.email,
        subject: isWaitlisted
          ? (typeof event.waitlistSubject === "string" && event.waitlistSubject.trim()) ||
            `You're on the waitlist – ${event.title}`
          : (typeof event.rsvpConfirmSubject === "string" && event.rsvpConfirmSubject.trim()) ||
            `RSVP Confirmation – ${event.title}`,
        html: isWaitlisted ? buildWaitlistEmail(waitlistOpts) : buildRsvpConfirmEmail(confirmOpts),
        text: isWaitlisted ? buildWaitlistText(waitlistOpts) : buildRsvpConfirmText(confirmOpts),
        attachments,
        from: sender.from,
        replyTo: sender.replyTo,
        tags: deliveryTags(eventId, ref.id, isWaitlisted ? "waitlist" : "confirm"),
      });
      console.log("✉️ EMAIL LOG:", emailResult);
    } catch (e) {
      console.error("Email throw:", e);
    }

    // Send WhatsApp confirmation — awaited for same reason
    if (process.env.WATI_API_ENDPOINT && process.env.WATI_API_TOKEN) {
      try {
        const templateName = process.env.WATI_TEMPLATE_NAME || "rsvp_confirmation";
        const cleanPhone = rsvpData.phone.replace(/[^0-9]/g, '');
        const internationalPhone = cleanPhone.startsWith('0') ? '6' + cleanPhone : cleanPhone;
        console.log(`Sending WATI WhatsApp to ${internationalPhone} using template ${templateName}`);
        const waResult = await sendWhatsAppTemplate(internationalPhone, templateName, [
          { name: "name", value: rsvpData.name },
          { name: "event", value: event.title },
        ]);
        console.log("💬 WATI LOG:", waResult);
      } catch (e) {
        console.error("WATI throw:", e);
      }
    }

    return res.status(201).json({
      success: true,
      rsvpId: ref.id,
      // The form renders a different confirmation for a waitlisted guest —
      // telling them their RSVP succeeded without saying they have no seat is
      // how someone turns up to a full room.
      status: decision === "waitlist" ? "waitlisted" : rsvpData.status,
      waitlisted: decision === "waitlist",
      message:
        decision === "waitlist"
          ? "Added to the waitlist"
          : "RSVP submitted successfully",
    });
  } catch (err) {
    console.error("RSVP submit error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
