// ─── RSVP Confirmation Email Template ────────────────────────────────────────

export interface RsvpConfirmEmailOpts {
  name: string;
  eventTitle: string;
  /** Pre-formatted display string, e.g. "19th June 2026" or raw "2026-06-19" */
  eventDate: string;
  /** "HH:MM" 24h, used to build the calendar link. Optional. */
  eventTime?: string;
  venue: string;
  address?: string;
  /** Firebase Storage URL — replaces the dark text header with an image */
  bannerUrl?: string;
  /** When true and a banner is set, render the event title in a strip below the banner */
  showTitleOnBanner?: boolean;
}

/**
 * Plain-text alternative for the RSVP confirmation. Every email should ship a
 * text part alongside the HTML — an HTML-only message is a spam signal at Gmail,
 * Outlook and most corporate filters.
 */
export function buildRsvpConfirmText(opts: RsvpConfirmEmailOpts): string {
  const venueLine = [opts.venue, opts.address].filter(Boolean).join(", ");
  const parts = [
    `Dear ${opts.name},`,
    "",
    `Thank you for your RSVP to ${opts.eventTitle}.`,
    "",
    `Date: ${opts.eventDate}`,
  ];
  if (opts.eventTime) parts.push(`Time: ${opts.eventTime}`);
  if (venueLine) parts.push(`Venue: ${venueLine}`);
  parts.push("");
  parts.push(`We look forward to welcoming you.`);
  parts.push("");
  parts.push(`The ${opts.eventTitle} Team`);
  return parts.join("\n");
}

/** Minimal shape needed to build a calendar link — satisfied by both the
 *  confirmation and blast email option objects. */
interface CalendarFields {
  eventTitle: string;
  eventDate: string;
  eventTime?: string;
  venue?: string;
  address?: string;
}

