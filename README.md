# Changelog

All production deployments are recorded here. Format: `## [version] — YYYY-MM-DD`.

## [2.0.2] — 2026-05-30

### Changed
- **Settings → Account panel** alignment overhaul: container widened from `max-w-lg` → `max-w-2xl` so it matches the Workspace panel; Password and Session cards now share one identical layout (header on the left, action button on the right, no row-stacking inconsistency); profile card uses a divider above the Save row; button touch targets bumped to `px-4 py-2` for comfortable tap targets.
- **Settings → Workspace panel** grid fixed: the old 3-column grid left an orphan empty cell because 5 cards don't fit cleanly into 3 columns. Now split into two intentional rows — a 3-column **System Info** row (App Version, Firebase Project, Signed In) and a 2-column (or full-width for non-admins) **Counts** row (Total Events, Total Users). No orphan cells in either role.
- **InfoCard** standardized: removed the inconsistent `small` font flag that made some values render at 12px and others at 16px in the same row. Replaced with an `emphasis` flag — counts render at 22px with bold weight to read as primary metrics, system info renders uniformly at 14px.

## [2.0.1] — 2026-05-30

### Added
- **Inline Cancel Seat** on the seat map: clicking an allocated seat now shows both **Change [Seat/Table/VIP]** *and* **Cancel [Seat/Table/VIP]** buttons in the `SeatDetailPanel`. Cancel uses a two-step inline confirm (first click reveals "Confirm Cancel" + a "Keep" escape, second click executes) so admins no longer need to close the seat map, find the row, and confirm a native dialog just to deallocate.
- **Red post-cancel highlight**: after a successful inline cancel, the seat in the grid is ringed in red instead of the usual blue selection ring. Gives the admin instant visual confirmation the deallocation went through, even before the Firestore snapshot fully propagates the empty-seat state. The red mark clears automatically when the admin clicks any other seat or closes the modal.

### Changed
- **Seat map stays open after Change Seat / Change VIP**. First-time allocation still auto-closes the modal (returning to the list view), but reassignments now keep the modal open so the admin can visually verify the move and continue managing seats without re-opening. Selection mode exits, so the panel transitions straight back to inspect mode.
- `selectedSeat` snapshot in `SeatMapModal` now syncs with the live `allSeats` derived from the Firestore subscription. Previously the panel held a stale snapshot captured at click time, so a cancel or reassign would leave outdated guest info visible until the modal was reopened. Now it re-renders to reflect live state in the same tick the subscription fires.

## [2.0.0] — 2026-05-29

### Major UI/UX overhaul of the entire admin experience.

### Added
- **Admin Events page redesign**: `EventCard` rebuilt with cover-image hero, live stats grid (Allocated / RSVPs / Pending / Unnotified), countdown chip ("TODAY" / "TOMORROW" / "ACTIVE" / "PAST"), and inline footer actions. Admin index now uses real-time Firestore subscriptions with Upcoming / Past tabs and a search input.
- **Pin to top**: Admins can pin upcoming events to the top of the grid. New `pinned` field on the `Event` type; pin toggle is admin-only and only visible on the Upcoming tab. Pinned cards sort first; the rest sort by date.
- **Event Details revamp**: New context-aware hero components on `/admin/events/[id]` with a `MoreMenu` dropdown for secondary actions and a clear back-navigation pattern.
- **Notifications page revamp** (`/admin/events/[id]/notifications`): `NotificationHero` summary with animated SVG progress ring, color-coded status filter pills, search input, empty-state handling, and a floating sticky **Bulk Notify** FAB for fast action without scrolling.
- **Dashboard becomes pure analytics**: `/admin/dashboard` rebuilt as a standalone analytics surface with KPIs, charts, a heatmap, and scope filtering — separate concern from `/admin` (events management). Powered by `recharts`.
- **Settings revamp**: `/admin/settings` redesigned with **Account** and **Workspace** panels.
- **Brand asset refresh**: New `ap-logo-small.png` and `aurapixel-tight.png` shipped, plus updated favicons / apple-touch / Android Chrome icons across `public/`. Login form and Sidebar updated to use the new assets.

