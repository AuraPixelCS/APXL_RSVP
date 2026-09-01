# Registration → RSVP: one page for the form team

Applies to every pass sold or issued through your forms — the free Summit pass
(`#pass-complimentary`), the paid BAFT passes (`#pass-baft`) and the internal
Sponsor / Partner / Media passes. One endpoint, one payload shape, one key per
environment.

## What happens

1. A visitor submits your form. For a paid pass you confirm payment first
   (Stripe, or your finance team for corporate/grant bookings) — we only ever
   hear about a paid delegate after that.
2. Your backend calls **Register** (below) with the submission.
3. We create one registration **per event the ticket opens** and email the
   registrant an entry pass per venue — one QR for the Summit, one for BAFT,
   and (P2 only) one for the Gala once a table is assigned.
4. You receive `201` with a `passes[]` array, one entry per event.

Your own acknowledgement email is optional. If you keep it, please say the entry
pass follows separately from AuraPixel, so nobody reads yours as the ticket.

## Environments

Same URL, two keys. Which key you send decides where the registration lands.

| Key | Registrations land in | Emails |
|---|---|---|
| **Production key** | The real events — the guest lists we scan at the door | Real, to the address submitted |
| **Test key** | Test twins of the same events (titled "— TEST") | Real, to the address submitted — use your own inboxes |

Use the test key from your local, QA and UAT environments. Nothing sent with it
can reach a real guest list, so no `submission_id` prefix filtering is needed on
our side. We can wipe the test twins on request.

Both keys reach you separately from this document.

## Register

```
POST https://www.aurapixel.live/rsvp/api/integrations/register
X-API-Key: {production or test key}
Content-Type: application/json
```

### Request — your field names are accepted as-is

```json
{
  "submission_id": "CP-000123",
  "pass_id": "F3",
  "name": "Aisyah Rahman",
  "email": "aisyah@example.com",
  "phone": "+60123456789",
  "organisation": "Example Sdn Bhd",
  "job_title": "Head of People",
  "industry": "Education",
  "days": ["2026-11-12", "2026-11-13", "2026-11-14"],
  "consent": true
}
```

Required: `submission_id` (any stable reference of yours — this is what makes
retries safe), `name`, `email`. Everything else — `phone` included — is
optional and stored as sent: send it when you have it, leave it out when you
don't. `pass_id` defaults to the free Summit pass when omitted.

### `pass_id` — the ticket codes

The codes from Build Brief v3 are canonical. Your product ids are accepted as
aliases so you need no translation table. Matching is case-insensitive.

| Send | Ticket | Registers into | Also accepted |
|---|---|---|---|
| `F3` | Free — 3 days Summit | Summit (12–14 Nov) | `complimentary`, `pass-complimentary`, `free` |
| `F12` | Free — 12 Nov only, SME & Public | Summit, 12 Nov | |
| `F13` | Free — 13 Nov only, Workforce & Public | Summit, 13 Nov | |
| `F14` | Free — 14 Nov only, Uni & Youth / Public | Summit, 14 Nov | |
| `P1` | BAFT delegate + 3 days Summit, MYR | BAFT (17–18 Nov) **and** Summit | `standard-delegate`, `baft_conference_myr` |
| `P1-INT` | Same, USD | BAFT and Summit | `baft_conference_usd` |
| `P2` | BAFT delegate + Gala + 3 days Summit, MYR | BAFT, Gala (18 Nov) **and** Summit | `all-inclusive`, `baft_gala_myr` |
| `P2-INT` | Same, USD | BAFT, Gala and Summit | `baft_gala_usd` |
| `V-SP` / `V-PT` / `V-MD` | Sponsor / Partner / Media (internal) | BAFT and Summit | `sponsor`, `partner`, `media` |

MYR and USD are separate codes only so our reporting can tell them apart — they
open exactly the same events. `F19`, `F20` and `F21` from brief v2 are **not**
accepted: the days moved, so an old code fails with `unknown_ticket` rather than
silently admitting to the wrong day.

`days` is optional. For `F12`–`F14` the day is implied by the code; for `F3`
and the paid passes it defaults to all three Summit days. If you send `days`,
we store what you send.

### Responses

| Code | Body | Meaning |
|---|---|---|
| `201` | `{ registrationId, status, passIssued, emailSent, event, ticketType, environment, passes: [...] }` | Registered. `passes[]` has one entry per event the ticket opens; the flat fields mirror the first (primary) one. `environment` is `"production"` or `"test"`. |
| `200` | `{ ..., duplicate: true }` | Same `submission_id` seen before — nothing changed, no email. Safe to retry on timeouts. |
| `409` | `{ error: "duplicate_email", event }` | This email already holds a registration for the ticket's primary event under a **different** `submission_id`. |
| `409` | `{ error: "event_full" }` | The ticket's primary event is at capacity. Should not occur for paid passes — tell us if it does. |
| `400` | `{ error: "invalid_payload", message, field }` | Missing/invalid field — `message` says which. |
| `401` | `{ error: "unauthorized" }` | Wrong or missing `X-API-Key`. |
| `422` | `{ error: "unknown_ticket" \| "ticket_not_enabled" \| "event_not_found" \| "registration_closed" }` | Ticket/event problem — `message` explains. |

