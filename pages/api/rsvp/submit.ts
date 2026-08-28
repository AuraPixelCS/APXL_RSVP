import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { isRsvpDeadlinePassed } from "@/lib/eventTime";
import { publicBaseFor } from "@/lib/publicUrl";
import { normalizeEmail, rsvpEmailAlreadyExists } from "@/lib/rsvpIdentity";
import { createRsvp, sendIntakeEmail, IntakeError } from "@/lib/intake";
import { sendEntryPass } from "@/lib/entryPass";

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

    // Duplicate + capacity guards, and the free-seating pass mint, all live in
    // lib/intake.ts now — shared with the partner-form Register endpoint.
    let result;
    try {
      result = await createRsvp(eventId, event, {
        name, email: normalizedEmail, phone, attending, plusOne, plusOneName,
        dietaryRestrictions, message, partOf, company, jobTitle, industry,
        source: "form",
      });
    } catch (e) {
      if (e instanceof IntakeError) {
        if (e.code === "duplicate") {
          return res.status(400).json({ error: "You have already submitted an RSVP for this event" });
        }
        return res.status(409).json({
          full: true,
          error:
            plusOne === true && e.remaining === 1
              ? "Only one seat is left, so we can't seat you and your guest together. Please contact the organiser."
              : "This event is fully booked.",
        });
      }
      throw e;
    }
    const { decision, rsvp: rsvpData } = result;

    // Email — must be awaited before responding so Vercel doesn't freeze the
    // function. Free seating: the pass itself. Seated: "RSVP received" (a seat
    // follows once allocated). Waitlisted guests get the waitlist email, never
    // the confirmation — it says a seat is reserved, which hasn't happened.
    const origin = publicBaseFor(req);
    if (result.status === "allocated") {
      await sendEntryPass(rsvpData, event, origin);
    } else if (result.status === "waitlisted") {
      await sendIntakeEmail(rsvpData, event, origin, "waitlist");
    } else if (result.status === "pending") {
      await sendIntakeEmail(rsvpData, event, origin, "confirm");
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
      rsvpId: result.id,
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
