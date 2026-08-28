import crypto from "crypto";
import type { QRPayload } from "@/types";
import { DEFAULT_EVENT_TIMEZONE, endOfDayInZone, eventTimezone, zonedWallClockToUtc } from "@/lib/eventTime";
import { eventDateRange } from "@/lib/eventDays";

const QR_SECRET = process.env.QR_SECRET ?? "dev-secret-change-in-production";

// ─── SIGN / VERIFY ──────────────────────────────────────────────────────────

function toBase64Url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function signQRPayload(payload: QRPayload): string {
  const encoded = toBase64Url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", QR_SECRET)
    .update(encoded)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${encoded}.${sig}`;
}

export function verifyQRToken(token: string): QRPayload | null {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;

    const expectedSig = crypto
      .createHmac("sha256", QR_SECRET)
      .update(encoded)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }

    return JSON.parse(Buffer.from(encoded, "base64").toString()) as QRPayload;
  } catch {
    return null;
  }
}

// ─── VALIDITY WINDOW ────────────────────────────────────────────────────────

const VALID_BEFORE_SECONDS = 12 * 60 * 60; // 12 hours before event
const VALID_AFTER_SECONDS = 4 * 60 * 60; // 4 hours after event (grace period)

export function isQRValid(payload: QRPayload, nowMs: number = Date.now()): boolean {
  // eventTime 0 means the event's date/time couldn't be resolved when the pass
  // was issued. Refusing entry on that basis would punish the guest for a
  // config error, so treat it as an unbounded window.
  if (!payload.eventTime) return true;
  const nowSec = Math.floor(nowMs / 1000);
  const windowStart = payload.eventTime - VALID_BEFORE_SECONDS;
  const windowEnd = payload.eventTime + VALID_AFTER_SECONDS;
  return nowSec >= windowStart && nowSec <= windowEnd;
}

/**
 * Validity window that knows the event runs for several days.
 *
 * `isQRValid` only looks at the payload's start instant, so on a three-day
 * summit every pass reads "out of time" from day two onwards. When the event
 * carries a date range, open the window from 12h before the first day's start
 * to 4h after the last day ends; otherwise fall back to the single-day rule.
 */
export function isQRValidForEvent(
  payload: QRPayload,
  event: { date: string; time: string; endDate?: string; days?: { date: string; startTime?: string }[]; timezone?: string } | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!event) return isQRValid(payload, nowMs);
  const { start, end } = eventDateRange(event as Parameters<typeof eventDateRange>[0]);
  if (start === end) return isQRValid(payload, nowMs);

  const tz = eventTimezone(event);
  const startMs = zonedWallClockToUtc(start, event.time || "00:00", tz);
  const endMs = endOfDayInZone(end, tz);
  if (startMs == null || endMs == null) return true; // config error → never lock guests out

  const windowStart = startMs - VALID_BEFORE_SECONDS * 1000;
  const windowEnd = endMs + VALID_AFTER_SECONDS * 1000;
  return nowMs >= windowStart && nowMs <= windowEnd;
}

export function generateQRPayload(
  rsvpId: string,
  eventId: string,
  seatNumber: number | null,
  eventDateISO: string, // "YYYY-MM-DD"
  eventTime: string, // "HH:MM"
  timeZone: string = DEFAULT_EVENT_TIMEZONE, // IANA zone the wall clock is read in
  guestIndex: 0 | 1 = 0 // 0 = the guest who RSVPed, 1 = their +1
): QRPayload {
  // The event's date/time is a wall clock at the venue. `setUTCHours` treated
  // that local reading as if it were already UTC, putting `eventTime` ~8h off
  // for a Malaysian event and sliding the whole validity window with it.
  const startMs = zonedWallClockToUtc(eventDateISO, eventTime, timeZone);

  return {
    rsvpId,
    eventId,
    seatNumber,
    // Unparseable date/time → 0. isQRValid() treats that as "no window", so a
    // malformed event can't silently invalidate every pass it issues.
    eventTime: startMs == null ? 0 : Math.floor(startMs / 1000),
    issuedAt: Math.floor(Date.now() / 1000),
    // Only stamped for a +1. Omitting it for the primary guest keeps the
    // payload byte-identical to every pass issued before this field existed.
    ...(guestIndex === 1 ? { guestIndex: 1 as const } : {}),
  };
}
