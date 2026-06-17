# Changelog

## [2.8.0] — 2026-06-18

### Entry-pass email — day-before "See You Tomorrow" reminder format

- **New subject:** "See You Tomorrow as We Celebrate 25 Years Together" (PEOPLElogy).
- **New body copy** ([lib/emailTemplates.ts](lib/emailTemplates.ts)): "The wait is almost over!" → welcome-tomorrow / commemorate / arrive-early / look-forward / "Safe travels, and see you tomorrow!".
- **New Programme Agenda graphic** rendered after the details box, via a new `agendaImageUrl` template field; hosted at [public/EventAgenda.png](public/EventAgenda.png) ([pages/api/notify.ts](pages/api/notify.ts) passes `${publicBase}/EventAgenda.png`).
- **Removed** the Dietary Requirements + enquiries + "PEOPLElogy Journey" lines for this reminder version. QR section, details box, banner, and "Warm regards, / PEOPLElogy Berhad" sign-off unchanged. Plain-text + admin preview updated to match.

## [2.7.1] — 2026-06-13

- **`/api/scanner/guests`** now also returns a `seating` block (style, totalSeats, seatsPerTable, tablesPerSide, frontRowTablesPerSide, vipTables) so the scanner app's new **Map** tab can render the interactive table map.

## [2.7.0] — 2026-06-13

### Scanner app — show table label, not raw seat number

- **`/api/scanner/guests`** now returns a canonical `seatLabel` / `seatLabelShort` per guest (computed via `formatAssignment`, so table-mode events show "Table 4" instead of "Seat 31"; VIP-aware) plus the event `assignmentMode` ([pages/api/scanner/guests.ts](pages/api/scanner/guests.ts)). The Expo scanner app's guest list, guest detail, and recent-check-ins now display this label.

### Admin — event ID chip

- Added a monospace, copy-to-clipboard **event-ID chip** in the top-bar header (next to the admin email) on all `/admin/events/[id]` routes ([components/layout/Header.tsx](components/layout/Header.tsx)).

## [2.6.5] — 2026-06-12

- Corrected dietary-requirements deadline to **Saturday, 13 June 2026, 6pm** (was Friday, 12 June).

## [2.6.4] — 2026-06-12

### Entry-pass email — final client copy + UI tidy

- Dietary deadline updated to **"Friday, 12 June 2026, 6pm."**
- Added enquiries line: **"For any further enquiries, please contact +60102721829."** (after the dietary note).
- Restored closing line **"Thank you for being part of the PEOPLElogy Journey."** before the sign-off.
- New optional template fields `enquiriesNote` / `thankYouLine` ([lib/emailTemplates.ts](lib/emailTemplates.ts)); HTML + plain-text + admin preview all updated.
- Removed the box-shadow/glow on the floating "Notify Unnotified" button ([pages/admin/events/[id]/notifications.tsx](pages/admin/events/[id]/notifications.tsx)).

## [2.6.3] — 2026-06-11

### Entry-pass email — restore commemorate line

- Re-added the **"As we commemorate 25 years of growth, innovation, partnerships and people…"** paragraph after the welcome line (HTML + plain text), per client review.

## [2.6.2] — 2026-06-11

### Entry-pass email — client-locked final format

- **QR section now comes first** (above the Event Details box): greeting → welcome line → "Important: Event Registration QR Code" + QR + pass button → Event Details box → Dietary Requirements → closing → sign-off ([lib/emailTemplates.ts](lib/emailTemplates.ts)).
- **Body trimmed to the single welcome line** "We are pleased to welcome you to the {event} at {venue}." (the countdown/commemorate paragraphs and the "PEOPLElogy journey" line removed).
- **Sign-off is now just "Warm regards, / PEOPLElogy Berhad"** (committee sub-line removed).
- QR "valid only for this event" wording (no longer references "the event above" now that the box is below the QR).
- PEOPLElogy event time corrected to **17:00 (5:00 PM)** in Firestore; the email auto-formats it to 12-hour.

## [2.6.1] — 2026-06-11

### Entry-pass email — client-requested content rework

