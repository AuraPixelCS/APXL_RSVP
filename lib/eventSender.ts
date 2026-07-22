/**
 * Per-event sender identity.
 *
 * WHY: every outbound email used one global `RESEND_FROM`, so the sender line
 * was baked into the deployment. Running a second client's event meant editing
 * an env var — i.e. changing it for BOTH events at once. These fields move the
 * identity onto the event document.
 *
 * THE VERIFIED-DOMAIN CONSTRAINT: Resend only accepts a `from` on a domain
 * verified in the account. An admin typing an arbitrary address would silently
 * break every send for that event, so `resolveEventSender` validates the domain
 * against RESEND_ALLOWED_DOMAINS (default: the global from's own domain) and
 * falls back to the global identity when it doesn't match. Failing back to a
 * working sender beats failing to deliver.
 */

/** Fallback From used when an event specifies no sender of its own. */
export const FALLBACK_FROM = "PEOPLElogy Anniversary RSVP <events@aurapixel.live>";

/**
 * Platform-default From header. Owned here rather than in lib/resend.ts so this
 * module stays free of the Resend SDK — that keeps it importable by the tests
 * and out of any client bundle. lib/resend.ts re-exports it as `blastFrom()`.
 */
export function defaultFrom(): string {
  return process.env.RESEND_FROM?.trim() || FALLBACK_FROM;
}

export interface EventSender {
  /** Ready-to-use RFC 5322 From header. */
  from: string;
  /** Reply-To, or undefined to let the global default apply. */
  replyTo?: string;
  /** Set when a configured value was rejected — surfaced for logging/UI. */
  warning?: string;
}

/** Domains Resend will accept a `from` on. */
export function allowedSenderDomains(): string[] {
  const raw = process.env.RESEND_ALLOWED_DOMAINS?.trim();
  if (raw) {
    return raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  }
  // Fall back to the domain of the global sender — it is verified by definition,
  // since every email the app has ever sent used it.
  const domain = domainOf(extractAddress(defaultFrom()) ?? "");
  return domain ? [domain] : [];
}

/** Pull the bare address out of `Name <a@b.com>` or a plain `a@b.com`. */
function extractAddress(value: string): string | null {
  const angled = /<([^>]+)>/.exec(value);
  const candidate = (angled ? angled[1] : value).trim();
  return candidate.includes("@") ? candidate : null;
}

function domainOf(address: string): string | null {
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).trim().toLowerCase() || null;
}

/** Loose RFC-ish check — enough to reject typos, not a full validator. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]{2,}$/.test(value.trim());
}

/** True when `address` sits on a domain Resend will send for. */
export function isSenderDomainAllowed(address: string): boolean {
  const domain = domainOf(address);
  if (!domain) return false;
  const allowed = allowedSenderDomains();
  // No allow-list configured and no global default to infer from: don't block.
  if (allowed.length === 0) return true;
  return allowed.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Resolve the From/Reply-To for one event, falling back to the global identity
 * whenever the event's own values are missing or unusable.
 */
export function resolveEventSender(
  event: { senderName?: string; senderEmail?: string; replyToEmail?: string } | null | undefined,
): EventSender {
  const globalFrom = defaultFrom();
  const globalReplyTo = process.env.RESEND_REPLY_TO?.trim() || undefined;

  const name = event?.senderName?.trim();
  const address = event?.senderEmail?.trim();
  const replyToRaw = event?.replyToEmail?.trim();

  const replyTo =
    replyToRaw && isPlausibleEmail(replyToRaw) ? replyToRaw : globalReplyTo;

  // No custom address: keep the global From, but honour a custom display name
  // by re-wrapping the global address with it.
  if (!address) {
    if (name) {
      const globalAddress = extractAddress(globalFrom);
      if (globalAddress) return { from: `${name} <${globalAddress}>`, replyTo };
    }
    return { from: globalFrom, replyTo };
  }

  if (!isPlausibleEmail(address)) {
    return { from: globalFrom, replyTo, warning: `Sender "${address}" is not a valid email — using the default sender.` };
  }

  if (!isSenderDomainAllowed(address)) {
    return {
      from: globalFrom,
      replyTo,
      warning: `Sender domain for "${address}" is not verified in Resend — using the default sender.`,
    };
  }

  return { from: name ? `${name} <${address}>` : address, replyTo };
}
