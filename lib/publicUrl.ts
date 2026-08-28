/**
 * Publicly-reachable base URL for links and assets placed inside emails.
 *
 * WHY NOT JUST USE THE REQUEST ORIGIN: when an admin triggers a send from a
 * local dev session the origin is `http://localhost:3000`. Recipients cannot
 * reach that, so banners break and self-service links 404 — in someone else's
 * inbox, where nobody notices until they complain.
 *
 * Order: explicit env override, then a non-localhost request origin, then the
 * production domain.
 */

const PRODUCTION_BASE = "https://www.aurapixel.live/rsvp";

/** True for hosts only reachable from the machine that generated them. */
function isLocal(origin: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(origin);
}

export function resolvePublicBase(origin: string): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  if (origin && !isLocal(origin)) return origin.replace(/\/+$/, "");
  return PRODUCTION_BASE;
}

/** Best-effort origin for an incoming API request, behind Vercel's proxy. */
export function originFromRequest(req: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const header = (name: string): string => {
    const v = req.headers[name];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const explicit = header("origin");
  if (explicit) return explicit;

  const host = header("x-forwarded-host") || header("host");
  if (!host) return "";
  const proto = header("x-forwarded-proto") || (isLocal(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Public base for a request — the combination the email builders actually want. */
export function publicBaseFor(req: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  return resolvePublicBase(originFromRequest(req));
}
