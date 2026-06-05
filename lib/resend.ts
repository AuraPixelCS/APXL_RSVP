import { Resend } from "resend";

// Lazily instantiate so the API key is only required at runtime (not build).
let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** From header for all outbound email. Verified domain is aurapixel.live. */
export function blastFrom(): string {
  return process.env.RESEND_FROM ?? "PEOPLElogy Anniversary RSVP <events@aurapixel.live>";
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
}

/**
 * Send a SINGLE email via Resend. Used for transactional one-offs (a single
 * entry-pass notification, an RSVP confirmation). Returns whether Resend
 * accepted it; delivery happens asynchronously on Resend's side.
 */
export async function sendResendEmail(
  msg: ResendMessage
): Promise<{ success: boolean; error?: string; id?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const rt = replyTo();

  try {
    const { data, error } = await client().emails.send({
      from: msg.from ?? blastFrom(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
      ...(msg.attachments ? { attachments: msg.attachments } : {}),
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

  const rt = replyTo();

  try {
    const { error } = await client().batch.send(
      messages.map((m) => ({
        from: m.from ?? blastFrom(),
        to: m.to,
        subject: m.subject,
        html: m.html,
        ...(m.text ? { text: m.text } : {}),
        ...(m.attachments ? { attachments: m.attachments } : {}),
        ...(rt ? { replyTo: rt } : {}),
      }))
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Resend send failed" };
  }
}
