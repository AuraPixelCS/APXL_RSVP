import crypto from "crypto";
import type { QRPayload } from "@/types";

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

export function isQRValid(payload: QRPayload): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = payload.eventTime - VALID_BEFORE_SECONDS;
  const windowEnd = payload.eventTime + VALID_AFTER_SECONDS;
  return nowSec >= windowStart && nowSec <= windowEnd;
}

export function generateQRPayload(
  rsvpId: string,
  eventId: string,
  seatNumber: number,
  eventDateISO: string, // "YYYY-MM-DD"
  eventTime: string // "HH:MM"
): QRPayload {
  const [hours, minutes] = eventTime.split(":").map(Number);
  const eventDate = new Date(eventDateISO);
  eventDate.setUTCHours(hours, minutes, 0, 0);

  return {
    rsvpId,
    eventId,
    seatNumber,
    eventTime: Math.floor(eventDate.getTime() / 1000),
    issuedAt: Math.floor(Date.now() / 1000),
  };
}
