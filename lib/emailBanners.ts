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