Restructured the PEOPLElogy entry-pass email ([lib/emailTemplates.ts](lib/emailTemplates.ts), [pages/api/notify.ts](pages/api/notify.ts)) to the client's copy:

- **New body:** "The countdown is almost over…" + "As we commemorate 25 years of growth, innovation, partnerships, and people…".
- **Details box:** event name shows as **PEOPLElogy 25th Anniversary** (trailing "Event" dropped), **Time auto-formats to 12-hour** (`17:30` → `5:00 PM`), **Address removed**, dress-code row relabelled **Attire** and defaulted to **Formal Elegance** for PEOPLElogy.
- **"Important: Event Registration QR Code"** heading + save-to-mobile note above the QR.
- **New "Dietary Requirements"** section (vegetarian, reply by Friday, 12 June 2026).
- **Sign-off:** "Warm regards, / PEOPLElogy Berhad / 25th Anniversary Celebration Committee".
- Plain-text alternative and the admin live preview updated to match. Non-PEOPLElogy events fall back to the generic closing.

## [2.6.0] — 2026-06-11

### Seat map — configurable smaller front row + centered aisle

- **Banquet / banquet-runway seat maps support a smaller FIRST row** via a new optional `seatingConfig.frontRowTablesPerSide` ([components/ui/SeatMapModal.tsx](components/ui/SeatMapModal.tsx), [types/index.ts](types/index.ts)). When set (e.g. 3), the front row drops its inner tables to widen the front aisle/dance floor while later rows stay full; table numbering stays positional. Unset = unchanged behaviour for every other event.
- **The runway/center aisle is now always centered** regardless of guest-name length — both side-zones are equal `flex` halves and table cards have a fixed min-width so long names truncate instead of shoving the aisle off-center. Padding placeholders match a real card's footprint so columns line up row-to-row.

### Entry-pass email — copy, dress code, banner fix

- **Greeting changed to "Dear {name},"** and a welcome line now names the event + venue before the confirmation sentence ([lib/emailTemplates.ts](lib/emailTemplates.ts)).
- **New "Dress Code" row** in the Event Details box, driven by a new optional `Event.dressCode` field; defaults to "Office attire" for PEOPLElogy ([pages/api/notify.ts](pages/api/notify.ts)).
- **Banner no longer breaks when sent from a non-production origin** — the banner and `/pass` link now resolve an absolute public base URL (`resolvePublicBase`, prefers `NEXT_PUBLIC_APP_URL`, else a non-localhost request origin, else the production domain) instead of the request host. The dark title strip now **always** renders beneath the banner and the `<img alt>` is the event title, so the event name still shows when images are blocked (junk folder).

### Ops

- **[scripts/add-missing-guests.js](scripts/add-missing-guests.js)** — one-off helper to add guests who missed RSVP as pending/attending records (dedupes by email, normalizes phones to E.164).

## [2.5.0] — 2026-06-05

### Downloadable entry pass (image + PDF)

- **The online pass page ([pages/pass.tsx](pages/pass.tsx)) now has "Download image" and "Download PDF" buttons** so guests can save their QR to their device. The image is the bare scannable QR (PNG); the PDF is a printable ticket with event, name, seat and the QR.
- **New [pages/api/pass/pdf.ts](pages/api/pass/pdf.ts)** — generates the ticket PDF server-side with `pdf-lib` (pure-JS, serverless-safe), verifying the signed token like the pass page.
- **[pages/api/qr/image.ts](pages/api/qr/image.ts)** gains a `?download=1` param (sets `Content-Disposition: attachment`) and now renders at 600px / error-correction H for crisper saves/prints.
- **Removed the emoji** from the "View or download your entry pass" button in the entry-pass email ([lib/emailTemplates.ts](lib/emailTemplates.ts)).

## [2.3.1] — 2026-06-05

### Cross-provider deliverability hardening

Content/header best-practices so messages are trusted by Gmail, Outlook/Hotmail, Yahoo and corporate (M365/Workspace) filters alike. Authentication (SPF/DKIM/DMARC on `aurapixel.live`) was already correct; this removes the remaining *content* reasons to junk.

