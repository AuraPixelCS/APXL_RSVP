// ─── RSVP ───────────────────────────────────────────────────────────────────

export type RSVPStatus = "pending" | "allocated" | "checked_in" | "not_attending";

export interface RSVP {
  id?: string;
  eventId: string;
  name: string;
  email: string;
  phone: string; // E.164 format e.g. "+601234567890"
  attending: boolean;
  plusOne: boolean;
  plusOneName?: string;
  dietaryRestrictions?: string;
  message?: string;
  partOf?: string;
  company?: string;
  jobTitle?: string;
  industry?: string;
  status: RSVPStatus;
  seatNumber: number | null;
  qrToken: string | null;
  qrIssuedAt: string | null; // ISO timestamp
  whatsappConfirmSent: boolean;
  whatsappQRSent: boolean;
  notifiedAt: string | null; // ISO timestamp; null = not yet notified via Notifications page
  blastSentAt?: string | null; // ISO timestamp of the last email blast sent to this guest
  allocatedBy?: { uid: string; displayName: string } | null;
  submittedAt: string; // ISO timestamp
  updatedAt: string;
  // Check-in (scanner app). checkInTime is what the scanner has always written;
  // checkedInAt is written alongside it now so web reads/reports stay in sync.
  checkInTime?: string | null;
  checkedInAt?: string | null;
  scanLogs?: Array<{ scannedAt: string; deviceId: string }>;
}

// ─── EVENT ──────────────────────────────────────────────────────────────────

export interface Event {
  id?: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM" 24h
  /**
   * IANA zone the `date`/`time` wall clock is read in (e.g. "Asia/Kuala_Lumpur").
   * Unset → DEFAULT_EVENT_TIMEZONE. Without this, "23:59" means whatever zone the
   * server happens to run in (UTC on Vercel), which shifted the RSVP deadline ~8h.
   * Always resolve via lib/eventTime.ts rather than reading this field directly.
   */
  timezone?: string;
  venue: string;
  address?: string;
  dressCode?: string; // shown as a "Dress Code" row in the entry-pass email (e.g. "Office attire")
  description?: string;
  maxGuests?: number;
  totalSeats: number;
  seatingConfig?: SeatingConfig;
  assignmentMode?: "seat" | "table"; // how seatNumber is labeled to guests; default "seat"

  // ── Public RSVP form config (Phase 2) ─────────────────────────────────────
  // Drive the public form's dropdowns per-event. Empty/unset → built-in defaults
  // (see lib/guestFields.ts), so existing events keep working unchanged.
  guestCategories?: string[]; // options for the "I am part of this event as a" dropdown
  industries?: string[];      // options for the "Industry" dropdown

  rsvpDeadline?: string; // "YYYY-MM-DD"
  isActive: boolean;
  pinned?: boolean; // admin-pinned events float to the top of the upcoming list
  coverImageUrl?: string | null;
  customEmailBody?: string;   // admin-saved body paragraph for seat confirmation emails
  customEmailTitle?: string;  // header title in email, defaults to "AuraPixel"
  customEmailBanner?: string; // Firebase Storage URL — entry pass email header banner
  customRsvpConfirmBanner?: string; // Firebase Storage URL — RSVP confirmation email header banner
  showEventTitleOnBanner?: boolean; // when true, render event title in a strip beneath both banners

  // ── Per-event email editor (Phase 2) ──────────────────────────────────────
  // Read by pages/api/notify.ts + rsvp/submit.ts. When set, these override the
  // computed defaults so a new event's emails are correct without any code change.
  entryPassSubject?: string;   // subject line for the QR entry-pass email
  rsvpConfirmSubject?: string; // subject line for the post-RSVP confirmation email
  thankYouSubject?: string;    // subject line for the post-event thank-you email
  // dressCode is declared above (used as the "Attire" row on the entry pass)
  signOffName?: string;        // bold sign-off name on the entry-pass + thank-you emails
  agendaImageUrl?: string;     // hosted programme-agenda image shown on the entry pass
  thankYouOrgName?: string;    // organiser name in the thank-you greeting + sign-off
  thankYouCtas?: EmailCta[];   // thank-you call-to-action buttons

  // ── Per-event sender identity (Phase 2) ───────────────────────────────────
  // Overrides the global RESEND_FROM / RESEND_REPLY_TO env defaults so two
  // concurrent clients don't both mail as the same brand. Resolve via
  // lib/eventSender.ts. senderEmail's DOMAIN must be verified in Resend —
  // an unverified domain is rejected at send time, so the resolver falls back.
  senderName?: string;   // display name, e.g. "PEOPLElogy Anniversary"
  senderEmail?: string;  // address on a Resend-verified domain, e.g. events@aurapixel.live
  replyToEmail?: string; // where guest replies land; blank → global default

  createdAt?: string;
  updatedAt?: string;
}

/** A call-to-action button in an email (thank-you gallery link, assessment, …). */
export interface EmailCta {
  label: string;
  url: string;
  blurb?: string;
}

// ─── ADMIN USER ─────────────────────────────────────────────────────────────

export type AdminRole = "admin" | "client";

export interface AdminUser {
  uid: string;
  email: string;
  displayName?: string;
  role: AdminRole;
  createdAt?: string;
}

// ─── QR CODE ────────────────────────────────────────────────────────────────

export interface QRPayload {
  rsvpId: string;
  eventId: string;
  seatNumber: number;
  eventTime: number; // Unix timestamp (seconds) of event start
  issuedAt: number; // Unix timestamp (seconds) of QR generation
}

// ─── AGGREGATED STATS ───────────────────────────────────────────────────────

export interface EventStats {
  total: number;
  attending: number;
  allocated: number;
  pending: number;
  notAttending: number;
  checkedIn: number;
}

// ─── GOOGLE FORMS INTEGRATION ────────────────────────────────────────────────

export type MapsTo =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "message"
  | "extra"
  | "ignore";

export interface FieldMapping {
  id: string;
  formHeader: string;   // Exact Google Form column header text
  mapsTo: MapsTo;
  extraLabel?: string;  // Only when mapsTo === "extra", e.g. "Role"
}

// ─── SEATING ─────────────────────────────────────────────────────────────────

export type SeatingStyle = "theater" | "auditorium" | "banquet" | "classroom" | "runway" | "banquet-runway";

export interface SeatingConfig {
  style: SeatingStyle;
  seatsPerRow?: number;   // theater, auditorium, classroom — default 10
  seatsPerTable?: number; // banquet, banquet-runway — default 10
  tablesPerSide?: number; // banquet, banquet-runway — tables per side per row (total per row = 2 × tablesPerSide)
  frontRowTablesPerSide?: number; // banquet only — when set (< tablesPerSide), the FIRST row uses this many tables per side, dropping its inner tables to widen the front aisle. Unset = uniform rows.
  vipTables?: VipTable[]; // optional VIP tables rendered near the stage; seats are numbered above the standard range
}

/**
 * VIP table — sits near the stage, separate from the standard seating grid.
 * Seat numbers are appended above totalSeats in the order vipTables appear.
 * Example: totalSeats=200, vipTables=[{seats:12}, {seats:10}] → VIP seats 201–212, 213–222.
 */
export interface VipTable {
  id: string;        // stable id (preserve to keep allocations valid across edits)
  label: string;     // shown to admins + appended to guest confirmations, e.g. "Stage Front"
  seats: number;     // number of seats around the round table
}
