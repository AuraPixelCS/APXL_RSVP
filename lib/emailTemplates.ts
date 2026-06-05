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
          This is an automated confirmation. Please do not reply to this email.
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
  /** Firebase Storage URL — replaces black header with an image */
  bannerUrl?: string;
  /** Header title text. Defaults to the event title when no bannerUrl is set. */
  headerTitle?: string;
  /** When true and a banner is set, render the event title in a strip below the banner */
  showTitleOnBanner?: boolean;
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
    : `<p style="font-size: 14px; color: #555555; margin: 0 0 28px; line-height: 1.6;">
        Your ${confirmNoun.toLowerCase()} has been confirmed for <strong>${opts.eventTitle}</strong>.
        Please find your entry QR pass below &mdash; show this at the entrance on the day of the event.
      </p>`;

  const seatTitleStrip = opts.showTitleOnBanner
    ? `<div style="background: #111111; padding: 14px 20px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 18px; margin: 0; letter-spacing: -0.3px;">${opts.headerTitle ?? opts.eventTitle}</h1>
        <p style="color: #888888; font-size: 12px; margin: 4px 0 0;">${confirmNoun} Confirmed &#x2705;</p>
      </div>`
    : "";

  // Header: custom banner image OR dark header with editable title
  const header = opts.bannerUrl
    ? `<div style="line-height:0;"><img src="${opts.bannerUrl}" alt="Event Banner" style="width:100%;max-width:560px;display:block;" /></div>${seatTitleStrip}`
    : `<div style="background: #111111; padding: 32px 40px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; letter-spacing: -0.5px;">${opts.headerTitle ?? opts.eventTitle}</h1>
        <p style="color: #888888; font-size: 13px; margin: 6px 0 0;">${confirmNoun} Confirmed &#x2705;</p>
      </div>`;

  // Address row (only if present)
  const addressRow = opts.address
    ? `<tr>
        <td style="padding: 5px 0; color: #888888; vertical-align: top;">Address</td>
        <td style="padding: 5px 0; font-weight: 600;">${opts.address}</td>
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
        <p style="font-size: 15px; color: #333333; margin: 0 0 8px;">Hi <strong>${opts.name}</strong>,</p>
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
              <td style="padding: 5px 0; font-weight: 600;">${opts.eventTime}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #888888;">Venue</td>
              <td style="padding: 5px 0; font-weight: 600;">${opts.venue}</td>
            </tr>
            ${addressRow}
            ${assignmentRowsHtml}
          </table>
        </div>

        <!-- QR Code -->
        <div style="text-align: center; margin-bottom: 28px;">
          <p style="font-size: 13px; color: #888888; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 1px;">Your Entry Pass</p>
          <img src="${qrSrc}" alt="QR Entry Pass" style="width: 200px; height: 200px; border-radius: 8px; border: 1px solid #e5e5e5;" />
          <p style="font-size: 11px; color: #aaaaaa; margin: 12px 0 0;">Valid only for the event above. Do not share this QR code.</p>
          ${opts.passUrl
            ? `<div style="margin-top: 18px;">
            <a href="${opts.passUrl}" style="display: inline-block; background: #3d9bf5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 24px; border-radius: 8px;">🎫 View or download your entry pass</a>
            <p style="font-size: 12px; color: #888888; margin: 10px 0 0;">Can't see the QR code above? Tap the button to open your pass.</p>
          </div>`
            : ""}
        </div>

        <p style="font-size: 13px; color: #555555; line-height: 1.6; margin: 0;">
          If you have any questions, please reply to this email. We look forward to seeing you!
        </p>
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