- **Every email now ships a plain-text part** alongside the HTML — HTML-only is a spam signal across all major providers. New `buildRsvpConfirmText` / `buildBlastText` ([lib/emailTemplates.ts](lib/emailTemplates.ts)); the entry pass already had one (v2.3.0).
- **`List-Unsubscribe` header on the blast** ([pages/api/blast.ts](pages/api/blast.ts)) — Gmail/Yahoo bulk-sender guidance and an Outlook trust signal. New `headers` passthrough on `sendResendEmail`/`sendResendBatch` ([lib/resend.ts](lib/resend.ts)).
- **Confirmation footer** now invites a reply (engagement signal) instead of "do not reply", consistent with the Reply-To we set.

> Note: the dominant remaining lever for Outlook/Hotmail is **sender reputation** — a new sending domain is junked on first contact until it warms up. Operational fixes (guest whitelisting, gradual warm-up, engagement) matter more than any code change here.

## [2.3.0] — 2026-06-05

### All email now sends via Resend + online entry-pass fallback

- **Fixes QR entry-pass emails landing in junk.** The v2.2.0 Resend migration only moved the *blast*; the **QR entry-pass** ([pages/api/notify.ts](pages/api/notify.ts)) and **RSVP-confirmation** emails ([submit.ts](pages/api/rsvp/submit.ts), [webhook.ts](pages/api/rsvp/webhook.ts), [import-csv.ts](pages/api/admin/events/import-csv.ts)) were still sent through **Gmail SMTP** from a `@gmail.com` address — no DMARC alignment to a branded domain, so spam filters junked roughly half of them. When junked, the email client blocks all images and the inline QR shows as a broken "can't open this file" icon (it was suppressed, not corrupted). **Every email now sends from the verified `aurapixel.live` domain via Resend**, so messages land in the inbox and the QR renders.
- **New `sendResendEmail` (single send) + attachment/`text` support** on [lib/resend.ts](lib/resend.ts). Inline images use Resend's `contentId` (referenced as `cid:` in the HTML) — the QR stays embedded inline (small, ~1–2KB). Bulk entry-pass sends go through Resend's **batch API in chunks of 100**, replacing the per-recipient Gmail send (no SMTP connection churn, no rate-limit 429s on ~190 recipients). The entry-pass banner now uses the **hosted** `EmailBanner.png` URL (like the blast) to keep batch payloads small; confirmation emails keep the inline CID banner. All sends now include a plain-text part for better deliverability.
- **New online entry pass** [pages/pass.tsx](pages/pass.tsx) — the entry-pass email now includes a **"View or download your entry pass"** button linking to `/pass?t=<signed-token>`. It's a plain text link (not a blocked image), so the QR stays reachable even if a message is ever filtered or a client blocks images. The page verifies the signed token, loads the event/seat, and renders the QR server-side — a self-contained digital ticket. New `passUrl` option on `buildSeatEmail` ([lib/emailTemplates.ts](lib/emailTemplates.ts)).
- **Retired Gmail SMTP**: deleted `lib/email.ts` and removed the `nodemailer` / `@types/nodemailer` dependencies. `SMTP_*` env vars are no longer used. WhatsApp sending is unchanged.

## [2.2.0] — 2026-06-03

### Email Blast now sends via Resend

