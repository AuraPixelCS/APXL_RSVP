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

// ─── Keys: production vs test ───────────────────────────────────────────────

export type KeyKind = "production" | "test";

/**
 * Two keys, one URL. The production key writes into the real events; the test
 * key writes into their "-TEST" twins (same Firestore, titles suffixed
 * "— TEST"). The partner's QA/UAT environments use the test key, so nothing
 * they do while testing can reach a real guest list — and nobody has to filter
 * by submission-id prefix.
 */
export function resolveKeyKind(
  provided: unknown,
  keys: { production?: string; test?: string },
): KeyKind | null {
  if (apiKeyMatches(provided, keys.production)) return "production";
  if (apiKeyMatches(provided, keys.test)) return "test";
  return null;
}

export const TEST_EVENT_SUFFIX = "-TEST";

// ─── Ticket → events ────────────────────────────────────────────────────────

export interface TicketRule {
  /** Our canonical code (Build Brief v3 §ticket types). */
  code: string;
  /** Short codes of every event the ticket opens, primary first. */
  events: string[];
  /** false → recognised but not open through this endpoint. */
  enabled: boolean;
  /** Single-day Summit codes: the day(s) the pass admits to, ISO dates. */
  days?: string[];
  /** Human label for responses and the admin panel. */
  label: string;
}

const SUMMIT_DAYS = ["2026-11-12", "2026-11-13", "2026-11-14"];

const P1: TicketRule   = { code: "P1",     events: ["E1", "E3"],       enabled: true, label: "BAFT delegate + 3 days Summit" };
const P1I: TicketRule  = { code: "P1-INT", events: ["E1", "E3"],       enabled: true, label: "BAFT delegate + 3 days Summit (USD)" };
const P2: TicketRule   = { code: "P2",     events: ["E1", "E2", "E3"], enabled: true, label: "BAFT delegate + Gala + 3 days Summit" };
const P2I: TicketRule  = { code: "P2-INT", events: ["E1", "E2", "E3"], enabled: true, label: "BAFT delegate + Gala + 3 days Summit (USD)" };
const F3: TicketRule   = { code: "F3",     events: ["E3"],             enabled: true, label: "Free — 3 days Summit" };
const F12: TicketRule  = { code: "F12",    events: ["E3"],             enabled: true, days: [SUMMIT_DAYS[0]], label: "Free — 12 Nov only, SME & Public" };
const F13: TicketRule  = { code: "F13",    events: ["E3"],             enabled: true, days: [SUMMIT_DAYS[1]], label: "Free — 13 Nov only, Workforce & Public" };
const F14: TicketRule  = { code: "F14",    events: ["E3"],             enabled: true, days: [SUMMIT_DAYS[2]], label: "Free — 14 Nov only, Uni & Youth / Public" };
// Internal passes open all five days; whether they include the Gala is brief
// open question 05 — E2 is left out until that is answered.
const VSP: TicketRule  = { code: "V-SP",   events: ["E1", "E3"],       enabled: true, label: "Sponsor (internal)" };
const VPT: TicketRule  = { code: "V-PT",   events: ["E1", "E3"],       enabled: true, label: "Partner (internal)" };
const VMD: TicketRule  = { code: "V-MD",   events: ["E1", "E3"],       enabled: true, label: "Media (internal)" };

/**
 * Every spelling a partner might send, lower-cased. The brief's own codes are
 * canonical; the partner's product ids are aliases so their form needs no
 * translation table. F19/F20/F21 (brief v2) are gone on purpose — v3 renamed
 * them because the days moved, so an old code must fail loudly, not remap.
 */
export const TICKET_RULES: Record<string, TicketRule> = {
  // Paid — the partner calls us only after payment is confirmed on their side.
  "p1": P1, "standard-delegate": P1, "standard_delegate": P1, "baft_conference_myr": P1, "baft_standard_myr": P1,
  "p1-int": P1I, "p1_int": P1I, "standard-delegate-int": P1I, "baft_conference_usd": P1I, "baft_standard_usd": P1I,
  "p2": P2, "all-inclusive": P2, "all_inclusive": P2, "baft_gala_myr": P2, "baft_all_inclusive_myr": P2,
  "p2-int": P2I, "p2_int": P2I, "all-inclusive-int": P2I, "baft_gala_usd": P2I, "baft_all_inclusive_usd": P2I,
  // Free Summit — the partner's #pass-complimentary form.
  "f3": F3, "complimentary": F3, "pass-complimentary": F3, "complimentary-pass": F3,
  "nairw-complimentary": F3, "nairw_complimentary": F3, "free": F3,
  "f12": F12, "f13": F13, "f14": F14,
  // Internal.
  "v-sp": VSP, "v_sp": VSP, "sponsor": VSP,
  "v-pt": VPT, "v_pt": VPT, "partner": VPT,
  "v-md": VMD, "v_md": VMD, "media": VMD,
};

export function ticketRule(ticketType: string): TicketRule | null {
  return TICKET_RULES[String(ticketType ?? "").trim().toLowerCase()] ?? null;
}

/** Event code a registration lands in: the real event, or its test twin. */
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
  // Phone is OPTIONAL here on purpose (2026-08-30): the partner's delegate
  // form doesn't always have one — a company booking seats gives names and
  // emails weeks ahead. Requiring it made their code drop those delegates,
  // who then silently got no pass. Nothing in this path uses the number.

  const company = str(pick(a, ["company", "organisation", "organization", "company_name", "companyName"]) ?? pick(body, ["company", "organisation", "organization", "company_name", "companyName"]));
  const jobTitle = str(pick(a, ["jobTitle", "job_title", "designation", "position"]) ?? pick(body, ["jobTitle", "job_title", "designation", "position"]));
  const industry = str(pick(a, ["industry", "sector"]) ?? pick(body, ["industry", "sector"]));
  const days = dayList(pick(body, ["days", "attend_days", "attendDays", "day", "sessions", "session"]));
  const consent = bool(pick(body, ["consent", "pdpa", "pdpa_consent", "consented"]));
  const message = str(pick(body, ["message", "notes", "remarks"]));

  const value: NormalizedRegistration = {
    externalRef, ticketType, event,
    attendee: { name, email: email.toLowerCase(), phone: phone ?? "", company, jobTitle, industry },
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
