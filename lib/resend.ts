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

/** From header for blast emails. Verified domain is aurapixel.live. */
export function blastFrom(): string {
  return process.env.RESEND_FROM ?? "PEOPLElogy Anniversary RSVP <events@aurapixel.live>";
}

export interface ResendMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send a batch of emails via Resend's batch API (up to 100 per call). Unlike
 * Gmail SMTP, this is a single fast HTTP request per batch — no per-message
 * connection, no serverless timeout, no tiny daily cap. Returns whether the
 * batch was accepted; Resend queues + delivers asynchronously.
 */
export async function sendResendBatch(
  messages: ResendMessage[]
): Promise<{ success: boolean; error?: string }> {
  if (messages.length === 0) return { success: true };
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const from = blastFrom();
  const replyTo = process.env.RESEND_REPLY_TO;

  try {
    const { error } = await client().batch.send(
      messages.map((m) => ({
        from,
        to: m.to,
        subject: m.subject,
        html: m.html,
        ...(replyTo ? { replyTo } : {}),
      }))
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Resend send failed" };
  }
}
