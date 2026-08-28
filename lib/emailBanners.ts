import fs from "fs";
import path from "path";

// Resend-shaped inline attachment. `contentId` is referenced in the HTML as
// `cid:<contentId>`; `content` is base64. Assignable to ResendAttachment.
export interface BannerAttachment {
  filename: string;
  content: string;
  contentId: string;
}

export interface BannerFallback {
  bannerUrl?: string;
  attachment?: BannerAttachment;
}

/**
 * PEOPLElogy banner fallback. Firebase Storage isn't paid-for on this
 * project right now, so the admin can't upload a banner via the UI.
 * Instead, drop the artwork at `public/EmailBanner.png` and this helper
 * embeds it as a CID inline attachment so it renders in the email
 * client without external image hosting.
 *
 * Returns {} for non-PEOPLElogy events or when the file is missing —
 * those events should use the normal `customEmailBanner` /
 * `customRsvpConfirmBanner` Firestore-backed URL once Storage is
 * available on the destination Firebase account.
 *
 * Caller picks the CID — use a unique value per email (e.g.
 * "rsvp_banner" for the RSVP confirmation, "email_banner" for the
 * entry pass) so the two attachments don't collide in a single send.
 */
export function loadPeoplelogyEmailBanner(eventTitle: string, cid: string): BannerFallback {
  if (!eventTitle?.toLowerCase().includes("peoplelogy")) return {};
  const bannerPath = path.join(process.cwd(), "public", "EmailBanner.png");
  if (!fs.existsSync(bannerPath)) return {};
  return {
    bannerUrl: `cid:${cid}`,
    attachment: {
      filename: "EmailBanner.png",
      content: fs.readFileSync(bannerPath).toString("base64"),
      contentId: cid,
    },
  };
}

/**
 * Banner for the entry-pass email, in priority order:
 *
 *   1. `customEmailBanner` set by the admin on the event (hosted URL).
 *   2. `public/banners/<event.code>.png` — drop the client's artwork there
 *      (e.g. `E3.png`) and it is served from the app with no Storage needed.
 *   3. The legacy hosted `EmailBanner.png`, but ONLY for the PEOPLElogy
 *      anniversary event it was made for. Every other event without artwork
 *      gets `undefined`, which renders the dark text header — a wrong banner
 *      is worse than no banner.
 *
 * `publicBase` is the reachable app origin including basePath.
 */
export function resolveEntryPassBanner(
  event: { code?: string; title?: string; customEmailBanner?: string | null },
  publicBase: string,
): string | undefined {
  if (event.customEmailBanner) return event.customEmailBanner;

  const code = String(event.code ?? "").trim();
  if (/^[A-Za-z0-9_-]+$/.test(code)) {
    const file = path.join(process.cwd(), "public", "banners", `${code}.png`);
    if (fs.existsSync(file)) return `${publicBase}/banners/${code}.png`;
  }

  if (String(event.title ?? "").toLowerCase().includes("peoplelogy")) {
    return `${publicBase}/EmailBanner.png`;
  }
  return undefined;
}