### Changed
- **EventCard footer** redesigned: the action bar is now a solid **brand-blue** strip. The **Open** button is inverted (white background with blue text) and the **Notifications** button uses a translucent dark fill with a soft white border, so both read cleanly against the blue. The unnotified badge is also inverted to match.
- **EventCard cover banner** removed (replaced with a tighter layout focused on stats and quick actions).
- **EventCard grid alignment**: card slots use fixed heights to prevent rag-stack visual noise across rows of mixed-content cards.
- Sidebar, LoginForm, and the public RSVP page (`/`) refreshed to align with the new brand assets and dashboard separation.

### Notes
- All revamps were generated via the `/ui-ux-pro-max` skill in a single sprint and validated with `tsc --noEmit` + `next build` between each page.
- This is a UI/UX milestone release — no schema migrations and no breaking API changes.

---

## [1.6.0] — 2026-05-28

- **VIP tables on banquet layouts.** New per-event `seatingConfig.vipTables` array lets admins add round tables that render near the stage, separate from the standard seating grid. Each VIP table has a custom label (e.g. "Stage Front") and configurable seat count (4–20). PEOPLElogy uses one 12-seat VIP table at the front.
- **Stage bar above banquet layouts.** Banquet and banquet-runway seat maps now show a labeled "STAGE" strip at the top so VIP placement reads correctly. The banquet-runway's existing inline stage was replaced by the shared component.
- **VIP visual treatment.** Gold/amber accent (`#d4af37`) on the table circle, gold border on the card, and a "VIP" pill above the table. Available VIP seats use a gold fill so they're distinguishable from standard available seats at a glance. Inner table label is `T1`, `T2`… (the editable label like "Stage Front" appears in the admin configurator and in confirmation emails/WhatsApp).
- **Seat numbering.** VIP seats continue the numeric range above `totalSeats` (e.g. 201–212 for a 12-seat VIP table appended to a 200-seat event). Confirmation emails show a dedicated "VIP Table" row with the label; subject lines and WhatsApp templates include `VIP {label} #{seatInTable}` instead of `Seat #N`.
- **Safe additive edits.** Appending new VIP tables on an event with allocated guests no longer triggers the "clear allocations" warning — only changes that could orphan existing seat numbers (shrinking a VIP table, reordering, removing) do.

---

## [1.5.2] — 2026-05-16

- **PEOPLElogy banner fallback for the RSVP confirmation email.** Firebase Storage isn't paid-for on the current account, so the admin upload path can't be used. When the event title contains "peoplelogy" and the admin hasn't set `customRsvpConfirmBanner`, the server now embeds `public/EmailBanner.png` as a CID inline attachment so the banner renders without external image hosting. Other events still go through the Storage URL path once Storage is paid-for on the destination account.
- **Fix: `public/EmilBanner.png` → `public/EmailBanner.png` rename.** The misspelled filename meant the existing entry-pass PEOPLElogy banner fallback in `notify.ts` (which looks for `EmailBanner.png`) had been silently failing. Both emails now use the same 600×200 banner file.

---

## [1.5.1] — 2026-05-16

- **New toggle: "Show event title under banner"** on the Notifications page Template tab. When off (default), uploaded banners render with no accompanying text — banner only. When on, a thin dark strip with the event title appears beneath the banner on both the RSVP Confirmation and Entry Pass emails. Persisted on the event doc as `showEventTitleOnBanner`.
- Notifications page tab order flipped: **Allocated Guests** is now first and the default selected tab; Template is second.

---

## [1.5.0] — 2026-05-16

