# Changelog

All production deployments are recorded here. Format: `## [version] — YYYY-MM-DD`.

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
