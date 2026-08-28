# Complimentary Pass → RSVP: one page for the form team

Applies to the free Summit pass form (`#pass-complimentary`). The paid BAFT
passes use the same endpoint later, once the payment step is agreed.

## What happens

1. A visitor submits your complimentary-pass form.
2. Your backend calls **Register** (below) with the submission.
3. We create the registration, generate the QR pass and **email it to the
   registrant straight away** — there is no seat allocation on this event.
4. You receive `201 { status: "confirmed", passIssued: true, emailSent: true }`.

Your existing success message ("Look out for a confirmation email shortly") is
correct as it stands — the email it refers to is our QR pass. Please don't send a
second confirmation of your own, or if you must, say the QR pass follows separately.

## Register

```
POST {BASE}/api/integrations/register
X-API-Key: {key we send you separately}
Content-Type: application/json
```

| Environment | `{BASE}` |
|---|---|
| Staging (test) | `https://<preview-url>.vercel.app/rsvp` — sent with the test key |
| Production | `https://www.aurapixel.live/rsvp` |

Staging registrations go into a test event and send real emails only to the
address you submit — use your own inboxes.

### Request — your field names are accepted as-is

```json
{
  "submission_id": "CP-000123",
  "pass_id": "complimentary",
  "name": "Aisyah Rahman",
  "email": "aisyah@example.com",
  "phone": "+60123456789",
  "organisation": "Example Sdn Bhd",
  "job_title": "Head of People",
  "industry": "Education",
  "days": ["2026-11-19", "2026-11-20"],
  "consent": true
}
```

Required: `submission_id` (any stable reference of yours — this is what makes
retries safe), `name`, `email`, `phone`. Everything else is optional and stored as
sent. `pass_id` defaults to `complimentary`.

### Responses

| Code | Body | Meaning |
|---|---|---|
| `201` | `{ registrationId, status: "confirmed", passIssued: true, emailSent: true }` | Registered; QR pass emailed. |
| `201` | `{ status: "waitlisted", ... }` | Event at capacity; registrant emailed a waitlist notice, no pass. |
| `200` | `{ ..., duplicate: true }` | Same `submission_id` seen before — nothing changed, no second email. Safe to retry on timeouts. |
| `409` | `{ error: "duplicate_email" }` | This email is already registered for the event under a different submission. |
| `400` | `{ error: "invalid_payload", message, field }` | Missing/invalid field — `message` says which. |
| `401` | `{ error: "unauthorized" }` | Wrong or missing `X-API-Key`. |
| `422` | `{ error: "ticket_not_enabled" | "unknown_ticket" | "event_not_found" | "registration_closed" }` | Ticket/event problem — the paid BAFT keys return `ticket_not_enabled` until that step is live. |

If `emailSent` is `false` the registration still exists; our team resends from
the admin panel. Nothing for your side to do.

### Retries

Call again with the same `submission_id` on any network error or `5xx`. You
will get `200 duplicate: true` if the first call had actually gone through.