/** Build a Google Calendar TEMPLATE link from event date/time fields. */
function buildCalendarUrl(opts: CalendarFields, details?: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.eventTitle,
    location: [opts.venue, opts.address].filter(Boolean).join(", "),
    details: details ?? `RSVP confirmed for ${opts.eventTitle}.`,
  });

  // Convert YYYY-MM-DD + HH:MM into Google Calendar's expected basic ISO form.
  // Falls back to a date-only event when only YYYY-MM-DD is available.
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opts.eventDate);
  if (ymd) {
    const dateOnly = `${ymd[1]}${ymd[2]}${ymd[3]}`;
    if (opts.eventTime && /^\d{2}:\d{2}$/.test(opts.eventTime)) {
      const start = dateOnly + "T" + opts.eventTime.replace(":", "") + "00";
      const startDate = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T${opts.eventTime}:00`);
      const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
      const end =
        endDate.getFullYear() +
        String(endDate.getMonth() + 1).padStart(2, "0") +
        String(endDate.getDate()).padStart(2, "0") +
        "T" +
        String(endDate.getHours()).padStart(2, "0") +
        String(endDate.getMinutes()).padStart(2, "0") +
        "00";
      params.set("dates", `${start}/${end}`);
    } else {
      params.set("dates", `${dateOnly}/${dateOnly}`);
    }
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildRsvpConfirmEmail(opts: RsvpConfirmEmailOpts): string {
  const calendarUrl = buildCalendarUrl(opts);

  const titleStrip = opts.showTitleOnBanner
    ? `<div style="background: #0a1628; padding: 14px 20px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 700; letter-spacing: 0.3px;">${opts.eventTitle}</h1>
      </div>`
    : "";

  const header = opts.bannerUrl
    ? `<div style="line-height:0;"><img src="${opts.bannerUrl}" alt="Event Banner" style="width:100%;max-width:580px;display:block;" /></div>${titleStrip}`
    : `<div style="background: #0a1628; padding: 36px 40px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 700; letter-spacing: 0.5px;">${opts.eventTitle}</h1>
      </div>`;

  const venueLine = [opts.venue, opts.address].filter(Boolean).join(", ");

  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5e5;">

      ${header}

      <!-- Body -->
      <div style="padding: 40px 40px 32px;">
        <p style="font-size: 15px; color: #222222; margin: 0 0 20px; line-height: 1.6;">
          Dear <strong>${opts.name}</strong>,
        </p>

        <p style="font-size: 15px; color: #333333; margin: 0 0 16px; line-height: 1.7;">
          Thank you for your kind RSVP to <strong>${opts.eventTitle}</strong>.
        </p>

        <!-- Confirmation Banner -->
        <div style="background: #f0f7ff; border-left: 4px solid #1a6fd4; border-radius: 6px; padding: 16px 20px; margin: 24px 0;">
          <p style="font-size: 14px; color: #1a4a8a; margin: 0; font-weight: 600;">
            &#10003;&nbsp; Your registration has been successfully received.
          </p>
        </div>

        <p style="font-size: 15px; color: #333333; margin: 0 0 16px; line-height: 1.7;">
          Our team will share more event details with you prior to the event.
        </p>

        <!-- Event Details -->
        <div style="background: #f8f8f8; border-radius: 10px; padding: 20px 24px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #333333;">
            <tr>
              <td style="padding: 6px 0; color: #888888; width: 80px; vertical-align: top;">Date</td>
              <td style="padding: 6px 0; font-weight: 600;">${opts.eventDate}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #888888; vertical-align: top;">Venue</td>
              <td style="padding: 6px 0; font-weight: 600;">${venueLine}</td>
            </tr>
          </table>
        </div>

        <!-- Add to Google Calendar CTA -->
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 8px auto 28px;">
          <tr>
            <td align="center" style="background: #1a6fd4; border-radius: 6px;">
              <a href="${calendarUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.2px;">
                Add to Google Calendar
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size: 15px; color: #333333; margin: 0 0 28px; line-height: 1.7;">
          We look forward to welcoming you on <strong>${opts.eventDate}</strong> at <strong>${venueLine}</strong>.
        </p>

        <p style="font-size: 15px; color: #333333; margin: 0; line-height: 1.7;">
          Warm regards,<br />
          The ${opts.eventTitle} Team
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #0a1628; padding: 20px 40px; text-align: center;">
        <p style="font-size: 11px; color: #4a6a9a; margin: 0;">
          Questions about your RSVP? Just reply to this email.
        </p>
      </div>
    </div>
  `;
}

// ─── Seat Confirmation Email Template ────────────────────────────────────────
//
// Pure string function — safe to import in both server API routes and client
// bundle (e.g. email preview on the Notifications page).
//
// The QR code is embedded as a CID attachment (cid:qr_code). The caller must
// attach the QR PNG with `cid: "qr_code"` when sending via Nodemailer.

export interface SeatEmailOpts {
  name: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  address?: string;
  seatNumber: number;
  /** When provided, the info row shows "Table No. #X" instead of "Seat No. #X" */
  tableNumber?: number;
  /** When set, the email shows a "VIP Table" row with this label (e.g. "Stage Front") */
  vipTableLabel?: string;
  /** When set, the seat row shows the position-in-VIP-table instead of the global number */
  vipSeatInTable?: number;
  /** Row letter (e.g. "A"). When provided in seat mode, email shows a separate "Row" row above "Seat No." */
  rowLabel?: string;
  /**
   * Pre-formatted assignment rows (from formatAssignment().rows). When provided,
   * these drive the "Event Details" assignment block — the single source of truth
   * for the seat/table scheme. Falls back to the legacy fields when absent.
   */
  assignmentRows?: { label: string; value: string; vip?: boolean }[];
  /** base64 data URL (data:image/png;base64,...) used for live preview only */
  qrDataUrl?: string;
  /**
   * Online entry-pass URL. When set, a "View / download your entry pass" button
   * renders below the QR. This is a plain text link (not an image), so it stays
   * reachable even when an email client blocks images — e.g. in the junk folder.
   */
  passUrl?: string;
  /** Admin-editable body paragraph. Supports {{name}} and {{event}} variables. */
  customBody?: string;
  /** When set, an "Attire" row is added to the Event Details box (e.g. "Formal Elegance"). */
  dressCode?: string;
  /** When set, a "Dietary Requirements" section renders below the QR. */
  dietaryNote?: string;
  /** Sign-off name shown bold above the footer (e.g. "PEOPLElogy Berhad"). */
  signOffName?: string;
  /** Sub-line under the sign-off name (e.g. "25th Anniversary Celebration Committee"). */
  signOffSub?: string;
  /** Firebase Storage URL — replaces black header with an image */
  bannerUrl?: string;
  /** Header title text. Defaults to the event title when no bannerUrl is set. */
  headerTitle?: string;
  /** When true and a banner is set, render the event title in a strip below the banner */
  showTitleOnBanner?: boolean;
}

/** Format a "HH:MM" 24h string to 12-hour with AM/PM (e.g. "17:30" → "5:00 PM"). */
function formatTime12h(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}

export function buildSeatEmail(opts: SeatEmailOpts): string {
  const useRows = opts.assignmentRows && opts.assignmentRows.length > 0;
  const isVip = useRows ? opts.assignmentRows!.some((r) => r.vip) : !!opts.vipTableLabel;

  // Noun for the "… Confirmed" header strip + body sentence ("table" vs "seat").
  const confirmNoun = useRows
    ? (opts.assignmentRows![0].label.toLowerCase().includes("table") ? "Table" : "Seat")
    : (opts.tableNumber != null ? "Table" : "Seat");

  const assignLabel = isVip
    ? "VIP Seat"
    : opts.tableNumber != null ? "Table No." : "Seat No.";
  const assignValue = isVip
    ? (opts.vipSeatInTable ?? opts.seatNumber)
    : opts.tableNumber != null ? opts.tableNumber : opts.seatNumber;

  // Assignment block inside the "Event Details" table. Prefer the structured
  // rows (single source of truth) and fall back to the legacy Row/VIP/assign rows.
  const assignmentRowsHtml = useRows
    ? opts.assignmentRows!
        .map(
          (r) => `<tr>
              <td style="padding: 5px 0; color: #888888;">${r.label}</td>
              <td style="padding: 5px 0; font-size: ${r.vip ? 16 : 18}px; font-weight: 700; color: ${r.vip ? "#b7791f" : "#111111"};">${r.value}</td>
            </tr>`
        )
        .join("")
    : `${opts.tableNumber == null && opts.rowLabel && !isVip
          ? `<tr>
              <td style="padding: 5px 0; color: #888888;">Row</td>
              <td style="padding: 5px 0; font-size: 18px; font-weight: 700; color: #111111;">${opts.rowLabel}</td>
            </tr>`
          : ""}
        ${isVip
          ? `<tr>
              <td style="padding: 5px 0; color: #888888;">VIP Table</td>
              <td style="padding: 5px 0; font-size: 16px; font-weight: 700; color: #b7791f;">${opts.vipTableLabel}</td>
            </tr>`
          : ""}
        <tr>
          <td style="padding: 5px 0; color: #888888;">${assignLabel}</td>
          <td style="padding: 5px 0; font-size: 18px; font-weight: 700; color: #111111;">#${assignValue}</td>
        </tr>`;

  // Substitute {{name}} and {{event}} variables in custom body
  const resolvedBody = (opts.customBody ?? "").trim()
    .replace(/\{\{name\}\}/g, opts.name)
    .replace(/\{\{event\}\}/g, opts.eventTitle);

  const bodyParagraph = resolvedBody
    ? `<p style="font-size: 14px; color: #555555; margin: 0 0 28px; line-height: 1.6;">${resolvedBody}</p>`
    : `<p style="font-size: 14px; color: #555555; margin: 0 0 16px; line-height: 1.6;">
        The countdown is almost over &mdash; we look forward to welcoming you to the <strong>${opts.eventTitle}</strong> Celebration this weekend.
      </p>
      <p style="font-size: 14px; color: #555555; margin: 0 0 28px; line-height: 1.6;">
        As we commemorate 25 years of growth, innovation, partnerships, and people, we are honoured to have you join us for this special milestone.
      </p>`;

  // Always render the dark title strip beneath the banner — so even when the
  // banner image is blocked (junk folder) or fails to load, the event name and
  // "… Confirmed" still appear as real text. A photo banner can't be shown
  // without an image, but this guarantees the identity is never lost.
  const seatTitleStrip = `<div style="background: #111111; padding: 14px 20px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 18px; margin: 0; letter-spacing: -0.3px;">${opts.headerTitle ?? opts.eventTitle}</h1>
        <p style="color: #888888; font-size: 12px; margin: 4px 0 0;">${confirmNoun} Confirmed</p>
      </div>`;

  // Header: custom banner image OR dark header with editable title
  const header = opts.bannerUrl
    ? `<div style="line-height:0;"><img src="${opts.bannerUrl}" alt="${opts.eventTitle}" style="width:100%;max-width:560px;display:block;" /></div>${seatTitleStrip}`
    : `<div style="background: #111111; padding: 32px 40px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; letter-spacing: -0.5px;">${opts.headerTitle ?? opts.eventTitle}</h1>
        <p style="color: #888888; font-size: 13px; margin: 6px 0 0;">${confirmNoun} Confirmed</p>
      </div>`;

  // Attire row (only if present)
  const dressCodeRow = opts.dressCode
    ? `<tr>
        <td style="padding: 5px 0; color: #888888;">Attire</td>
        <td style="padding: 5px 0; font-weight: 600;">${opts.dressCode}</td>
      </tr>`
    : "";

  // Use data URL for preview (client-side), cid reference for actual email send
  const qrSrc = opts.qrDataUrl ?? "cid:qr_code";

  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5e5;">
      <!-- Header -->
      ${header}

      <!-- Body -->
      <div style="padding: 36px 40px;">
        <p style="font-size: 15px; color: #333333; margin: 0 0 8px;">Dear <strong>${opts.name}</strong>,</p>
        ${bodyParagraph}

        <!-- Event Details -->
        <div style="background: #f7f7f7; border-radius: 10px; padding: 20px 24px; margin-bottom: 28px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #333333;">
            <tr>
              <td style="padding: 5px 0; color: #888888; width: 100px;">Event</td>
              <td style="padding: 5px 0; font-weight: 600;">${opts.eventTitle}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #888888;">Date</td>
              <td style="padding: 5px 0; font-weight: 600;">${opts.eventDate}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #888888;">Time</td>
              <td style="padding: 5px 0; font-weight: 600;">${formatTime12h(opts.eventTime)}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #888888;">Venue</td>
              <td style="padding: 5px 0; font-weight: 600;">${opts.venue}</td>
            </tr>
            ${dressCodeRow}
            ${assignmentRowsHtml}
          </table>
        </div>

        <!-- QR Code -->
        <p style="font-weight: 700; color: #111111; font-size: 15px; margin: 0 0 6px;">Important: Event Registration QR Code</p>
        <p style="font-size: 14px; color: #555555; line-height: 1.6; margin: 0 0 18px;">
          Below is your unique event QR Code. <strong>Please save it to your mobile device</strong>, as it will be required for registration upon arrival.
        </p>
        <div style="text-align: center; margin-bottom: 28px;">
          <img src="${qrSrc}" alt="Entry QR Code" style="width: 200px; height: 200px; border-radius: 8px; border: 1px solid #e5e5e5;" />
          <p style="font-size: 11px; color: #aaaaaa; margin: 12px 0 0;">Valid only for the event above. Do not share this QR code.</p>
          ${opts.passUrl
            ? `<div style="margin-top: 18px;">
            <a href="${opts.passUrl}" style="display: inline-block; background: #3d9bf5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 24px; border-radius: 8px;">View or download your entry pass</a>
            <p style="font-size: 12px; color: #888888; margin: 10px 0 0;">Can't see the QR code above? Tap the button to open your pass.</p>
          </div>`
            : ""}
        </div>
        ${opts.dietaryNote
          ? `<p style="font-weight: 700; color: #111111; font-size: 15px; margin: 0 0 6px;">Dietary Requirements</p>
        <p style="font-size: 14px; color: #555555; line-height: 1.6; margin: 0 0 24px;">${opts.dietaryNote}</p>`
          : ""}

        <p style="font-size: 14px; color: #555555; line-height: 1.6; margin: 0 0 16px;">
          We are excited to celebrate this milestone with you and look forward to creating memorable moments together.
        </p>
        <p style="font-size: 14px; color: #555555; line-height: 1.6; margin: 0 0 24px;">
          Thank you for being part of the PEOPLElogy journey.
        </p>
        ${opts.signOffName
          ? `<p style="font-size: 14px; color: #555555; margin: 0 0 4px;">Warm regards,</p>
        <p style="font-size: 14px; font-weight: 700; color: #111111; margin: 0;">${opts.signOffName}</p>
        ${opts.signOffSub ? `<p style="font-size: 14px; color: #555555; margin: 0;">${opts.signOffSub}</p>` : ""}`
          : `<p style="font-size: 13px; color: #555555; line-height: 1.6; margin: 0;">If you have any questions, please reply to this email. We look forward to seeing you!</p>`}
      </div>

      <!-- Footer -->
      <div style="background: #f7f7f7; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e5e5;">
        <p style="font-size: 11px; color: #aaaaaa; margin: 0;">
          Powered by AuraPixel &middot; This is an automated message.
        </p>
      </div>
    </div>
  `;
}

// ─── Email Blast Template ────────────────────────────────────────────────────
//
// Ad-hoc announcement email. Shares the branded white-card + banner header +
// footer look of the other two templates, but the body is ENTIRELY the admin's
// message — no RSVP-confirmation copy, no event-details table, no seat/QR. An
// "Add to Google Calendar" CTA is appended when an event date is present. The
// caller is expected to have already substituted {{name}} and {{event}} in
// `body`. Pure string function — client-safe for live preview.

export interface BlastEmailOpts {
  name: string;
  eventTitle: string;
  /** Admin's message body; already {{name}}/{{event}}-substituted by the caller */
  body: string;
  /** Event date — when set, an "Add to Google Calendar" button is rendered. "YYYY-MM-DD" or pre-formatted. */
  eventDate?: string;
  /** "HH:MM" 24h, used to build the calendar link. Optional. */
  eventTime?: string;
  venue?: string;
  address?: string;
  /** Firebase Storage URL (or cid:...) — replaces the dark text header with an image */
  bannerUrl?: string;
  /** When true and a banner is set, render the event title in a strip below the banner */
  showTitleOnBanner?: boolean;
}

/** Plain-text alternative for a blast — strips the admin's HTML-ish body to text. */
export function buildBlastText(opts: BlastEmailOpts): string {
  const body = opts.body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .trim();
  const parts = [`Dear ${opts.name},`, "", body, ""];
  parts.push(`You are receiving this because you registered for ${opts.eventTitle}.`);
  return parts.join("\n");
}

export function buildBlastEmail(opts: BlastEmailOpts): string {
  const titleStrip = opts.showTitleOnBanner
    ? `<div style="background: #0a1628; padding: 14px 20px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 700; letter-spacing: 0.3px;">${opts.eventTitle}</h1>
      </div>`
    : "";

  const header = opts.bannerUrl
    ? `<div style="line-height:0;"><img src="${opts.bannerUrl}" alt="Event Banner" style="width:100%;max-width:580px;display:block;" /></div>${titleStrip}`
    : `<div style="background: #0a1628; padding: 36px 40px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 700; letter-spacing: 0.5px;">${opts.eventTitle}</h1>
      </div>`;

  // Render the admin's message: blank lines separate <p> blocks; single newlines
  // become <br/> so the admin's line breaks survive.
  const bodyHtml = opts.body
    .trim()
    .split(/\n\s*\n/)
    .map(
      (para) =>
        `<p style="font-size: 15px; color: #333333; margin: 0 0 16px; line-height: 1.7;">${para
          .trim()
          .replace(/\n/g, "<br/>")}</p>`
    )
    .join("");

  // Add-to-Google-Calendar CTA — only when an event date is provided.
  const calendarHtml = opts.eventDate
    ? `
        <!-- Add to Google Calendar CTA -->
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 20px auto 4px;">
          <tr>
            <td align="center" style="background: #1a6fd4; border-radius: 6px;">
              <a href="${buildCalendarUrl(
                { eventTitle: opts.eventTitle, eventDate: opts.eventDate, eventTime: opts.eventTime, venue: opts.venue, address: opts.address },
                opts.eventTitle,
              )}" target="_blank" style="display: inline-block; padding: 12px 24px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.2px;">
                Add to Google Calendar
              </a>
            </td>
          </tr>
        </table>`
    : "";

  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5e5;">

      ${header}

      <!-- Body -->
      <div style="padding: 40px 40px 32px;">
        <p style="font-size: 15px; color: #222222; margin: 0 0 20px; line-height: 1.6;">
          Dear <strong>${opts.name}</strong>,
        </p>

        ${bodyHtml}
        ${calendarHtml}
      </div>

      <!-- Footer -->
      <div style="background: #0a1628; padding: 20px 40px; text-align: center;">
        <p style="font-size: 11px; color: #4a6a9a; margin: 0;">
          You are receiving this because you registered for ${opts.eventTitle}.
        </p>
      </div>
    </div>
  `;
}
