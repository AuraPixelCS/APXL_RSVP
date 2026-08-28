/**
 * The QR entry-pass email — one builder for every caller.
 *
 * This used to live inside pages/api/notify.ts, which meant the only way to
 * send a pass was an admin clicking "Send Entry Pass" after allocating a seat.
 * Free-seating events (Phase 4) issue the pass the moment a registration
 * lands — from the public form or from a partner's form via the Register
 * endpoint — so the builder has to be reachable from all three.
 */

import QRCode from "qrcode";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendResendEmail, type ResendAttachment, type ResendMessage } from "@/lib/resend";
import { buildSeatEmail } from "@/lib/emailTemplates";
import { formatAssignment } from "@/lib/seatLabel";
import { resolvePublicBase } from "@/lib/publicUrl";
import { resolveEntryPassBanner } from "@/lib/emailBanners";
import { formatEventDayRange, isMultiDay } from "@/lib/eventDays";
import { resolveEventSender } from "@/lib/eventSender";
import { deliveryTags } from "@/lib/emailDelivery";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function displayTitleOf(event: any): string {
  // Drop a trailing " Event" from the title for nicer copy.
  return String(event?.title ?? "").replace(/\s+Event$/i, "");
}

/**
 * Build the entry-pass message for one RSVP (no sender/tags — the caller
 * stamps those, see `stampSender`). Requires a minted `qrToken`.
 */
