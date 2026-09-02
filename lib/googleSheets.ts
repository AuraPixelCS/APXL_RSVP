/**
 * Google Sheet mirror of the guest lists.
 *
 * The client's ops team lives in Sheets, not in our admin panel — this keeps
 * one spreadsheet (tab per event) in step with Firestore so they always have
 * a current list with payment state, without anyone exporting CSVs.
 *
 * Sync model: full tab rewrite. Volume is hundreds of rows, so rewriting is
 * cheaper than diffing and is idempotent — a missed sync heals on the next
 * one. Triggered after every integration write (register / cancel / payment
 * confirm) and from the admin panel's "Open Google Sheet" action.
 *
 * Auth is a Google service account signed with node's own crypto (RS256 JWT
 * exchanged for an access token) — no googleapis dependency. The service
 * account must be shared onto the spreadsheet as an editor.
 *
 * Env:
 *   GOOGLE_SHEETS_SERVICE_ACCOUNT — the service account's JSON key, as one line
 *   GOOGLE_SHEET_ID               — the spreadsheet id (from its URL)
 * Unset → every export here is a silent no-op, so the feature is opt-in.
 */

import crypto from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { paymentMethodLabel, TEST_EVENT_SUFFIX } from "@/lib/integration";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TIMEZONE = "Asia/Kuala_Lumpur";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) return null;
    // A key pasted through an env UI often arrives with literal "\n".
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    return parsed;
  } catch {
    console.error("[googleSheets] GOOGLE_SHEETS_SERVICE_ACCOUNT is not valid JSON");
    return null;
  }
}

export function sheetsConfigured(): boolean {
  return !!(process.env.GOOGLE_SHEET_ID && serviceAccount());
}

// ─── Access token (cached until near expiry) ────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const sa = serviceAccount();
  if (!sa) throw new Error("Google Sheets service account not configured");

  // Backdated 60s: serverless clocks drift, and Google rejects a JWT whose
  // iat sits even slightly in the future ("token used too early").
  const iat = Math.floor(Date.now() / 1000) - 60;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function sheetsFetch(path: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}/${process.env.GOOGLE_SHEET_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Sheets API ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ─── Row building ───────────────────────────────────────────────────────────

const HEADERS = [
  "Name", "Email", "Phone", "Company", "Job Title",
  "Ticket", "Reference", "Status", "Payment Method", "Payment Confirmed",
  "Days", "Seat", "Registered", "Checked In",
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  allocated: "Allocated",
  checked_in: "Checked In",
  waitlisted: "Waitlisted",
  not_attending: "Not Attending",
  cancelled: "Cancelled",
  unpaid: "AWAITING PAYMENT",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: TIMEZONE, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function guestRow(r: any): (string | number)[] {
  const paymentConfirmed =
    r.status === "unpaid" ? "NO"
    : r.paymentConfirmedAt ? `Yes — ${fmtDate(r.paymentConfirmedAt)}`
    : r.paymentMethod ? "Yes"
    : "—";
  return [
    r.name ?? "",
    r.email ?? "",
    r.phone ?? "",
    r.company ?? "",
    r.jobTitle ?? "",
    r.ticketType ?? "",
    r.externalRef ?? "",
    STATUS_LABEL[r.status] ?? r.status ?? "",
    r.paymentMethod ? paymentMethodLabel(r.paymentMethod) : "—",
    paymentConfirmed,
    Array.isArray(r.days) && r.days.length ? r.days.join(", ") : "",
    r.seatNumber != null ? String(r.seatNumber) : "",
    fmtDate(r.submittedAt),
    fmtDate(r.checkedInAt ?? r.checkInTime),
  ];
}

// ─── Sync ───────────────────────────────────────────────────────────────────

function tabTitle(event: { code?: string; title?: string }): string {
  return event.code || (event.title ?? "Event").slice(0, 90);
}

async function ensureTab(title: string): Promise<void> {
  const meta = await sheetsFetch("?fields=sheets.properties.title");
  const existing: string[] = (meta.sheets ?? []).map((s: any) => s.properties?.title);
  if (existing.includes(title)) return;
  await sheetsFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
}

async function writeTab(title: string, rows: (string | number)[][]): Promise<void> {
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'`);
  await sheetsFetch(`/values/${range}!A:Z:clear`, { method: "POST", body: "{}" });
  await sheetsFetch(`/values/${range}!A1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
  });
}

async function syncEventTab(event: any): Promise<void> {
  const snap = await adminDb.collection("events").doc(event.id).collection("rsvps").get();
  const rsvps = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as any)
    .sort((a, b) => String(a.submittedAt ?? "").localeCompare(String(b.submittedAt ?? "")));

  const stamp = new Date().toLocaleString("en-GB", { timeZone: TIMEZONE, dateStyle: "medium", timeStyle: "short" });
  const rows: (string | number)[][] = [
    [event.title ?? event.code ?? "", "", `Auto-updated ${stamp} (MYT)`, "", `${rsvps.length} registrations`],
    HEADERS,
    ...rsvps.map(guestRow),
  ];

  const title = tabTitle(event);
  await ensureTab(title);
  await writeTab(title, rows);
}

/**
 * Mirror the given events (by short code, e.g. ["E1","E3"]) into the sheet;
 * no argument → every real event that has a code. Test twins never sync — the
 * sheet belongs to the client and UAT noise would look like real delegates.
 * Never throws: a sheet failure is logged and swallowed, because every caller
 * has already done the write that matters.
 */
export async function syncSheetForEvents(codes?: string[]): Promise<{ synced: string[]; skipped: boolean }> {
  if (!sheetsConfigured()) return { synced: [], skipped: true };
  let lastError: unknown = null;
  // Two attempts: the first production registration's sync was lost to a
  // one-off failure that a single retry (with a fresh token) would have
  // absorbed. The sheet is a mirror, so a repeat write is harmless.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const snap = await adminDb.collection("events").get();
      const events = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as any)
        .filter((e) => typeof e.code === "string" && e.code && !e.code.endsWith(TEST_EVENT_SUFFIX))
        .filter((e) => !codes || codes.includes(e.code));
      for (const event of events) {
        await syncEventTab(event);
      }
      await recordSyncOutcome(null);
      return { synced: events.map((e) => e.code as string), skipped: false };
    } catch (e) {
      lastError = e;
      cachedToken = null; // a stale/rejected token is the likeliest transient cause
      console.error(`[googleSheets] sync attempt ${attempt} failed:`, e);
    }
  }
  await recordSyncOutcome(lastError);
  return { synced: [], skipped: true };
}

/**
 * Leave a trace of the last sync in Firestore (`system/sheetSync`), so a
 * silently swallowed failure is at least visible somewhere — the register
 * endpoint must never surface a sheet error to the partner.
 */
async function recordSyncOutcome(error: unknown): Promise<void> {
  try {
    const now = new Date().toISOString();
    await adminDb.doc("system/sheetSync").set(
      error
        ? { lastFailureAt: now, lastError: String(error).slice(0, 500) }
        : { lastSyncedAt: now },
      { merge: true },
    );
  } catch {
    // Observability must never break the sync itself.
  }
}
