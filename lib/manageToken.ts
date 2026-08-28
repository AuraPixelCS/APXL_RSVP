/**
 * Signed links for guest self-service.
 *
 * A guest has no account, so the link itself is the credential. It is scoped to
 * one RSVP on one event and signed with a dedicated secret.
 *
 * WHY NOT REUSE QR_SECRET: an entry pass is shown at a door and is routinely
 * photographed, forwarded, and printed. A management link can cancel a booking.
 * Sharing one secret would mean a leaked pass could be replayed into a token
 * that edits the booking, and would make rotating either one impossible without
 * invalidating the other. MANAGE_SECRET can be rotated freely — the only cost
 * is that older self-service links stop working.
 *
 * Scope is deliberately narrow: view, edit dietary/companion details, cancel,
 * and re-request the entry pass. Nothing here can change a seat number.
 */

import crypto from "crypto";

const SECRET =
  process.env.MANAGE_SECRET ??
  process.env.QR_SECRET ?? // last-resort fallback so the feature works before the env var is set
  "dev-manage-secret-change-in-production";

/** How long a self-service link stays valid. */
const DEFAULT_TTL_DAYS = 120;

export interface ManagePayload {
  rsvpId: string;
  eventId: string;
  /** Expiry, Unix seconds. */
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function sign(encoded: string): string {
  return b64url(crypto.createHmac("sha256", SECRET).update(encoded).digest());
}

/** Mint a token for one RSVP. */
export function createManageToken(
  rsvpId: string,
  eventId: string,
  ttlDays: number = DEFAULT_TTL_DAYS,
): string {
  const payload: ManagePayload = {
    rsvpId,
    eventId,
    exp: Math.floor(Date.now() / 1000) + Math.round(ttlDays * 86400),
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verify a token and return its payload, or null.
 *
 * Returns null for every failure mode — bad signature, expired, malformed — so
 * a caller can't accidentally branch on *why* it failed and leak that back to
 * whoever is probing the endpoint.
 */
export function verifyManageToken(token: string): ManagePayload | null {
  try {
    const [encoded, sig] = String(token ?? "").split(".");
    if (!encoded || !sig) return null;

    const expected = sign(encoded);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch, which is itself a signal.
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64").toString()) as ManagePayload;
    if (!payload?.rsvpId || !payload?.eventId) return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/** Absolute self-service URL for an RSVP. `origin` should include the basePath. */
export function buildManageUrl(origin: string, rsvpId: string, eventId: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/manage?t=${encodeURIComponent(createManageToken(rsvpId, eventId))}`;
}