export async function buildEntryPassMessage(
  rsvp: any,
  event: any,
  origin: string,
): Promise<ResendMessage> {
  const publicBase = resolvePublicBase(origin);
  const displayTitle = displayTitleOf(event);
  const freeSeating = event.assignmentMode === "free";

  if (!rsvp.qrToken) {
    throw new Error(
      `RSVP ${rsvp.id ?? rsvp.email} has no qrToken — ${freeSeating ? "the pass was never minted" : "allocate a seat first"}`,
    );
  }

  // Single source of truth for the seat/table label (VIP-, mode- and style-aware).
  const assignment = formatAssignment(rsvp.seatNumber, event);
  const subjectLabel = assignment ? assignment.long : `Seat #${rsvp.seatNumber}`;

  // Inline QR as a small CID PNG (cid:qr_code) — crisp and lightweight.
  const qrDataUrl = await QRCode.toDataURL(rsvp.qrToken, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const attachments: ResendAttachment[] = [
    { filename: "qr-entry-pass.png", content: qrDataUrl.split(",")[1], contentId: "qr_code" },
  ];

  // Plain-text link that survives image-blocking in a junk folder.
  const passUrl = `${publicBase}/pass?t=${encodeURIComponent(rsvp.qrToken)}`;

  const bannerUrl = resolveEntryPassBanner(event, publicBase);
  const dateLabel = formatEventDayRange(event);

  // Optional per-event content — used generically when present.
  let dressCode: string | undefined = event.dressCode;
  let signOffName: string | undefined = event.signOffName;
  let agendaImageUrl: string | undefined = event.agendaImageUrl;
  let afterAgendaHtml: string | undefined;
  let subject = freeSeating
    ? `Your Entry Pass | ${displayTitle}`
    : `Your Entry Pass — ${subjectLabel} | ${displayTitle}`;
  let legacyBody: string | undefined;

  // TEMPORARY single-tenant bridge for the legacy PEOPLElogy anniversary event —
  // preserves its exact day-before reminder copy. New events skip this branch.
  if (String(event.title ?? "").toLowerCase().includes("peoplelogy")) {
    dressCode = dressCode ?? "Formal Elegance";
    signOffName = "PEOPLElogy Berhad";
    agendaImageUrl = `${publicBase}/EventAgenda.png`;
    const pStyle = "font-size: 14px; color: #555555; line-height: 1.6;";
    afterAgendaHtml =
      `<p style="${pStyle} margin: 0 0 16px;">We encourage you to arrive early to enjoy the networking session and cool experiences we have in store for you.</p>` +
      `<p style="${pStyle} margin: 0 0 16px;">We look forward to celebrating this special milestone together and creating memorable moments with you.</p>` +
      `<p style="${pStyle} margin: 0 0 24px;">Safe travels, and see you tomorrow!</p>`;
    subject = "See You Tomorrow as We Celebrate 25 Years Together";
    legacyBody =
      `<strong>The wait is almost over!</strong><br/><br/>` +
      `We are excited to welcome you tomorrow to the <strong>${displayTitle} Celebration</strong> as we commemorate 25 years of growth, innovation, partnerships, and success.`;
  }

  // A per-event subject override (set in the Email Editor) wins over everything.
  if (typeof event.entryPassSubject === "string" && event.entryPassSubject.trim()) {
    subject = event.entryPassSubject.trim();
  }

  const rawBody = event.customEmailBody ?? "";
  const customBody =
    rawBody.replace(/\{\{name\}\}/g, rsvp.name).replace(/\{\{event\}\}/g, event.title) || legacyBody;

  const html = buildSeatEmail({
    name: rsvp.name,
    eventTitle: displayTitle,
    eventDate: dateLabel,
    eventTime: event.time,
    venue: event.venue ?? "",
    address: event.address,
    seatNumber: rsvp.seatNumber,
    // Append the companion's seat as its own row. Without this the +1 is seated
    // in Firestore but invisible to the guest, which is only half a fix.
    assignmentRows: rsvp.plusOneSeatNumber != null
      ? [
          ...(assignment?.rows ?? []),
          {
            label: `Guest ${event.assignmentMode === "table" ? "Table" : "Seat"}`,
            value: `#${rsvp.plusOneSeatNumber}`,
          },
        ]
      : assignment?.rows,
    dressCode,
    agendaImageUrl,
    afterAgendaHtml,
    signOffName,
    bannerUrl,
    headerTitle: event.customEmailTitle,
    showTitleOnBanner: !!event.showEventTitleOnBanner,
    confirmLabel: freeSeating ? "Registration Confirmed" : undefined,
    qrCaption: isMultiDay(event)
      ? `Valid for every day of ${displayTitle} (${dateLabel}). Do not share this QR code.`
      : undefined,
    customBody,
    passUrl,
    // No qrDataUrl — the cid:qr_code PNG attachment is the real inline QR.
  });

  return {
    to: rsvp.email,
    subject,
    html,
    text: buildEntryPassText(rsvp, event, subjectLabel, { passUrl, dressCode, signOffName, displayTitle, dateLabel }),
    attachments,
  };
}

// Plain-text alternative for the entry-pass email (deliverability + a11y).
export function buildEntryPassText(
  rsvp: any,
  event: any,
  label: string,
  opts: { passUrl?: string; dressCode?: string; signOffName?: string; displayTitle: string; dateLabel?: string },
): string {
  const parts = [
    `Dear ${rsvp.name},`,
    "",
    `Here is your entry pass for ${opts.displayTitle}.`,
    "",
    `Date: ${opts.dateLabel ?? event.date}`,
  ];
  if (event.time) parts.push(`Time: ${event.time}`);
  if (event.venue) parts.push(`Venue: ${event.venue}`);
  if (opts.dressCode) parts.push(`Attire: ${opts.dressCode}`);
  parts.push(label, "");
  parts.push("Your QR entry pass is attached to this email and shown in the email above.");
  if (opts.passUrl) parts.push(`If you can't see the QR code, open your pass here: ${opts.passUrl}`);
  parts.push("", "We look forward to seeing you there.");
  if (opts.signOffName) parts.push("", "Warm regards,", opts.signOffName);
  return parts.join("\n");
}

/**
 * Stamp the event's own sender identity + delivery tags onto a message, so two
 * clients' events don't both mail as whatever RESEND_FROM happens to be, and
 * Resend's webhooks can route a bounce back to the right RSVP.
 */
export function stampSender(
  message: ResendMessage,
  event: any,
  rsvp: any,
  kind: "pass" | "thankyou",
): ResendMessage {
  const sender = resolveEventSender(event);
  if (sender.warning) console.warn("[entryPass] sender:", sender.warning);
  return {
    ...message,
    from: sender.from,
    replyTo: sender.replyTo,
    tags: deliveryTags(event.id ?? rsvp.eventId, rsvp.id, kind),
  };
}

/**
 * Send the entry pass for one RSVP and record `notifiedAt`. Returns whether
 * Resend accepted it; never throws for a delivery failure — the registration
 * already exists and the admin can resend from the panel.
 */
export async function sendEntryPass(
  rsvp: any,
  event: any,
  origin: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const message = stampSender(await buildEntryPassMessage(rsvp, event, origin), event, rsvp, "pass");
    const result = await sendResendEmail(message);
    if (!result.success) {
      console.error("[entryPass] send failed:", result.error);
      return { sent: false, error: String(result.error ?? "send failed") };
    }
    await adminDb
      .collection("events")
      .doc(event.id ?? rsvp.eventId)
      .collection("rsvps")
      .doc(rsvp.id)
      .update({ notifiedAt: new Date().toISOString() });
    return { sent: true };
  } catch (e) {
    console.error("[entryPass] build/send threw:", e);
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
