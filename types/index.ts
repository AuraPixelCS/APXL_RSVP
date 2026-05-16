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
  allocatedBy?: { uid: string; displayName: string } | null;
  submittedAt: string; // ISO timestamp
  updatedAt: string;
  // Future: Android scanner app (Phase 2)
  checkedInAt?: string | null;
  scanLogs?: Array<{ scannedAt: string; deviceId: string }>;
}

// ─── EVENT ──────────────────────────────────────────────────────────────────

export interface Event {
  id?: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM" 24h
  venue: string;
  address?: string;
  description?: string;
  maxGuests?: number;
  totalSeats: number;
  seatingConfig?: SeatingConfig;
  assignmentMode?: "seat" | "table"; // how seatNumber is labeled to guests; default "seat"
  rsvpDeadline?: string; // "YYYY-MM-DD"
  isActive: boolean;
  coverImageUrl?: string | null;
  customEmailBody?: string;   // admin-saved body paragraph for seat confirmation emails
  customEmailTitle?: string;  // header title in email, defaults to "AuraPixel"
  customEmailBanner?: string; // Firebase Storage URL — entry pass email header banner
  customRsvpConfirmBanner?: string; // Firebase Storage URL — RSVP confirmation email header banner
  showEventTitleOnBanner?: boolean; // when true, render event title in a strip beneath both banners
  createdAt?: string;
  updatedAt?: string;
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
}
