// ─── RSVP ───────────────────────────────────────────────────────────────────

/**
 * `waitlisted` (Phase 3): the guest RSVPed after the event reached capacity.
 * They are a real record — kept in submission order so they can be promoted to
 * `pending` when someone cancels — but they hold no seat and get no entry pass.
 */
export type RSVPStatus =
  | "pending"
  | "allocated"
  | "checked_in"
  | "not_attending"
  | "waitlisted";

/** Per-recipient delivery state, driven by Resend webhooks (Phase 3). */
export type EmailDeliveryStatus =
  | "sent"       // accepted by Resend — NOT proof of delivery
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained" // marked as spam
  | "delayed";

export interface EmailDeliveryEvent {
  status: EmailDeliveryStatus;
  at: string;        // ISO timestamp
  kind?: string;     // which email: "confirm" | "pass" | "blast" | "thankyou"
  detail?: string;   // bounce reason etc.
}

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

  // ── Plus-one seating (Phase 3) ────────────────────────────────────────────
  // `plusOne` was collected from day one but the companion was never seated and
  // never issued a pass — they arrived to no chair. A +1 now consumes a real
  // seat, adjacent to the primary guest whenever one is free.
  plusOneSeatNumber?: number | null;
  plusOneQrToken?: string | null;
  plusOneCheckedInAt?: string | null;

  // ── Waitlist (Phase 3) ────────────────────────────────────────────────────
  waitlistedAt?: string | null; // when they were placed on the waitlist
  promotedAt?: string | null;   // when they were moved off it

  /** Guest asked for their entry pass again via the self-service page. */
  passResendRequestedAt?: string | null;
  /** Guest cancelled themselves via the self-service page. */
  cancelledAt?: string | null;

  // ── Email delivery (Phase 3) ──────────────────────────────────────────────
  // `notifiedAt`/`blastSentAt` only ever meant "handed to Resend". These carry
  // what actually happened to the message.
  emailStatus?: EmailDeliveryStatus | null;
  emailStatusAt?: string | null;
  emailEvents?: EmailDeliveryEvent[];
}

// ─── EVENT ──────────────────────────────────────────────────────────────────

/**
 * One day of a multi-day event. The unit an entitlement is granted against and
 * the unit attendance is recorded against: E1 runs two days and E3 runs three,
 * and F19/F20/F21 differ from F3 only by which of E3's days they open. A pass
 * therefore carries a set of (event, day) pairs, never a single event flag.
 */
export interface EventDay {
  date: string;       // "YYYY-MM-DD"
  label?: string;     // "Day 1"
  theme?: string;     // "SME & Public" — the Summit's per-day theme
  startTime?: string; // "HH:MM" 24h; unset → Event.time
  endTime?: string;   // "HH:MM" 24h
}

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

  // ── Multi-day programme (Phase 4) ─────────────────────────────────────────
  // `date`/`time` remain the event's start and stay authoritative for every
  // single-day event and for every existing consumer (emails, deadlines, QR).
  /**
   * Stable short code the ticket-type table and entitlement rules refer to
   * ("E1", "E2", "E3"). Firestore doc ids are opaque and change per environment;
   * this does not, so entitlement sets stay readable and portable.
   */
  code?: string;
  /** Last day, "YYYY-MM-DD". Unset → the event is one day (`date`). */
  endDate?: string;
  /**
   * The days this event runs. Unset → one implicit day of `date`, which is what
   * every event created before this field existed means. Resolve via
   * lib/eventDays.ts rather than reading this directly.
   */
  days?: EventDay[];

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

  // ── Capacity & waitlist (Phase 3) ─────────────────────────────────────────
  // Intake previously accepted unlimited RSVPs regardless of seat count, so
  // over-subscription only surfaced at allocation time — after everyone had
  // already been told they were coming.
  /** Hard cap on committed seats. Unset → derived from totalSeats + VIP seats. */
  capacityLimit?: number;
  /** At capacity: true → new RSVPs are waitlisted; false → they're turned away. */
  waitlistEnabled?: boolean;
  /** Subject line for the "you're on the waitlist" email. */
  waitlistSubject?: string;

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
  /**
   * Which person on the booking this pass belongs to: 0 = the guest who RSVPed,
   * 1 = their +1. Omitted on every pass issued before plus-one seating existed,
   * so absent must read as 0 — those passes are still in guests' inboxes and
   * must keep verifying.
   *
   * Both passes carry the same rsvpId, so today's scanner checks in the party
   * on either scan. The field is here so the scanner can tell them apart later
   * without reissuing anything.
   */
  guestIndex?: 0 | 1;
}

// ─── AGGREGATED STATS ───────────────────────────────────────────────────────

export interface EventStats {
  total: number;
  /** Guests actually holding a place. Excludes waitlisted — they hold nothing. */
  attending: number;
  waitlisted: number;
  /** Seats committed, counting a +1 as a second seat. */
  seatsCommitted: number;
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
