# Open Items — running ledger

Everything flagged in passing during the audit remediation, kept in one place so
it can be cleared in a single sweep at the end rather than re-derived each time.

**Nothing here is fixed by shipping code.** Each item needs a console action, a
credential change, a decision, or a separate piece of work. Items marked
**BLOCKING** should be done before the next live event.

Secrets are referenced, never reproduced. Ask before assuming a value.

---

## 1 · Credentials & secrets

| # | Item | Why it matters | Action |
|---|---|---|---|
| 1.1 | **BLOCKING** — Service-account key for the OLD project `aura-pixel-db` was pasted into a chat transcript (key id ending `…b9d7a48a`) | A full-access Admin SDK credential exists in plaintext outside any vault | Firebase Console → `aura-pixel-db` → Project settings → Service accounts → delete that key |
| 1.2 | **BLOCKING** — Gmail app password for `adxbypostx@gmail.com` sits in `.env.local.example` | Not in git (`.env*` is gitignored) but it is a live credential in a file meant to be shared | Revoke at Google Account → Security → App passwords, then replace the example value with a placeholder |
| 1.3 | **BLOCKING** — `SCANNER_API_KEY` unset in production | `lib/apiAuth.ts` staged rollout allows **all** callers while unset, so Phase 1's scanner gate is dormant | Generate a key, set it in Vercel, ship the matching value in the scanner app |
| 1.4 | `*.json` is not gitignored | Migration keys live at `~/fb-migration/*.json` specifically to avoid this; a future key dropped in the repo would be committed | Add a service-account key pattern to `.gitignore` |
| 1.5 | `QR_SECRET` and `WEBHOOK_EVENT_ID` must **never** be rotated | Rotating `QR_SECRET` invalidates every entry pass ever emailed; `WEBHOOK_EVENT_ID` pins the live event doc | Document as do-not-touch; no action unless intentionally invalidating passes |

## 2 · Auth & access control

