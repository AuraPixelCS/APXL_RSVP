/**
 * Partner form integration — pure helpers for /api/integrations/register.
 *
 * Kept free of Firebase/Next imports so the payload rules are unit-testable
 * (scripts/test-integration.ts) and readable as the contract's source of truth.
 */

import crypto from "crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Auth ───────────────────────────────────────────────────────────────────

/** Constant-time compare of the `X-API-Key` header against the configured key. */
export function apiKeyMatches(provided: unknown, expected: string | undefined): boolean {
  if (!expected || typeof provided !== "string" || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── Ticket → event ─────────────────────────────────────────────────────────

export interface TicketRule {
  /** Short event code the ticket registers into ("E3"). */
  event: string;
  /** Our canonical code for reporting. */
  code: string;
  /** false → recognised but not wired yet (paid passes wait on the Stripe call). */
  enabled: boolean;
}

/**
 * Every spelling a partner might send, lower-cased. The complimentary Summit
 * pass is the only enabled ticket in this phase; BAFT passes are listed so
 * they fail with a clear "not enabled" rather than "unknown".
 */
export const TICKET_RULES: Record<string, TicketRule> = {
  // Free Summit (NAIRW) pass — the client's #pass-complimentary form.
  "complimentary":       { event: "E3", code: "F3", enabled: true },
  "pass-complimentary":  { event: "E3", code: "F3", enabled: true },
  "complimentary-pass":  { event: "E3", code: "F3", enabled: true },
  "nairw-complimentary": { event: "E3", code: "F3", enabled: true },
  "nairw_complimentary": { event: "E3", code: "F3", enabled: true },
  "free":                { event: "E3", code: "F3", enabled: true },
  "f3":                  { event: "E3", code: "F3", enabled: true },
  "f19":                 { event: "E3", code: "F19", enabled: true },
  "f20":                 { event: "E3", code: "F20", enabled: true },
  "f21":                 { event: "E3", code: "F21", enabled: true },
  // Paid BAFT passes — parked until the Stripe call settles the Confirm step.
  "standard-delegate":   { event: "E1", code: "P1", enabled: false },
  "baft_conference_myr": { event: "E1", code: "P1", enabled: false },
  "baft_conference_usd": { event: "E1", code: "P1-INT", enabled: false },
  "p1":                  { event: "E1", code: "P1", enabled: false },
  "p1-int":              { event: "E1", code: "P1-INT", enabled: false },
  "all-inclusive":       { event: "E1", code: "P2", enabled: false },
  "baft_gala_myr":       { event: "E1", code: "P2", enabled: false },
  "baft_gala_usd":       { event: "E1", code: "P2-INT", enabled: false },
  "p2":                  { event: "E1", code: "P2", enabled: false },
  "p2-int":              { event: "E1", code: "P2-INT", enabled: false },
};

export function ticketRule(ticketType: string): TicketRule | null {
  return TICKET_RULES[String(ticketType ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Event code the registration lands in. `INTEGRATION_EVENT_SUFFIX` lets a
 * staging deployment that shares the production Firestore write into a
 * throwaway twin ("E3" + "-TEST" → "E3-TEST") while the partner keeps sending
 * the real code.
 */
export function targetEventCode(code: string, suffix: string | undefined): string {
  const s = (suffix ?? "").trim();
  return s ? `${code}${s}` : code;
}

// ─── Payload normalisation ──────────────────────────────────────────────────

export interface NormalizedRegistration {
  externalRef: string;
  ticketType: string;
  /** Explicit event override ("E3" or a Firestore id); usually absent. */
  event: string | null;
  attendee: {
    name: string;
    email: string;
    phone: string;
    company: string | null;
    jobTitle: string | null;
    industry: string | null;
  };
  days: string[] | null;
  consent: boolean | null;
  message: string | null;
}

export type NormalizeResult =
  | { ok: true; value: NormalizedRegistration }
  | { ok: false; error: string; field?: string };

const FIELD_MAX_LEN: Record<string, number> = {
  externalRef: 120, ticketType: 60, event: 60, name: 120, email: 200, phone: 32,
  company: 160, jobTitle: 160, industry: 120, message: 1000,
};

function pick(obj: any, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function str(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(t)) return true;
    if (["false", "no", "0", "off"].includes(t)) return false;
  }
  if (typeof v === "number") return v !== 0;
  return null;
}

function dayList(v: unknown): string[] | null {
  if (Array.isArray(v)) {
    const out = v.map((d) => str(d)).filter((d): d is string => !!d);
    return out.length ? out.slice(0, 10) : null;
  }
  const s = str(v);
  if (!s) return null;
  return s.split(/[,;|]/).map((d) => d.trim()).filter(Boolean).slice(0, 10);
}

/**
 * Accept the partner's field names as they are. Their complimentary form posts
 * name / email / phone / organisation / job_title / industry / days / consent;
 * our own contract uses camelCase under `attendee`. Both land here.
 */
export function normalizeRegisterPayload(body: any): NormalizeResult {
  if (!body || typeof body !== "object") return { ok: false, error: "JSON body required" };
  const a = body.attendee && typeof body.attendee === "object" ? body.attendee : {};

  const externalRef = str(pick(body, ["externalRef", "external_ref", "orderRef", "order_ref", "order_id", "orderId", "submission_id", "submissionId", "reference", "ref", "id"]));
  if (!externalRef) return { ok: false, error: "externalRef is required — your own order or submission reference", field: "externalRef" };

  const ticketType = str(pick(body, ["ticketType", "ticket_type", "pass_id", "passId", "ticket_key", "ticketKey", "pass", "ticket"])) ?? "complimentary";
  const event = str(pick(body, ["event", "eventCode", "event_code", "eventId", "event_id"]));

  const name = str(pick(a, ["fullName", "full_name", "name"]) ?? pick(body, ["fullName", "full_name", "name"]));
  const email = str(pick(a, ["email"]) ?? pick(body, ["email"]));
  const phone = str(pick(a, ["phone", "mobile", "contact_number", "contactNumber"]) ?? pick(body, ["phone", "mobile", "contact_number", "contactNumber"]));
  if (!name) return { ok: false, error: "name is required", field: "name" };
  if (!email) return { ok: false, error: "email is required", field: "email" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "email is not a valid address", field: "email" };
  if (!phone) return { ok: false, error: "phone is required", field: "phone" };

  const company = str(pick(a, ["company", "organisation", "organization", "company_name", "companyName"]) ?? pick(body, ["company", "organisation", "organization", "company_name", "companyName"]));
  const jobTitle = str(pick(a, ["jobTitle", "job_title", "designation", "position"]) ?? pick(body, ["jobTitle", "job_title", "designation", "position"]));
  const industry = str(pick(a, ["industry", "sector"]) ?? pick(body, ["industry", "sector"]));
  const days = dayList(pick(body, ["days", "attend_days", "attendDays", "day", "sessions", "session"]));
  const consent = bool(pick(body, ["consent", "pdpa", "pdpa_consent", "consented"]));
  const message = str(pick(body, ["message", "notes", "remarks"]));

  const value: NormalizedRegistration = {
    externalRef, ticketType, event,
    attendee: { name, email: email.toLowerCase(), phone, company, jobTitle, industry },
    days, consent, message,
  };

  const lengths: Record<string, string | null> = {
    externalRef, ticketType, event, name, email, phone, company, jobTitle, industry, message,
  };
  for (const [field, max] of Object.entries(FIELD_MAX_LEN)) {
    const v = lengths[field];
    if (typeof v === "string" && v.length > max) {
      return { ok: false, error: `${field} exceeds ${max} characters`, field };
    }
  }
  return { ok: true, value };
}
