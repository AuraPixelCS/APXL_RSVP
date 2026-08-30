import { Resend } from "resend";
import { defaultFrom } from "@/lib/eventSender";

// Lazily instantiate so the API key is only required at runtime (not build).
let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * From header for outbound email that carries no per-event sender.
 * The value lives in lib/eventSender.ts so the resolver there stays free of
 * this module (and of the Resend SDK); this is a re-export for callers.
 */
export function blastFrom(): string {
  return defaultFrom();
}

function replyTo(): string | undefined {
  return process.env.RESEND_REPLY_TO;
}

/**
 * Attachment in Resend's shape. For an INLINE image (e.g. the QR code or the
 * email banner), set `contentId` and reference it in the HTML as
 * `cid:<contentId>`. `content` may be a base64 string or a Buffer. `path` is for
 * REMOTE URLs only (Resend fetches them) — never a local filesystem path.
 */
export interface ResendAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentId?: string;
  contentType?: string;
}

export interface ResendMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative — improves deliverability/spam score and a11y. */
  text?: string;
  attachments?: ResendAttachment[];
  /** Overrides the default `blastFrom()` sender. */
  from?: string;
  /** Overrides the global RESEND_REPLY_TO — set per event so guest replies
   *  reach that event's organiser rather than one shared inbox. */
  replyTo?: string;
  /** Extra SMTP headers (e.g. List-Unsubscribe) — improves deliverability. */
  headers?: Record<string, string>;
  /** Resend tags, echoed back on delivery webhooks so an async callback can
   *  find the RSVP this message belongs to. See lib/emailDelivery.ts. */
  tags?: { name: string; value: string }[];
}

/**
 * Resend's API allows a small number of requests per second. The partner's
 * backfill (one Register call per delegate, each sending a pass) can exceed
 * that, and a 429 there would leave a registration with no pass until an admin
 * resends. A short retry absorbs the burst instead.
 */
const RATE_LIMIT_ATTEMPTS = 4;
const RATE_LIMIT_BACKOFF_MS = 700;

function isRateLimited(message: string | undefined): boolean {
  return /rate[_ ]limit|too many requests|\b429\b/i.test(message ?? "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send a SINGLE email via Resend. Used for transactional one-offs (a single
 * entry-pass notification, an RSVP confirmation). Returns whether Resend
 * accepted it; delivery happens asynchronously on Resend's side. Retries on a
 * rate-limit response with a short backoff.
 */
export async function sendResendEmail(
  msg: ResendMessage
): Promise<{ success: boolean; error?: string; id?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }
  let result = await sendResendEmailOnce(msg);
  for (let attempt = 1; attempt < RATE_LIMIT_ATTEMPTS && !result.success && isRateLimited(result.error); attempt++) {
    await sleep(RATE_LIMIT_BACKOFF_MS * attempt);
    result = await sendResendEmailOnce(msg);
  }
  return result;
}

async function sendResendEmailOnce(
  msg: ResendMessage
): Promise<{ success: boolean; error?: string; id?: string }> {
  const rt = msg.replyTo ?? replyTo();

  try {
    const { data, error } = await client().emails.send({
      from: msg.from ?? blastFrom(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
      ...(msg.attachments ? { attachments: msg.attachments } : {}),
      ...(msg.headers ? { headers: msg.headers } : {}),
      ...(msg.tags ? { tags: msg.tags } : {}),
      ...(rt ? { replyTo: rt } : {}),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Resend send failed" };
  }
}

/**
 * Send a batch of emails via Resend's batch API (up to 100 per call). Unlike
 * Gmail SMTP, this is a single fast HTTP request per batch — no per-message
 * connection, no serverless timeout, no tiny daily cap, no per-message
 * rate-limit churn. Each message may carry its own inline attachments (the
 * per-recipient QR code). Returns whether the batch was accepted; Resend queues
 * + delivers asynchronously. Callers should chunk inputs to ≤100 per call.
 */
export async function sendResendBatch(
  messages: ResendMessage[]
): Promise<{ success: boolean; error?: string }> {
  if (messages.length === 0) return { success: true };
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const fallbackRt = replyTo();

  try {
    const { error } = await client().batch.send(
      messages.map((m) => {
        const rt = m.replyTo ?? fallbackRt;
        return {
          from: m.from ?? blastFrom(),
          to: m.to,
          subject: m.subject,
          html: m.html,
          ...(m.text ? { text: m.text } : {}),
          ...(m.attachments ? { attachments: m.attachments } : {}),
          ...(m.headers ? { headers: m.headers } : {}),
          ...(m.tags ? { tags: m.tags } : {}),
          ...(rt ? { replyTo: rt } : {}),
        };
      })
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Resend send failed" };
  }
}