- **Switched the blast sender from Gmail SMTP to Resend** ([lib/resend.ts](lib/resend.ts), [pages/api/blast.ts](pages/api/blast.ts)). Gmail's per-account daily cap (~100–150 on a new account) and SMTP concurrency limits made a ~190-recipient blast impossible — it capped at ~140 with `550-5.4.5 Daily user sending limit exceeded`. Resend's batch API sends from the verified `aurapixel.live` domain in one fast HTTP call, no SMTP, no timeout, no tiny daily cap. New env vars: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`. Transactional confirmation/entry-pass emails still go via Gmail SMTP, unchanged.
- **Per-recipient delivery tracking**: each blast stamps `blastSentAt` on the guest's RSVP ([types/index.ts](types/index.ts)). The blast recipient list gains an **"Unsent only"** filter so a follow-up send targets just guests who haven't received one yet — no duplicates.
- **Banner unchanged**: still the hosted `EmailBanner.png` URL (or a custom banner), rendered identically by Resend.

## [2.1.2] — 2026-06-03

- **Fix Email Blast 504 on large sends (real fix): batch the send client-side.** Sending ~190 recipients in one request still timed the serverless function out even without the banner attachment — a single synchronous SMTP run of that size exceeds the gateway timeout. The Notifications page now dispatches the blast in **batches of 20 recipients per request** ([pages/admin/events/[id]/notifications.tsx](pages/admin/events/[id]/notifications.tsx)), each completing in a few seconds. Shows live progress ("Sending… 60/188"), accumulates sent/failed across batches, and a single failed batch no longer aborts the rest. API unchanged.

## [2.1.1] — 2026-06-03

- **Fix Email Blast 504 timeout on large sends**: the PEOPLElogy banner was embedded as a ~185KB CID attachment on *every* message, so a ~190-recipient blast pushed ~35MB through one SMTP connection and timed the serverless function out (504, 0 delivered). The blast now references the banner by its **hosted public URL** (`{host}{basePath}/EmailBanner.png`) instead of attaching it ([pages/api/blast.ts](pages/api/blast.ts)). The banner still renders identically in the email — this is the same hosted-URL mechanism `customRsvpConfirmBanner` already uses — but each email is now tiny and the full blast completes in ~20s. Transactional confirmation/entry-pass emails are unchanged and keep their CID attachment.

## [2.1.0] — 2026-06-03

### Email Blast — ad-hoc announcements to guests

- **New "Email Blast" tab** on the Notifications page ([pages/admin/events/[id]/notifications.tsx](pages/admin/events/[id]/notifications.tsx)): admins compose a one-off announcement (separate Subject + Message fields) and send it to all or a hand-picked subset of an event's guests. No QR, no seat info — just the message on the branded template with the RSVP-confirmation banner. `{{name}}` and `{{event}}` placeholders are substituted per recipient. Independent of `notifiedAt`, so it can be re-sent any time.
- **Recipient checklist** with select-all, search, and per-guest checkboxes (defaults to everyone who RSVP'd except those marked not-attending) plus a live email preview.
- **New blast email template** `buildBlastEmail` ([lib/emailTemplates.ts](lib/emailTemplates.ts)) — shares the branded card/banner/footer look of the existing emails; body is the admin's message only. Includes an **Add to Google Calendar** CTA built from the event date/time (reuses `buildCalendarUrl`). Existing confirmation and entry-pass emails are unchanged.
- **New API route** [pages/api/blast.ts](pages/api/blast.ts) — `withAuth(handler, "admin")`, `maxDuration: 60`.
- **Reliable bulk sending**: new `sendBulkEmails` ([lib/email.ts](lib/email.ts)) sends over a single pooled, rate-limited Gmail connection (maxConnections 4, ~8/sec) instead of opening a fresh login per email. Fixes the `421 too many concurrent connections` failures that capped large blasts at ~13 delivered. Failures now surface the first error message in the UI.

## [2.0.2] — 2026-05-30

- **Settings → Account panel alignment**: container widened from `max-w-lg` → `max-w-2xl` to match Workspace. Password and Session cards now share one identical horizontal layout (title + sub-text on left, action button on right) — eliminates the row-stacking inconsistency where Password's button sat on a separate line. Profile card gets a divider above the Save row. Button touch targets bumped to `px-4 py-2` ([pages/admin/settings.tsx](pages/admin/settings.tsx)).
- **Settings → Workspace panel grid**: 5 cards in a 3-column grid was leaving an orphan empty cell on row 2. Split into a 3-column System Info row (App Version, Firebase Project, Signed In) and a 2-column Counts row (Total Events, Total Users) that collapses to full-width for non-admin users. No orphan cells.
- **InfoCard** standardized: dropped the `small` flag that mixed 12px and 16px values in the same row. New `emphasis` flag renders counts at 22px bold for primary-metric weight; system info uniformly at 14px.

## [2.0.1] — 2026-05-30

- **Inline Cancel Seat on the seat map**: clicking an allocated seat now shows a **Cancel [Seat/Table/VIP]** button next to the existing **Change** button in the `SeatDetailPanel`. Two-step inline confirm (first click reveals "Confirm Cancel" + "Keep" escape, second click executes) so admins can deallocate without leaving the modal ([components/ui/SeatMapModal.tsx](components/ui/SeatMapModal.tsx)).
- **Red post-cancel highlight**: cancelled seat shows a red ring/glow in the grid (was blue selection ring), giving the admin instant visual confirmation. Mark clears when admin clicks another seat or closes the modal. Threaded as a new `cancelledSeat` prop alongside `highlightedSeat` through GridSeatMap, RunwaySeatMap, BanquetSeatMap, BanquetRunwaySeatMap, BanquetTableCell, and SeatEl.
- **Seat map stays open after Change Seat / Change VIP** in [pages/admin/events/[id].tsx](pages/admin/events/[id].tsx#L630): first-time allocation still auto-closes the modal; reassignments keep it open so the admin can visually verify the move and continue managing seats.
- **`selectedSeat` snapshot syncs with live data**: a `useEffect` in `SeatMapModal` now refreshes the selected seat from the live `allSeats` array (derived from the Firestore subscription) whenever the underlying seat's status/rsvpId/guestName changes. Fixes stale Ak-Kumar-still-showing-after-cancel bug.

## [2.0.0] — 2026-05-29

### Major UI/UX overhaul of the entire admin experience.

- **Admin Events page redesign**: `EventCard` rebuilt with cover-image hero, live stats grid (Allocated / RSVPs / Pending / Unnotified), countdown chip ("TODAY" / "TOMORROW" / "ACTIVE" / "PAST"), and inline footer actions. Admin index ([pages/admin/index.tsx](pages/admin/index.tsx)) now uses real-time Firestore subscriptions with Upcoming / Past tabs and a search input.
- **Pin to top**: Admins can pin upcoming events to the top of the grid. New `pinned` field on the `Event` type ([types/index.ts](types/index.ts)); pin toggle is admin-only and only visible on the Upcoming tab. Pinned cards sort first; the rest sort by date.
- **Event Details revamp**: New context-aware hero components on `/admin/events/[id]` ([pages/admin/events/[id].tsx](pages/admin/events/[id].tsx)) with a `MoreMenu` dropdown for secondary actions and a clear back-navigation pattern.
- **Notifications page revamp** ([pages/admin/events/[id]/notifications.tsx](pages/admin/events/[id]/notifications.tsx)): `NotificationHero` summary with animated SVG progress ring, color-coded status filter pills, search input, empty-state handling, and a floating sticky **Bulk Notify** FAB.
- **Dashboard becomes pure analytics**: `/admin/dashboard` ([pages/admin/dashboard.tsx](pages/admin/dashboard.tsx)) rebuilt as a standalone analytics surface with KPIs, charts, a heatmap, and scope filtering — separate concern from `/admin` (events management). Powered by `recharts`.
- **Settings revamp**: `/admin/settings` ([pages/admin/settings.tsx](pages/admin/settings.tsx)) redesigned with **Account** and **Workspace** panels.
- **EventCard footer recolored**: solid brand-blue action bar; **Open** button inverted (white bg, blue text); **Notifications** button uses translucent dark fill with soft white border; unnotified badge inverted to match ([components/ui/EventCard.tsx](components/ui/EventCard.tsx)).
- **EventCard cover banner removed** in favor of a tighter layout focused on stats and quick actions.
- **Brand asset refresh**: New `ap-logo-small.png` and `aurapixel-tight.png`; updated favicons / apple-touch / Android Chrome icons across `public/`. Sidebar ([components/layout/Sidebar.tsx](components/layout/Sidebar.tsx)) and LoginForm ([components/sections/LoginForm.tsx](components/sections/LoginForm.tsx)) updated to use the new assets.
- All revamps were generated via the `/ui-ux-pro-max` skill and validated with `tsc --noEmit` + `next build` between each page. No schema migrations and no breaking API changes.

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