- **RSVP Confirmation email is now per-event.** `buildRsvpConfirmEmail` is genericized — body, subject, calendar link, and venue/date copy are derived from the event document instead of hardcoded PEOPLElogy text. The same template now works for any future event without code changes.
- **New per-event banner: RSVP Confirmation header banner.** Stored on the event doc as `customRsvpConfirmBanner` (Firebase Storage URL). When set, replaces the dark text header on the confirmation email. When unset, the dark header now reads the event title.
- **Entry Pass email default header** — was the literal string "AuraPixel"; now defaults to the event title (still overridable via the legacy `customEmailTitle` field for backwards compat).
- **Notifications admin page restructured into two tabs**:
  - **Template** — only banner uploaders (Entry Pass + RSVP Confirmation). The freeform Header Title and Body inputs were removed; copy is shared across all events going forward.
  - **Allocated Guests** — the existing guest-notification table.
- Confirmation email send sites updated everywhere they're called: `/api/rsvp/submit`, `/api/rsvp/webhook`, and `/api/admin/events/import-csv` now all pass event-derived data + the new banner URL.

---

## [1.4.2] — 2026-05-16

- **Scanner check-in fix**: `/api/qr/verify` now accepts `allocated` status (a guest with a seat assigned but who hasn't shown up yet), not just `attending`. Previously the verify gate rejected anyone with `allocated`, which is the realistic state of most pre-event check-ins, so the rsvp-app scanner could never proceed past verify into the actual `/api/scanner/checkin` write.
- **Friendlier scanner error copy** in `/api/qr/verify`:
  - `Invalid or forged QR Code` → `Not valid`
  - Already-checked-in guests now get a dedicated `Already checked in` (400) instead of the generic `RSVP is marked as checked_in` message.

---

## [1.4.1] — 2026-05-15

- Seat map modal widened from `max-w-4xl` (896px) → `max-w-[1400px]` so wide banquet/banquet-runway layouts (e.g. PEOPLElogy 300-seat, 30-table) fit more tables on screen at once.
- Fixed horizontal scrollbar not reaching the leftmost/rightmost edges. The seat-grid container now uses `justify-content: safe center` with `overflow: auto` so content centers when it fits but falls back to scroll-from-left when it overflows — keeping the leading tables reachable.
- BanquetRunway stage bar now spans the full natural row width (previously capped by an `SVG_SIZE * perRow` underestimate that left a visible gap above the rows).

---

## [1.4.0] — 2026-05-15

- New seating field: **`tablesPerSide`** controls how many tables sit on each side of the row for both **Banquet** and **Banquet Runway** layouts. Entering `3` produces 3 tables left + 3 tables right per row (6 total). Configurable per event in the create wizard and Edit Layout. Defaults: banquet = 2 per side, banquet-runway = 1 per side. Cap 1–6.
- Banquet seat map gains a fixed left/right structure when `tablesPerSide` is set; existing banquet events without the field continue to render the legacy responsive grid (no surprise visual changes).
- Banquet Runway seat map replaces its hardcoded 1+1 alternation with packed N+N rows around the red carpet aisle.
- Flipping only `tablesPerSide` is treated as a purely cosmetic update — no allocation reset, no destructive confirm, QR tokens preserved. (Reuses the same `configsEqual` path that already excludes `assignmentMode`.)
- Live preview in the configurator reflects the new arrangement in real time as the admin tweaks the value.
- Bugfix: `/api/admin/events/import-csv` calls from `components/ui/ImportCsvModal.tsx` now include the `Authorization: Bearer <idToken>` header. Previously every CSV import returned 401 Unauthorized because the only admin call site without `getAuthHeaders()` was this one.

---

## [1.3.0] — 2026-05-12

- New seating layout: **Banquet Runway** — stage at front, red carpet aisle down the center, round tables arranged on both sides of the runway. Tables alternate left/right and stack vertically. Uses `seatsPerTable` for sizing (default 10). Selectable in the event creation wizard and via Edit Layout in the seat map modal.
- Email/WhatsApp `Row + Seat` derivation in `pages/api/notify.ts` is now skipped for banquet/banquet-runway layouts (tables don't have meaningful row letters); those events use the existing `Table No. #X` flow.

---

## [1.2.1] — 2026-05-12

- Ported RSVP project to the AuraPixel Vercel account (team `aurapixelcs`) and pushed the source to a fresh `AuraPixelCS/APXL_RSVP` GitHub repo. Public URL contract unchanged — `aurapixel.live/rsvp/*` now proxies via the landing-page's `next.config.ts` rewrite to `https://apxl-rsvp.vercel.app/*` instead of the legacy `aurapixel-rsvp.vercel.app`.
- Version bump verifies the new project's auto-deploy pipeline (push to `main` → Vercel build → live on `apxl-rsvp.vercel.app` → reachable via `aurapixel.live/rsvp`).

---

## [1.2.0] — 2026-05-11

- Seat assignment now derives a human-readable `Row + Seat` label (e.g. `Row A · Seat 7`) from the global seat integer instead of exposing the raw number. New helper `lib/seatLabel.ts` is consumed by the confirmation email, subject line, WhatsApp `seat` parameter, and the seat map detail panel.
- Confirmation email (`buildSeatEmail` in `lib/emailTemplates.ts`) renders Row and Seat No. as two separate rows in the event-details table when in seat mode. Subject line becomes `Your Entry Pass — Seat A7 | …`.
- Seat map (`components/ui/SeatMapModal.tsx`) now renders the position-within-row number (1–10) inside each seat circle in seat mode, with bolder, accent-blue row letters so `A`–`J` reads clearly as a column header. Seat size bumped 22→24px to fit the labels.
- Admin can now flip an event's `assignmentMode` (seat ↔ table) **after** creation via a toggle inside **Edit Layout** in the seat map modal. The `/api/admin/change-layout` endpoint now accepts an optional `assignmentMode` and only resets allocated RSVPs when the underlying layout actually changes — a pure mode flip preserves allocations and QR tokens.
- One-off helper script: `node scripts/set-assignment-mode.js <titleSubstring> seat|table` for flipping an event's mode directly in Firestore without the UI.

---

## [1.1.2] — 2026-05-11

- Added "Add to Google Calendar" CTA button to the first RSVP confirmation email so guests can one-click block 19 June 2026, 5:30 PM – 10:30 PM MYT at Renaissance Hotel, Kuala Lumpur in their calendar. Implemented in `buildRsvpConfirmEmail` (`lib/emailTemplates.ts`). Second/QR seat email (`buildSeatEmail`) is unchanged.

---

## [1.1.0] — 2026-04-28

### Added
- **Admin / Client role system**: Users now have an `admin` or `client` role stored as a Firebase Auth custom claim. Existing users automatically retain full admin access.
- **Settings — Add User tab**: Role selector (Admin / Client) added to user creation form; creates user with correct custom claims and writes a Firestore `users/{uid}` document.
- **Settings — Manage Users tab**: New panel lists all users with role badge, created date, and delete button. Admin can remove accounts; self-deletion is blocked.
- **Delete RSVP**: Admin-only trash button added per row in the RSVP table. Confirmation dialog before deletion.
- **Allocated By**: Seat/table allocation now records which user performed the allocation (`allocatedBy.displayName`). Shown in the RSVP Info modal.
- **API auth middleware**: All admin API routes now verify a Firebase ID token (`Authorization: Bearer`) and enforce role. Unauthenticated calls → 401, wrong role → 403.

### Changed
- **Create Event** button hidden for client users on the Events dashboard.
- **Import CSV** button hidden for client users on Event detail page.
- **Seating layout changes** blocked for client users (SeatMapModal layout tab disabled).
- **Send Notifications** (bulk + per-row) disabled for client users on Notifications page; page remains visible as a read-only monitor.
- **Delete Event** button hidden for client users in Settings.
- **Add/Manage Users** tabs hidden for client users in Settings.

---

## [1.0.7] — 2026-04-28

### Added
- WhatsApp notification retry logic
- Fixed the issue with the notification not being sent to the guests
- Fixed SMTP connection issue

---

## [1.0.6] — 2026-04-24

### Added
- **Extended RSVP fields**: Part Of (role), Company, Job Title, Industry now stored as first-class fields on every RSVP (from CSV import, public form, and webhook)
- **CSV Import — 2-step column mapping UI**: Uploading a CSV now shows an interactive mapping screen where admin selects which CSV column maps to which field (with smart auto-detection for PEOPLElogy and other common formats)
- **RSVP Table — new columns**: Part Of, Company, Job Title now visible as columns (hidden on mobile)
- **Info button in Actions**: Every row now has an Info button before Allocate/Cancel that opens a detail panel showing all extended fields (industry, dietary, notes, +1, seat/table, etc.)
- **Public RSVP form — new fields**: Part Of dropdown, Company, Job Title, and Industry dropdown added to the guest-facing form
- **Seat/Table label consistency**: SeatMapModal tooltip now uses "Table" when event is in table mode

### Fixed
- `assignmentMode` prop was not being passed from event detail page to RSVPTable — Seat/Table column header now correctly reflects the event setting
- Webhook now writes company, job title, industry, and role as separate Firestore fields instead of piping them all into the `message` string
- Duplicate `headerTitle` key in notifications.tsx that was blocking builds

---

## [1.0.5] — 2026-04-22

### Fixed
- Webhook endpoint now sends RSVP confirmation email and WhatsApp to guests who register via Peoplelogy website (was silently missing)

---

## [1.0.4] — 2026-04-22

### Fixed
- Seat map modal header now truncates long event titles instead of overflowing
- Header padding reduced on mobile (`px-4 py-3` vs `px-6 py-4`) so more content fits on small screens
- "Edit Layout" button shows icon-only on small screens, full label on sm+
- Stats pills bar is more compact (`py-2`)
- Grid icon in header hidden on small screens to free up title space
- Seat grid padding responsive: `p-3` on mobile, `p-6` on larger screens
- Close button indentation fixed

---

## [1.0.3] — 2026-04-22

### Added
- "Edit Layout" button in the seat map modal header — admin can change the seating style (theater, auditorium, classroom, banquet, runway) at any time
- If any guests have allocated seats, an inline warning is shown explaining that switching layouts will clear all allocations and reset guests to pending
- Two-step confirmation: first click "Save Layout" shows a red confirmation prompt; second click executes the change — prevents accidental resets
- New API `/api/admin/change-layout` updates `seatingConfig` on the event and batch-resets all allocated/checked-in RSVPs to pending in one Firestore batch write

---

## [1.0.2] — 2026-04-22

### Fixed
- Table map row labels now show numbers (1, 2, 3…) instead of letters (A, B, C…) when event is in table mode
- Seat detail panel now shows "Table X" (with correct derived table number) instead of "Seat X" in table mode
- Banquet layout seat tooltips show "Table X" in table mode

### Added
- "Change Seat / Change Table" button in seat detail panel — admin can click an allocated guest and reassign them to a new seat/table directly from the map (supports all 5 layouts)
- Allocate API now accepts `force: true` to allow reassigning already-allocated RSVPs without first deallocating

---

## [1.0.1] — 2026-04-22

### Fixed
- All client-side `fetch("/api/...")` calls now correctly include the `/rsvp` basePath prefix — resolves "Network error" on seat allocation, RSVP submit, notifications, and admin actions in production
- `NEXT_PUBLIC_BASE_PATH` and `NEXT_PUBLIC_APP_VERSION` exposed via `next.config.ts` so they are available at build time

### Added
- Version badge (`v1.0.1`) displayed in sidebar footer and Settings page header
- Version is sourced from `package.json` via `NEXT_PUBLIC_APP_VERSION` — single source of truth

---

## [1.0.0] — 2026-04-21

### Initial Production Release
- Public RSVP page — guests submit name, phone, email, seat/table preference
- Admin panel with event management, RSVP list, seat map, bulk allocation
- Interactive seat map with drag-to-assign per guest
- QR code generation and verification for allocated guests
- Email notifications (Nodemailer) per guest or bulk
- WhatsApp notifications via WATI API
- Table mode / Seat mode toggle — event supports either layout style
- Fluent Forms webhook integration for WordPress RSVP form at peoplelogy.com
- Firebase Auth for admin login, Firestore for all data, Firebase Admin SDK for server-side writes
- Deployed on Vercel at aurapixel.live/rsvp with basePath `/rsvp`