Each entry in `passes[]`:

```json
{
  "event": { "code": "E3", "title": "Summit (NAIRW)" },
  "registrationId": "…",
  "status": "confirmed",
  "passIssued": true,
  "emailSent": true
}
```

`status` is `confirmed` (QR issued and emailed), `pending_allocation` (Gala
only — the pass follows once a table is assigned) or `waitlisted` (free passes
only, if the Summit ever hits capacity). An entry may also carry `duplicate:
true` (that event already had this submission) or `reused: true` (see below).

If `emailSent` is `false` the registration still exists; our team resends from
the admin panel. Nothing for your side to do.

### Duplicates — what actually happens

- The rule is **one registration per email per event**. Phone numbers are never
  used for matching, so colleagues sharing an office line do not collide.
- Same `submission_id` again → `200 duplicate: true`, nothing sent. Your backfill
  and your retries both rely on this and it holds.
- Different `submission_id`, same email, same **primary** event → `409
  duplicate_email`. (Someone buying a second BAFT ticket with the same address.)
- Different `submission_id`, same email, on a **secondary** event → the existing
  registration is kept and reported as `reused: true`. This is the "took the
  free Summit pass in September, employer bought them a BAFT ticket in October"
  case: the BAFT pass is issued, and their Summit pass is the one they already
  have. No refusal, no second Summit email.

### Capacity and waitlisting

Only the **free** Summit passes can ever be waitlisted, and only if the Summit
reaches its cap. Paid passes are never waitlisted: you gate the sale, so we
accept every paid registration you send.

### Corporate billing & HRD Corp claims — unpaid capture

For **Self-funded (pay now)** nothing changes: call Register after Stripe
settles, exactly as today.

For **Corporate billing (invoice)** and **SBL-KHAS claim (HRD Corp)**, don't
hold the registration on your side while finance processes it — send it to us
**at form-submission time** with one extra field:

```json
{ "submission_id": "BD-000101", "pass_id": "P2",
  "name": "Delegate Name", "email": "delegate@company.com",
  "payment_status": "unpaid",
  "payment_method": "corporate_billing" }
```

- `payment_status`: `"unpaid"` (also accepted: `pending`, `awaiting_payment`,
  `invoiced`) or `paid: false`. **Without this field a Register call still
  means "payment is done"** — the original contract is unchanged.
- `payment_method` (optional, informational): `corporate_billing`,
  `hrd_claim`, or `self_funded` — your own spellings are folded onto these.

What we do with it: the delegate is **captured but not activated**. They
appear in the organiser's panel and guest sheet marked **Awaiting Payment**;
no email is sent, no QR is issued, no seat is held. The response answers
`201` with `status: "awaiting_payment"` and `passIssued: false` on every
event of the ticket.

When payment is confirmed, either side can activate it — whichever comes
first wins, and the other becomes a harmless duplicate:

1. **You**: call Register again with the same `submission_id` and
   `payment_status: "paid"` (or simply omit the payment fields). We issue
   the passes and email them, exactly like a normal paid registration.
2. **The organiser**: presses **Confirm Payment** in the admin panel, which
   does the same across every event of the ticket.

An unpaid registration re-sent while still unpaid answers `duplicate: true`
and changes nothing. Cancel works on unpaid registrations too, if the invoice
falls through.

### Delegate transfers

Your terms allow a registration to move to another person from the same
company. Send **Register** again with the **same `submission_id`**, the new
delegate's details, and one extra field:

```json
{ "submission_id": "BD-000042", "pass_id": "P1", "transfer": true,
  "name": "Replacement Person", "email": "replacement@company.com" }
```

What happens, atomically per event the ticket opens:

- The previous holder's registration is voided — their QR is refused at the
  door from that moment ("Pass cancelled — this registration was transferred").
- The replacement is registered and their passes are emailed, exactly like a
  fresh registration. The response carries `transfer: true` and each affected
  entry in `passes[]` is marked `transferred: true`.
- If the departing delegate's Summit pass was their own free registration
  (`reused` at purchase time), it is **not** touched — it was never part of
  the ticket. The replacement gets their own Summit pass.
- Retry-safe: send the same transfer twice and the second answers
  `duplicate: true` with nothing re-sent.

Without `transfer: true`, the same `submission_id` with a new email is treated
as a mistake and refused — so a typo on a retry can never silently revoke
someone's pass.

### Cancellations

For a drop-out with no replacement:

```
POST {BASE}/api/integrations/cancel
X-API-Key: {same keys}
{ "submission_id": "BD-000042", "reason": "optional note" }
```

Voids every registration under that reference in your environment (test key →
test events only). Response lists what was cancelled; `404 not_found` if the
reference is unknown; cancelling twice is safe. A cancelled person can
re-register later under a new `submission_id` — same email is fine.

### Retries

Call again with the same `submission_id` on any network error or `5xx`. You
will get `200 duplicate: true` if the first call had actually gone through.
