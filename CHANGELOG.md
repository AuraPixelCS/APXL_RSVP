# Changelog

## [1.6.0] — 2026-05-28

- **VIP tables on banquet layouts.** New per-event `seatingConfig.vipTables` array lets admins add round tables that render near the stage, separate from the standard seating grid. Each VIP table has a custom label (e.g. "Stage Front") and configurable seat count (4–20). PEOPLElogy uses one 12-seat VIP table at the front.
- **Stage bar above banquet layouts.** Banquet and banquet-runway seat maps now show a labeled "STAGE" strip at the top so VIP placement reads correctly. The banquet-runway's existing inline stage was replaced by the shared component.
- **VIP visual treatment.** Gold/amber accent (`#d4af37`) on the table circle, gold border on the card, and a "VIP" pill above the table. Available VIP seats use a gold fill so they're distinguishable from standard available seats at a glance. Inner table label is `T1`, `T2`… (the editable label like "Stage Front" appears in the admin configurator and in confirmation emails/WhatsApp).
- **Seat numbering.** VIP seats continue the numeric range above `totalSeats` (e.g. 201–212 for a 12-seat VIP table appended to a 200-seat event). Confirmation emails show a dedicated "VIP Table" row with the label; subject lines and WhatsApp templates include `VIP {label} #{seatInTable}` instead of `Seat #N`.
- **Safe additive edits.** Appending new VIP tables on an event with allocated guests no longer triggers the "clear allocations" warning — only changes that could orphan existing seat numbers (shrinking a VIP table, reordering, removing) do.

## [1.5.2] — 2026-05-16

- **PEOPLElogy banner fallback for the RSVP confirmation email.** Firebase Storage isn't paid-for on the current account, so the admin upload path can't be used. When the event title contains "peoplelogy" and the admin hasn't set `customRsvpConfirmBanner`, the server now embeds `public/EmailBanner.png` as a CID inline attachment so the banner renders without external image hosting. Other events still go through the Storage URL path once Storage is paid-for on the destination account.
- **Fix: `public/EmilBanner.png` → `public/EmailBanner.png` rename.** The misspelled filename meant the existing entry-pass PEOPLElogy banner fallback in `notify.ts` (which looks for `EmailBanner.png`) had been silently failing. Both emails now use the same 600×200 banner file.

## [1.5.1] — 2026-05-16

- **New toggle: "Show event title under banner"** on the Notifications page Template tab. When off (default), uploaded banners render with no accompanying text — banner only. When on, a thin dark strip with the event title appears beneath the banner on both the RSVP Confirmation and Entry Pass emails. Persisted on the event doc as `showEventTitleOnBanner`.
- Notifications page tab order flipped: **Allocated Guests** is now first and the default selected tab; Template is second.

## [1.5.0] — 2026-05-16

- **RSVP Confirmation email is now per-event.** `buildRsvpConfirmEmail` is genericized — body, subject, calendar link, and venue/date copy are derived from the event document instead of hardcoded PEOPLElogy text. The same template now works for any future event without code changes.
- **New per-event banner: RSVP Confirmation header banner.** Stored on the event doc as `customRsvpConfirmBanner` (Firebase Storage URL). When set, replaces the dark text header on the confirmation email. When unset, the dark header now reads the event title.
- **Entry Pass email default header** — was the literal string "AuraPixel"; now defaults to the event title (still overridable via the legacy `customEmailTitle` field for backwards compat).
- **Notifications admin page restructured into two tabs**:
  - **Template** — only banner uploaders (Entry Pass + RSVP Confirmation). The freeform Header Title and Body inputs were removed; copy is shared across all events going forward.
  - **Allocated Guests** — the existing guest-notification table.
- Confirmation email send sites updated everywhere they're called: `/api/rsvp/submit`, `/api/rsvp/webhook`, and `/api/admin/events/import-csv` now all pass event-derived data + the new banner URL.

## [1.4.2] — 2026-05-16

- **Scanner check-in fix**: `/api/qr/verify` now accepts `allocated` status (a guest with a seat assigned but who hasn't shown up yet), not just `attending`. Previously the verify gate rejected anyone with `allocated`, which is the realistic state of most pre-event check-ins, so the rsvp-app scanner could never proceed past verify into the actual `/api/scanner/checkin` write.
- **Friendlier scanner error copy** in `/api/qr/verify`:
  - `Invalid or forged QR Code` → `Not valid`
  - Already-checked-in guests now get a dedicated `Already checked in` (400) instead of the generic `RSVP is marked as checked_in` message.

## [1.4.1] — 2026-05-15

- Seat map modal widened from `max-w-4xl` (896px) → `max-w-[1400px]` so wide banquet/banquet-runway layouts (e.g. PEOPLElogy 300-seat, 30-table) fit more tables on screen at once.
- Fixed horizontal scrollbar not reaching the leftmost/rightmost edges. The seat-grid container now uses `justify-content: safe center` with `overflow: auto` so content centers when it fits but falls back to scroll-from-left when it overflows — keeping the leading tables reachable.
- BanquetRunway stage bar now spans the full natural row width (previously capped by an `SVG_SIZE * perRow` underestimate that left a visible gap above the rows).

## [1.4.0] — 2026-05-15

- New seating field: **`tablesPerSide`** controls how many tables sit on each side of the row for both **Banquet** and **Banquet Runway** layouts. Entering `3` produces 3 tables left + 3 tables right per row (6 total). Configurable per event in the create wizard and Edit Layout. Defaults: banquet = 2 per side, banquet-runway = 1 per side. Cap 1–6.
- Banquet seat map gains a fixed left/right structure when `tablesPerSide` is set; existing banquet events without the field continue to render the legacy responsive grid (no surprise visual changes).
- Banquet Runway seat map replaces its hardcoded 1+1 alternation with packed N+N rows around the red carpet aisle.
- Flipping only `tablesPerSide` is treated as a purely cosmetic update — no allocation reset, no destructive confirm, QR tokens preserved. (Reuses the same `configsEqual` path that already excludes `assignmentMode`.)
- Live preview in the configurator reflects the new arrangement in real time as the admin tweaks the value.
- Bugfix: `/api/admin/events/import-csv` calls from [components/ui/ImportCsvModal.tsx](components/ui/ImportCsvModal.tsx) now include the `Authorization: Bearer <idToken>` header. Previously every CSV import returned 401 Unauthorized because the only admin call site without `getAuthHeaders()` was this one.

## [1.3.0] — 2026-05-12

- New seating layout: **Banquet Runway** — stage at front, red carpet aisle down the center, round tables arranged on both sides of the runway. Tables alternate left/right and stack vertically. Uses `seatsPerTable` for sizing (default 10). Selectable in the event creation wizard and via Edit Layout in the seat map modal. ([types/index.ts](types/index.ts), [components/ui/SeatingConfigurator.tsx](components/ui/SeatingConfigurator.tsx), [components/ui/SeatMapModal.tsx](components/ui/SeatMapModal.tsx))
- Email/WhatsApp `Row + Seat` derivation in [pages/api/notify.ts](pages/api/notify.ts) is now skipped for banquet/banquet-runway layouts (tables don't have meaningful row letters); those events use the existing `Table No. #X` flow.

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
