# Changelog

## [3.3.4] — 2026-09-03

### Added
- `scripts/add-sending-domain.sh --verify` — asks Resend to check the DNS for `events.imaiready.asia` and prints the status (client confirmed all three records live + DMARC `rua=` added, verified independently via dig).
- `scripts/probe-imaiready-sender.sh <inboxes…>` — sends DKIM-alignment probes from `PEOPLElogy Events <passes@events.imaiready.asia>` (Reply-To `secretariat@imaiready.asia`) with header-checking instructions; the agreed pre-flip gate across Gmail/Outlook/Yahoo/M365.

### Changed
- **Google Sheet tabs now carry the event names** ("BAFT Conference", "Asia AI Excellence Award Gala Dinner", "Summit (NAIRW)") instead of the E1/E2/E3 codes; existing code-named tabs are renamed in place on the next sync, so no duplicate tabs are left behind. Falls back to the code if a title is empty; forbidden tab characters stripped.
- `scripts/switch-sender-imaiready.js` now also sets `replyToEmail: secretariat@imaiready.asia` on every event (client's request — no mailbox exists on the sending subdomain, and delegates do reply to pass emails); `--revert` clears it back to the global default. All four send paths (entry pass, intake, notify, blast) already honour per-event Reply-To via `resolveEventSender`.

## [3.3.3] — 2026-09-02

### Fixed
- **Google Sheet sync hardened** after the first real production registration (1 Sep 23:20 UTC) never reached the sheet: the sync now retries once with a fresh token, the service-account JWT `iat` is backdated 60s (serverless clock skew makes Google reject a future-dated token), and every outcome is recorded in Firestore at `system/sheetSync` (`lastSyncedAt` / `lastFailureAt` + `lastError`) so a swallowed failure is no longer invisible. The sheet self-heals on any later sync — one "Open Google Sheet" click backfills the missed row.

### Added
- `scripts/switch-sender-imaiready.js` — flips all NAIRW events' pass-email sender to `PEOPLElogy Events <passes@events.imaiready.asia>` (dry-run by default, `--revert` to undo). To be run only after the client adds the DNS records, Resend verifies the domain, and `RESEND_ALLOWED_DOMAINS` is set in Vercel.

### Changed
- `scripts/add-peoplelogy-domain.sh` → `scripts/add-sending-domain.sh`: target moved to `events.imaiready.asia` per the client's choice; records now come from Resend's per-domain endpoint (the list endpoint returns none) with full hostnames (the API's zone-relative names doubled the subdomain).

## [3.3.2] — 2026-09-02

### Added
- Ops scripts for the PEOPLElogy 1 Sep reply: `scripts/rename-gala.js` (sets E2/E2-TEST title to the confirmed "Asia AI Excellence Award Gala Dinner", dry-run by default), `scripts/add-peoplelogy-domain.sh` (provisions events.peoplelogy.com in Resend and prints the three DNS records to forward), `scripts/inspect-reply-items.js` (read-only audit of event titles and registrations — used to establish that no LCL2-* test registrations ever reached us and production events are empty).

## [3.3.1] — 2026-09-01

### Changed
- Google Sheet mirror switched on in production: `GOOGLE_SHEETS_SERVICE_ACCOUNT`, `GOOGLE_SHEET_ID` and `NEXT_PUBLIC_GOOGLE_SHEET_ID` set in Vercel (service account `rsvp-sheet-sync@aurapixel-rsvp-db`, sheet "NAIRW 2026 — Guest Lists"). Rebuild bakes the sheet id in, which makes the "Open Google Sheet" ⋯-menu item visible. First fill verified: E1/E2/E3 tabs created (0 real registrations yet — test twins never sync).

## [3.3.0] — 2026-09-01

### Added
- **Unpaid registration capture** for corporate billing / HRD Corp (SBL-KHAS) claims: Register accepts `payment_status: "unpaid"` (+ optional `payment_method`) and stores the delegate as a new **Awaiting Payment** status — no email, no QR, no seat held. Status chip, table filter, info-popup payment rows, and PDF report cover the new status; the scanner refuses unpaid passes.
- **Confirm Payment** admin action (`POST /api/admin/confirm-payment`): one click activates every event on the delegate's ticket — free-seating events mint + email the QR pass, the seated Gala moves to pending for table allocation. Records who confirmed and when.
- **Partner auto-confirm**: re-sending an unpaid registration as paid (same `submission_id`) activates it without admin action.
- **Google Sheet mirror** (`lib/googleSheets.ts`, opt-in via `GOOGLE_SHEETS_SERVICE_ACCOUNT` / `GOOGLE_SHEET_ID` / `NEXT_PUBLIC_GOOGLE_SHEET_ID`): one spreadsheet with a tab per real event, auto-rewritten on every integration register/cancel/payment-confirm; test-twin traffic never syncs. New "Open Google Sheet" ⋯-menu item syncs then opens; `POST /api/admin/sheets-sync` behind it. Setup guide: `docs/google-sheet-setup.md`.
- Integration contract doc gains a "Corporate billing & HRD Corp claims" section; 14 new test checks (payment parsing + unpaid seat accounting).

### Fixed
- Event stats no longer count cancelled guests as attending.

## [3.2.13] — 2026-09-01

### Changed
- Seat Map and Preview stay in place on free-seating events but are disabled (greyed, tooltip "Free seating — no seat map for this event") instead of being replaced; seat/table events are untouched. Reverts 3.2.12's Notifications swap.

## [3.2.12] — 2026-09-01

### Changed
- Free-seating events no longer show the Seat Map and Preview buttons (there is no map); Notifications takes the primary spot in the event hero, on the event-day view too.

## [3.2.11] — 2026-09-01

### Changed
- "Part Of" column removed from the guest table — always empty for partner-registered events; the value (legacy anniversary guests) remains in the guest Info popup and the form's collapsed extras.

## [3.2.10] — 2026-09-01

### Changed
- Guest form front section now matches the live complimentary form exactly: Full Name, Email, Phone / WhatsApp, Company / Organisation, Job Title. Industry joined the collapsed extras (the live form doesn't collect it). The partner's "How did you hear" field was never captured by the endpoint and stays uncaptured.

## [3.2.9] — 2026-09-01

### Changed
- Guest add/edit modal restructured around the November registration shape: name, email, phone (now optional — delegate registrations may lack one), company/organisation, job title, industry lead; a read-only Registration line shows ticket code, partner reference, days and consent; the anniversary-era extras (group, attending, plus one, dietary, notes) sit behind a "More fields" toggle.
- Guest detail card shows Ticket, Reference, Days, Consent and Source rows; "Part Of" moved to the bottom.

### Fixed
- The event page's "⋯" menu was clipped by the hero card after two items (`overflow-hidden`); it now renders in a portal above everything, so all actions are reachable.

## [3.2.8] — 2026-09-01

### Changed
- Admin events page shows only the real events; the partner's "-TEST" twins sit behind a "test events hidden — show" toggle and no longer count in the Upcoming tab.

## [3.2.7] — 2026-09-01

**Delegate transfers and cancellations** — BAFT's terms promise a paid registration can move to a colleague; before this, re-registering a swapped delegate left the original QR valid and two people could scan in on one seat.

### Added
- Register accepts `transfer: true` with an existing `submission_id`: the previous holder's records are voided across the ticket's events (QR refused at the door — "Pass cancelled — this registration was transferred"), the replacement is registered and emailed their passes. A `reused` free Summit pass belonging to the departing delegate is never touched. Retry-safe; without the explicit flag a changed email on a known reference is still refused, so a typo can't revoke a pass.
- `POST /api/integrations/cancel` — void every registration under a `submission_id` (drop-out, no replacement). Environment-scoped by key (test key → `-TEST` events only), idempotent, `404` on unknown reference. A cancelled email can re-register; Register revives a cancelled record instead of refusing it as a duplicate.
- RSVP status `cancelled`: excluded from seat counts, red chip + filter in the admin table, own colour in the PDF report; scanner shows a clear refusal.
- `scripts/test-transfer.ts` (11 checks); suite count now 11 files.

## [3.2.6] — 2026-08-30

### Changed
- `phone` is now optional on `POST /api/integrations/register` — the partner's delegate form doesn't always collect one, and requiring it made their backend drop those delegates silently. Stored as an empty string; admin surfaces show "—". The public RSVP form still requires it (WhatsApp path).

## [3.2.5] — 2026-08-30

### Changed
- `sendResendEmail` retries up to 4 times with backoff on a Resend rate-limit response, so a burst of partner registrations (their backfill) no longer leaves passes unsent.
- Event seed sets the sender identity on every November event and twin (`PEOPLElogy Events <events@aurapixel.live>`) — `RESEND_FROM` still carries the anniversary display name.

## [3.2.4] — 2026-08-30

**Build Brief v3 applied — every ticket code registers through the partner endpoint.**

### Added
- Ticket rules carry `events[]`: P1 = E1 + E3, P2 = E1 + E2 + E3, F3/F12/F13/F14 = E3, V-SP/V-PT/V-MD = E1 + E3. `POST /api/integrations/register` writes one RSVP per event and emails one QR per venue; the response gains `passes[]`, `ticketLabel` and `environment`. Free-seating events (E1, E3) issue the pass immediately; the table-seated Gala records a pending RSVP whose pass follows allocation.
- Paid codes `P1`, `P1-INT`, `P2`, `P2-INT` enabled — the partner confirms payment (Stripe or finance) before calling Register, so no Confirm endpoint or webhook exists.
- `INTEGRATION_TEST_API_KEY`: same URL, second key; registrations sent with it land in `-TEST` twins of E1/E2/E3. `scripts/seed-events-iamairready.js --twins` creates them; `scripts/remove-test-events.js [--rsvps]` wipes or deletes them. Replaces `INTEGRATION_EVENT_SUFFIX`.
- Single-day passes: `passDays` / `isDayRestricted` / `formatPassDays` (`lib/eventDays.ts`) and `dateISOInZone` (`lib/eventTime.ts`). The pass email and pass page show the pass's day; `POST /api/qr/verify` returns `400` when a day-restricted pass is scanned on another event day and reports `dayValid` / `validDays`.
- RSVP table and guest card show the ticket code beside the name.
- `scripts/test-pass-days.ts` (16 checks); integration suite grown to 53.

### Changed
- Events per Build Brief v3: Summit (E3) Thu 12 – Sat 14 Nov at The Campus Ampang; BAFT (E1) Tue 17 – Wed 18 Nov and Gala (E2) Wed 18 Nov at Marriott Petaling Jaya. E1 is free seating. Working caps E1 500 / E2 300 / E3 1000.
- Free single-day codes F19/F20/F21 removed (renamed F12/F13/F14 in v3 — the days moved, so old codes fail `unknown_ticket` rather than remap).
- Duplicate handling: `409 duplicate_email` only on the ticket's primary event; on a secondary event an existing record under another reference is kept and reported `reused: true`. A full secondary event never sinks a paid registration.
- `docs/complimentary-pass-integration.md` rewritten as the contract for every pass; `docs/rsvp-form-integration.md` marked superseded (Confirm + Stripe webhook not built).

### Removed
- `scripts/seed-free-seating.js`, `scripts/remove-test-event.js` (folded into the seed and `remove-test-events.js`).

## [3.2.3] — 2026-08-28

### Changed
- Dropped the staging setup for the partner Register endpoint: the `E3-TEST` twin event is deleted (`scripts/remove-test-event.js`), `scripts/seed-free-seating.js` no longer creates it, and `scripts/setup-preview-env.sh` no longer sets `INTEGRATION_EVENT_SUFFIX`. The client's complimentary-pass form targets the real Summit (E3) event in production directly.
- `docs/complimentary-pass-integration.md` now documents a single environment (`https://www.aurapixel.live/rsvp`).
- `.gitignore` covers `.integration-prod-key` (the production `INTEGRATION_API_KEY` source file).

## [3.2.2] — 2026-08-28

**Notifications page revamp.** Full-width layout that fills the viewport; no more centred card with dead space.

- Header row: event title + seating-mode chip left, *Entry Pass / Thank-You* picker and bulk actions (**Notify N unnotified**, **Re-send to all**) right. Floating bottom-right buttons removed.
- KPI strip — Pass holders / Notified / Unnotified / **Delivery issues** (bounces + spam reports, previously not surfaced here) — with a slim full-width progress bar replacing the ring.
- Underline tabs: Pass Holders · Email Blast · Template.
- Guest table gains company under the name, a **Delivery** status chip, and the ticket type on free-seating events; row actions read *Notify* / *Re-send*.
- Email Blast: 5/7 compose-to-preview split with a taller preview; SVG checkboxes; recipients show a "sent" marker.
- Free-seating events no longer say "Allocate seats before sending notifications" — copy and empty states explain that passes go out at registration.

## [3.2.1] — 2026-08-28

**Free seating + partner form integration (Summit complimentary pass).** Branch `phase2-lock`; preview/staging build. Versioning now bumps on every push.

### Free seating
- New `assignmentMode: "free"`: no seat allocation. An accepted registration has its QR minted inside the intake transaction and lands as `allocated` with `seatNumber: null`, so scanner, notify and stats work unchanged. E3 (Summit) set to this mode.
- Entry-pass email in free mode: "Registration Confirmed" header, a *Free seating* row, the full date range for multi-day events, and a QR caption naming the days it opens. Default body copy is now generic (the anniversary text survives only inside the PEOPLElogy branch).
- QR validity window is event-aware (`isQRValidForEvent`): a three-day pass no longer reads "out of time" from day two.
- Admin: Free Seating option in the event form / seat-map layout editor; Allocate/Cancel controls hidden in free mode; hero counter reads "Passes Issued".

### Partner form integration
- `POST /api/integrations/register` — `X-API-Key` (`INTEGRATION_API_KEY`), the partner's field names accepted as-is, idempotent on their `submission_id`, ticket→event rules in `lib/integration.ts`. Complimentary/F3/F19–21 → E3; BAFT keys recognised but `422 ticket_not_enabled` until the payment step is agreed.
- `INTEGRATION_EVENT_SUFFIX` (staging: `-TEST`) redirects writes into an `E3-TEST` twin so UAT submissions never reach the real guest list. `scripts/seed-free-seating.js` creates the twin; `scripts/setup-preview-env.sh` populates the Vercel preview environment from `.env.local` (Vercel's sensitive vars can't be pulled).
- `lib/intake.ts` is now the single RSVP writer (public form + Register); `lib/entryPass.ts` holds the pass builder so intake can email it immediately.
- Per-event banner slot: `public/banners/<code>.png`; no artwork → dark text header, never a wrong banner.
- Docs: `docs/complimentary-pass-integration.md` (one page for the partner's dev); status note in the contract.

### Also in this push (Phase 3 snapshot, previously uncommitted)
- Capacity/waitlist, Resend delivery tracking, guest self-service manage links, multi-day event model, integration contract draft — see the 3.2.0 notes; these are the same features, now committed.
- Tests: `test-integration`, `test-free-seating`; `npm test` uses a resolver (`scripts/test-register.mjs`) so libs importing via `@/` can be tested.

## [3.2.0] — 2026-07-22

**Phase 3 — operational resilience & guest experience.** The web half is complete. The offline scanner is not included; see the note at the end.

### Capacity guard & waitlist
- Intake now consults the seat count. Previously a 200-seat room could confirm 300 people, and over-subscription only surfaced at allocation — after everyone had been told they were coming.
- New `Event.capacityLimit` (blank → seat count) and `Event.waitlistEnabled`, both in the event form. At capacity, a submission is either waitlisted or turned away with a "fully booked" screen, not a generic error.
- New `waitlisted` RSVP status. A waitlisted guest holds **no** seat, gets **no** entry pass, and receives a distinct amber email that says so explicitly rather than a confirmation implying a seat exists.
- The capacity count and the write happen in **one transaction**, so two guests can't both claim the last chair.
- Waitlist panel on the event page (hidden when empty): queue in arrival order, promote-who-fits or promote-selected. Promotion moves guests to `pending` — it does not seat or email them, and the UI says so.
- Stats no longer count waitlisted guests as "attending", which previously overstated the room by exactly the number of people who couldn't get in.

### Plus-one seating
- `plusOne` was collected from day one but the companion was never seated and never issued a pass — they arrived to no chair.
- A +1 now consumes a real seat, placed **adjacent** to their host when possible, falling back to any free seat rather than being stranded.
- Host and companion are seated as an **indivisible pair**: if only one seat remains, neither is placed. Seating the host and stranding the guest is the bug being fixed, not a partial success.
- The companion gets their own signed pass (`guestIndex: 1` in the QR payload) and their seat now appears on the entry-pass email. Passes issued before this change omit the field, and absent reads as `0`, so every pass already in a guest's inbox still verifies.

### Email delivery tracking
- `notifiedAt`/`blastSentAt` only ever meant "handed to Resend". New `/api/webhooks/resend` records what actually happened: delivered, opened, clicked, bounced, complained, delayed.
- Every outbound message now carries event/RSVP/kind tags, which is how an async webhook attributes a bounce without a stored message id (batch sends never return one).
- Svix signature verified with standard-library crypto — no new dependency. **Without `RESEND_WEBHOOK_SECRET` the endpoint returns 503 rather than trusting unsigned traffic**, because an unauthenticated writer that can mark any guest's mail as bounced is worse than no tracking.
- Out-of-order webhooks are ranked, not last-write-wins: a late `sent` can't downgrade `delivered`, and nothing can mask a bounce.
- Bounces show as a red badge directly in the guest table — the one delivery state that needs to be visible without opening anything.

### Guest self-service (`/manage`)
- Signed-link page reached from the confirmation and waitlist emails. Guests can correct their details, drop a +1, cancel, or ask for their pass again — without emailing the organiser.
- Cancelling releases both seats **and revokes the passes**; a cancelled guest holding a working QR is how someone walks in on a seat that's been given away.
- Signed with its own `MANAGE_SECRET` (falls back to `QR_SECRET` until set). A pass is photographed and forwarded routinely; a management link can cancel a booking — one secret for both would be wrong.
- A guest may drop a +1 but not add one: an extra body is a capacity decision, which belongs to the organiser.
- "Re-send my pass" **flags** the request rather than sending. Letting an unauthenticated link trigger outbound mail is a spam relay, and the guest may be asking precisely because delivery is failing. Surfaces as a "Pass requested" badge for the admin.

### Also
- Extracted `lib/publicUrl.ts` — links in emails no longer point at `localhost` when an admin sends from a dev session.
- `notifiedAt` is now written explicitly as `null` on public-form records instead of being absent (audit #36).

### Tests
- `npm test` — **153 assertions** across 6 suites, still framework-free. New: `test-capacity.ts` (capacity, waitlist ordering, plus-one pairing) and `test-email-delivery.ts` (tag round-trip, out-of-order status ranking, token forgery/expiry).

### Not included — offline scanner
The remaining Phase 3 item is the offline-capable scanner, which lives in the separate `rsvp-app` repo. It was **not attempted**: that repo has no `node_modules` installed and no TypeScript, so it cannot be built, typechecked, linted, or run, and its working tree carries 593 insertions / 551 deletions of uncommitted build-migration work. Writing an unverifiable sync layer on top of that would not be a fix. See `OPEN-ITEMS.md` §4.

## [3.1.0] — 2026-07-22

Completes **Phase 2** of the audit roadmap. v3.0.0 shipped Phase 2's *features*; this release closes the *correctness* half that was still outstanding — the three bugs that fail silently during a live event — plus per-event sender identity and Storage provisioning.

### Event timezone — fixes the RSVP deadline (was live)
- New `Event.timezone` (IANA) with a picker in the event form; unset events default to `Asia/Kuala_Lumpur`, so existing behaviour is preserved.
- New `lib/eventTime.ts` resolves an event's wall-clock date/time to a real instant. Previously `submit.ts` used `setHours()` — the *server's* zone, which is UTC on Vercel — so a Malaysian 23:59 deadline actually expired at 07:59 the next morning and accepted RSVPs ~8h late.
- The same root cause is fixed in `lib/qr.ts`, which used `setUTCHours()` and read a local wall clock as UTC, sliding the QR validity window by the same margin. `generateQRPayload` now takes a timezone; an unresolvable date yields an unbounded window rather than an invalid pass.
- The deadline is now enforced on the webhook intake path too, which never checked it.

### Seat allocation — fixes the false-full lockout and the group race
- Auto-allocation now assigns the **lowest free seat** instead of `highest + 1`. VIP seats are numbered *above* `totalSeats` by design, so a single seated VIP guest used to push the counter past capacity and make every subsequent allocation fail — bulk allocate seated **zero** guests and reported success. Freed seats are now reused instead of being abandoned.
- Every seat decision runs inside a **Firestore transaction**, so two admins seating guests simultaneously can no longer both claim the same seat.
- **Group allocation is atomic.** The seat map used to loop one HTTP request per guest; a conflict midway left the group split across the room with no rollback. It is now one request, one transaction — all seats or none (`assignments: [{rsvpId, seatNumber}]`).
- Bulk allocate returns the **real** allocated count and a `seatsExhausted` flag, and the UI reports the server's number rather than its own expectation. A zero-allocation run is now a 409, not a 200.

### Duplicate RSVPs — closes the race and the casing bug
- New `lib/rsvpIdentity.ts`: the RSVP document id is derived from `(eventId, normalised email)` and written with `.create()`, so uniqueness is enforced by Firestore at write time. The old check-then-`add()` left a window where a double-click created two records.
- The duplicate lookup now queries the **normalised** address. It previously compared raw input against a lower-cased stored value, so the guard never fired for anyone who capitalised their email.
- Applied to both the public form and the webhook intake. Existing random-id RSVPs are still matched by email, so no migration is needed and existing QR passes stay valid.

### Per-event sender identity
- New `Event.senderName` / `senderEmail` / `replyToEmail`, edited in a new **Sender** tab in the Email Editor. Applies to RSVP confirmations, entry passes, thank-yous, blasts, and CSV-import confirmations.
- `lib/eventSender.ts` validates the address and checks its domain against `RESEND_ALLOWED_DOMAINS` (defaults to the global sender's own domain). An unverified domain falls back to the working global identity instead of silently failing to deliver.
- `ResendMessage` gained a per-message `replyTo`, so guest replies reach the right organiser.

### Storage
- Applied explicit-origin CORS to the `aurapixel-rsvp` bucket, which had **none** — browser banner uploads would have failed.
- Deleted the root `set-cors.js`, which applied `origin: ['*']`. `scripts/set-storage-cors.js` (explicit origins, `--show` to inspect) is the supported path.

### Tests
- Added `npm test` — 83 assertions across four suites run by Node directly, no test framework:
  - `scripts/test-event-time.ts` — timezone conversion, DST boundaries, half-hour zones, end-of-day millisecond precision. Passes identically under three different server timezones, which is the property that matters.
  - `scripts/test-seat-allocation.ts` — includes a reproduction of the VIP false-full lockout, asserting the old rule fails and the new one doesn't.
  - `scripts/test-rsvp-identity.ts` — deterministic ids, the casing bug, `ALREADY_EXISTS` detection.
  - `scripts/test-event-sender.ts` — sender fallback rules.
- `tsconfig.json` now excludes `scripts/`, which is run by Node rather than compiled by Next.

## [3.0.0] — 2026-07-20

Major release: end-to-end revamp (Phase 1 hardening + Phase 2 self-serve + Phase 3 UX) and migration to the `aurapixel-rsvp` Firebase project.

### Phase 1 — security & correctness hardening
- Locked down previously open scanner/QR endpoints; `qr/generate` now requires admin auth; scanner endpoints gated behind an optional `SCANNER_API_KEY` (staged rollout — allows all while unset).
- Default role for a user with no claim flipped from **admin → client** (`lib/apiAuth.ts`, `contexts/AuthContext.tsx`). Run `scripts/sync-user-claims.js` before/with this deploy so existing admins keep access.
- Fixed the check-in field mismatch: the scanner's `checkInTime` and the web's `checkedInAt` are now written together and read with a fallback, so reports/timelines populate.
- XSS-hardened all email builders (`escapeHtml` on guest-supplied fields); rate-limited + field-capped the public `rsvp/submit` relay.
- Added `firestore.rules` (deny-by-default) + `firebase.json`.

### Phase 2 — run a new event without a developer
- **Per-event Email Editor** (`components/ui/EmailEditor.tsx`): compose Entry Pass / RSVP Confirmation / Thank-You copy, subjects, sign-off, agenda image, and thank-you CTA buttons per event, with a live preview. Removes the hardcoded single-tenant email copy.
- **Edit Event** (`components/ui/EventFormModal.tsx`, now create + edit) and **Add / Edit Guest** (`components/ui/GuestFormModal.tsx`) — retires the CLI fix scripts.
- **Registration Form config**: per-event guest-category + industry lists drive the public form (`lib/guestFields.ts`), replacing hardcoded dropdowns.

### Phase 3 — UX quality & new surfaces
- App-wide **toast + confirm system** (`contexts/ToastContext.tsx`); no native `alert()`/`confirm()` remain.
- **Live web check-in dashboard** at `/admin/events/[id]/check-in` (arrivals, progress, search, one-tap check-in, live feed) — mobile-first.
- **Responsive seat map** (guest-list drawer + touch drag) and an **accessibility pass** (visible keyboard focus over inline `outline:none`, AA-contrast `--muted`, Escape-to-cancel dialogs).

### Infrastructure
- Migrated Firestore + Auth to the `aurapixel-rsvp` Firebase project with document IDs and Auth UIDs preserved (QR passes and `WEBHOOK_EVENT_ID` remain valid). Migration tooling: `scripts/migrate-firestore.js`, `scripts/migrate-auth.js`.

## [2.10.0] — 2026-06-24

### Event Reports — branded, downloadable PDF

- **New "Report" button** on each event in Settings → Event List ([pages/admin/settings.tsx](pages/admin/settings.tsx)) that downloads a full, branded post-event PDF report.
- **New `/api/admin/event-report`** endpoint streams a server-generated PDF built with `pdf-lib` from the event + all its RSVPs ([pages/api/admin/event-report.ts](pages/api/admin/event-report.ts), [lib/eventReport.ts](lib/eventReport.ts)).
- Branded cover: full-bleed dark header band with the current AuraPixel wordmark (`aurapixel-tight.png`, same as the login screen) + a title/event-details card.
- Report sections: **Executive Summary** two-tone KPI tiles (registered, attending, allocated, checked-in, attendance rate, no-shows, capacity used, plus-ones), **RSVP Funnel & Status** (donut chart + legend + funnel stat columns), **Attendance & Check-in Timeline**, **Guest Demographics** (top organisations, industry, job title, guest group — divider-separated), **Dietary Requirements**, **Seating & Capacity**, **Communications**, and a multi-page **Full Guest List** appendix (Name / Company / Seat-Table / colour-coded Status).
- Text is sanitised to a WinAnsi-safe subset (guards against non-Latin guest names crashing the PDF encoder); all timestamps render in Asia/Kuala_Lumpur regardless of server timezone. Placeholder values ("NA", "N/A", "-", ".") are filtered from demographics; job titles/companies group case-insensitively.
- Retired the outdated `ap-logo.png` / `ap-nav.png` brand assets.

### Event List — real status

- Event status badge now derives from the event date: a past-dated event reads **Completed** (blue) instead of staying **Active**. Upcoming events still show **Active** / **Inactive** per the `isActive` flag ([pages/admin/settings.tsx](pages/admin/settings.tsx)).

## [2.9.1] — 2026-06-24

- Replaced QR entry-pass email with post-event thank-you email in `/api/notify`
- New subject: "Thank You for Celebrating PEOPLElogy's 25th Anniversary With Us"
- Email includes Event Photo Gallery CTA (harimau.run/peoplelogy26) and IMAIREADY AI Readiness Assessment CTA (imaiready.asia)
- Dropped QR code generation, inline QR PNG attachment, and WhatsApp sends from the notify flow
- Banner, plain-text alternative, and `notifiedAt` tracking all preserved

## [2.9.0] — 2026-06-18

### Notify All — re-send to everyone

- Added a **"Notify All"** action (hero button + floating pill) that re-sends the QR email to **all** allocated guests, including those already notified — for resending an updated template ([pages/admin/events/[id]/notifications.tsx](pages/admin/events/[id]/notifications.tsx)). Guarded by a confirmation dialog.
- `/api/notify` bulk mode accepts an `all` flag that skips the `notifiedAt` filter ([pages/api/notify.ts](pages/api/notify.ts)). The existing "Notify N Unnotified" behaviour is unchanged (default).

## [2.8.1] — 2026-06-18

- Reminder email: moved the closing paragraphs ("arrive early" / "look forward" / "Safe travels, and see you tomorrow!") to **after** the Programme Agenda graphic, via a new `afterAgendaHtml` template field ([lib/emailTemplates.ts](lib/emailTemplates.ts), [pages/api/notify.ts](pages/api/notify.ts)). Plain-text + admin preview reordered to match.

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
