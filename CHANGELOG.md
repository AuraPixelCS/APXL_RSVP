# Changelog

## [1.2.1] — 2026-05-12

- Ported RSVP project to the AuraPixel Vercel account (team `aurapixelcs`) and pushed the source to a fresh `AuraPixelCS/APXL_RSVP` GitHub repo. Public URL contract unchanged — `aurapixel.live/rsvp/*` now proxies via the landing-page's `next.config.ts` rewrite to `https://apxl-rsvp.vercel.app/*` instead of the legacy `aurapixel-rsvp.vercel.app`.
- Version bump verifies the new project's auto-deploy pipeline (push to `main` → Vercel build → live on `apxl-rsvp.vercel.app` → reachable via `aurapixel.live/rsvp`).

## [1.2.0] — 2026-05-11

- Seat assignment now derives a human-readable `Row + Seat` label (e.g. `Row A · Seat 7`) from the global seat integer instead of exposing the raw number. New helper [lib/seatLabel.ts](lib/seatLabel.ts) is consumed by the confirmation email, subject line, WhatsApp `seat` parameter, and the seat map detail panel.
- Confirmation email (`buildSeatEmail` in [lib/emailTemplates.ts](lib/emailTemplates.ts)) renders Row and Seat No. as two separate rows in the event-details table when in seat mode. Subject line becomes `Your Entry Pass — Seat A7 | …`.
- Seat map ([components/ui/SeatMapModal.tsx](components/ui/SeatMapModal.tsx)) now renders the position-within-row number (1–10) inside each seat circle in seat mode, with bolder, accent-blue row letters so `A`–`J` reads clearly as a column header. Seat size bumped 22→24px to fit the labels.
- Admin can now flip an event's `assignmentMode` (seat ↔ table) **after** creation via a toggle inside **Edit Layout** in the seat map modal. The `/api/admin/change-layout` endpoint now accepts an optional `assignmentMode` and only resets allocated RSVPs when the underlying layout actually changes — a pure mode flip preserves allocations and QR tokens.
- One-off helper script: `node scripts/set-assignment-mode.js <titleSubstring> seat|table` for flipping an event's mode directly in Firestore without the UI.

## [1.1.2] — 2026-05-11

- Added "Add to Google Calendar" CTA button to the first RSVP confirmation email so guests can one-click block 19 June 2026, 5:30 PM – 10:30 PM MYT at Renaissance Hotel, Kuala Lumpur in their calendar. Implemented in `buildRsvpConfirmEmail` ([lib/emailTemplates.ts](lib/emailTemplates.ts)). Second/QR seat email (`buildSeatEmail`) is unchanged.