| # | Item | Why it matters | Action |
|---|---|---|---|
| 2.1 | 3 of 4 migrated Auth accounts have **no password** | Only `mandresh2599@gmail.com` can sign in; the others were imported without hashes | Set passwords via Admin SDK, or send reset emails once 2.2 exists |
| 2.2 | No **forgot-password** link on the login page | `sendPasswordResetEmail` exists only in `pages/admin/settings.tsx:573`, which requires already being signed in — useless when locked out | Add a reset link to `pages/admin/login.tsx` |
| 2.3 | Report endpoint is login-gated, not **role**-gated | `pages/api/admin/event-report.ts:61` is `withAuth(handler)` with no role, so any `client` can pull the full PII report (audit #32) | `withAuth(handler, "admin")` |
| 2.4 | Scanner check-in never verifies the **QR signature** | `pages/api/scanner/checkin.ts` trusts `rsvpId` from the body; a pass is replayable by anything holding the scanner key (audit #17) | Verify the signed token server-side before recording a check-in |

## 3 · Infrastructure

| # | Item | Why it matters | Action |
|---|---|---|---|
| 3.1 | Old project `aura-pixel-db` still live | Data was migrated, but the source is untouched and still billable/reachable | Decommission after a few weeks of confidence on `aurapixel-rsvp` |
| 3.2 | Firebase **Storage rules** on the new bucket not reviewed | CORS is applied and verified (Phase 2). Download URLs carry tokens and bypass rules, so emails render — but upload rules were never audited | Review Storage rules; confirm only authed admins can write |
| 3.3 | Merged branches `phase1-hardening`, `phase2-3-features` still exist | Noise; both are fully merged into `main` | Delete local + remote |
| 3.4 | Rate limiter is per-instance, in-memory | `pages/api/rsvp/submit.ts` throttles one hot Lambda, not a global cap — horizontal scaling defeats it | Durable fix is a shared store (Upstash Redis); acceptable for current volume |

## 4 · Scanner app (`rsvp-app`) — untouched this whole time

| # | Item | Why it matters | Action |
|---|---|---|---|
| 4.1 | **12 uncommitted files** | My `x-scanner-key` header changes are tangled with in-progress gradle / babel / package build work (593 insertions, 551 deletions; `MapScreen.tsx` is effectively a rewrite). Nothing is committed, so nothing is recoverable if the tree is lost | Untangle into two commits, build an APK, verify against prod |
| 4.3 | **BLOCKING for scanner work** — `node_modules` is absent and TypeScript is not installed | The app cannot be built, typechecked, linted, or run. Phase 3's offline scanner was NOT attempted for this reason: writing an untestable sync layer on top of an uncommitted build migration would be unverifiable work | `npm install`, confirm the modified gradle/babel config still builds, commit, THEN start offline work |
| 4.2 | Phase 1 scanner hardening is not actually live | Server side is deployed; the app has never shipped the matching key (see 1.3) | Ship together with 1.3 |

## 4b · Phase 3 configuration (new)

| # | Item | Why it matters | Action |
|---|---|---|---|
| 4b.1 | `RESEND_WEBHOOK_SECRET` not set, webhook endpoint not registered | Delivery tracking is inert until both exist. The endpoint returns 503 rather than trusting unsigned traffic, so nothing is silently accepted | Resend dashboard → Webhooks → add `https://www.aurapixel.live/rsvp/api/webhooks/resend`, subscribe to the email.* events, copy the `whsec_` secret into Vercel |
| 4b.2 | `MANAGE_SECRET` not set | Self-service links currently fall back to signing with `QR_SECRET`. That works, but it couples two credentials with very different exposure — an entry pass gets photographed and forwarded; a management link can cancel a booking | Generate a random secret, set in Vercel. Setting it invalidates any self-service links already sent |
| 4b.3 | Waitlist promotion does not email the guest | Deliberate: promotion moves them to `pending`, and the entry pass is sent by the existing allocate → notify flow. Worth knowing so nobody assumes a promoted guest has been told | None — documented behaviour, stated in the UI |
| 4b.4 | "Re-send my pass" only flags the request | Deliberate: letting an unauthenticated link trigger outbound mail is a spam relay, and the guest may be asking *because* delivery is failing — which an admin needs to see. Surfaces as a "Pass requested" badge in the guest table | None — admin re-sends from the Notifications page |

## 5 · Known code debt (audit findings, deferred by design)

These are Phase 4 items. Listed so they aren't rediscovered as surprises.

| # | Item | Audit ref |
|---|---|---|
| 5.1 | `notifiedAt` absent (not null) on public-form records — breaks the natural server-side query once the Notifications page outgrows client-side filtering | #36 |
| 5.2 | RSVP writes skip `stripUndefined` (unlike event writes) — an `undefined` field throws at Firestore | #42 |
| 5.3 | Event `createdAt`/`updatedAt` are Firestore `Timestamp`s but typed as `string` — `new Date(...)` yields Invalid Date and they don't survive SSR serialization | #34 |
| 5.4 | Cancelling a seat leaves a stale `qrToken` on the record | #39 |
| 5.5 | WhatsApp QR path is a stub; orphaned unauthenticated `send`/`confirm` routes remain | #40 |
| 5.6 | Three inconsistent event-status vocabularies across the UI | #38 |
| 5.7 | Google Forms import collapses structured fields into `message`; hardcoded ngrok URL | #41 |

## 6 · Lint baseline

Pre-existing, not introduced by any phase. Recorded so "lint is dirty" is never
mistaken for a regression.

- **12** `no-explicit-any` errors in `pages/api/notify.ts` and `pages/api/blast.ts` — verified byte-identical before and after Phase 2.
- **~79** `no-require-imports` errors across `scripts/*.js` — these are Node CLI utilities; the rule doesn't apply to them. Worth an eslint override for `scripts/**`.

---

## Verification log

Things confirmed by running something rather than by reading code.

- Firestore rules deployed to `aurapixel-rsvp` and verified live: unauth `events` → 200, `users` → 403.
- Migration moved 270 documents + 4 Auth users with **document ids and UIDs preserved** — existing QR passes and `WEBHOOK_EVENT_ID` remain valid.
- Dry run proved **no Storage-backed banners existed**, so the banner re-upload step was correctly a no-op.
- Storage CORS on `aurapixel-rsvp` was **empty** before Phase 2; explicit-origin config applied and read back.
- `npm test` — 153 assertions across 6 suites. Timezone suite passes identically under `UTC`, `America/Chicago`, and `Asia/Kuala_Lumpur`.
- Scanner app confirmed unbuildable as of Phase 3: `node_modules` absent, `typescript` not installed, working tree dirty.
