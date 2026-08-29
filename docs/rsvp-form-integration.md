# RSVP Form Integration — November 2026

**Draft v0.1 · 25 August 2026 · Ref APQ-2026-1015**
**From:** AuraPixel (RSVP system) · **For:** PEOPLElogy form & automation team
**Status:** draft for review — items marked **TBC** need PEOPLElogy's confirmation. Question numbers refer to the open-question list in Build Brief v2 (20 Aug 2026).

## 1 · The model in brief

- **One QR per person** for the whole week, whatever the ticket. The QR carries only a signed identifier; every right is resolved server-side at each door, so a ticket can be upgraded, corrected or revoked after issue without reissuing the code.
- **Paid tickets (P1/P2): no pass until a payment confirmation webhook arrives.** A submitted-but-unpaid form is a pending record with no code.
- Free tickets (F3/F19/F20/F21) and internal passes (V-SP/V-PT/V-MD): pass issued immediately on registration.
- **We send the QR email** with the entitlement list ("what this code opens"). Your SharePoint/EDM push is unaffected and stays on your side (**TBC** — question 07).

## 2 · How it connects

| Step | Who | What happens |
|---|---|---|
| 1 | Applicant | Submits your landing-page form |
| 2 | Your automation → us | `POST Register` (every ticket, **before** payment) → returns `registrationId`. Free/internal tickets get their pass and QR email at this point |
| 3a | Stripe rail | Applicant pays through your Stripe checkout, carrying `registrationId` in metadata → Stripe fires our webhook |
| 3b | Internal rail | Payment lands in your internal account system → it fires our webhook |
| 4 | Us | On confirmation: pass issued, applicant emailed one QR + what it opens. Registration appears in the RSVP panel throughout |

## 3 · Ticket types

| Code | Ticket | Price | The pass opens |
|---|---|---|---|
| P1 | BAFT delegate + 3 days Summit | RM 2,500 | E1 both days, E3 all three days |
| P2 | BAFT delegate + Gala + 3 days Summit | RM 2,800 | E1, E2, E3 — everything |
| F3 | Free — 3 days Summit | Free | E3, all three days |
| F19 | Free — 19 Nov only (SME & Public) | Free | E3, 19 Nov only |
| F20 | Free — 20 Nov only (Workforce & Public) | Free | E3, 20 Nov only |
| F21 | Free — 21 Nov only (Uni & Youth / Public) | Free | E3, 21 Nov only |
| V-SP | Sponsor (internal) | — | All five days — Gala inclusion **TBC**, question 05 |
| V-PT | Partner (internal) | — | All five days — Gala inclusion **TBC**, question 05 |
| V-MD | Media (internal) | — | All five days — Gala inclusion **TBC**, question 05 |

Events: **E1** BAFT Conference 17–18 Nov · **E2** Award Gala Dinner 18 Nov evening, seated with tables · **E3** Summit (NAIRW) 19–21 Nov, themed by day.

> **Status (30 Aug 2026):** superseded by [`complimentary-pass-integration.md`](./complimentary-pass-integration.md),
> which is the live contract for **every** pass (free, paid and internal). Payment is confirmed on the
> partner's side before they call Register, so the Confirm endpoint and the Stripe webhook below are **not
> being built**. Duplicate handling below ("accepted but flagged") is also superseded: it is one registration
> per email per event, `409` on the primary event, reuse on a secondary one.

## 4 · Endpoint 1 — Register

```
POST https://www.aurapixel.live/rsvp/api/integrations/register
X-API-Key: <issued separately — never in this document>
Content-Type: application/json
```

```json
{
  "externalRef": "your-submission-id-0042",
  "ticketType": "P2",
  "paymentMethod": "stripe",
  "attendee": {
    "fullName": "Aisyah Rahman",
    "email": "aisyah@company.com",
    "phone": "+60123456789",
    "company": "Company Sdn Bhd",
    "jobTitle": "HR Director"
  }
}
```

- `ticketType`: `P1 P2 F3 F19 F20 F21 V-SP V-PT V-MD`
- `paymentMethod`: `"stripe"` or `"internal"` — required for P1/P2, omitted for free tickets
- `attendee` fields are our proposed minimum — the final field list is yours (**TBC**, question 02)
- `externalRef`: your submission id, echoed back everywhere for reconciliation

**Responses**

- `201` free/internal → `{ "registrationId": "…", "status": "confirmed", "passIssued": true }`
- `201` paid → `{ "registrationId": "…", "status": "pending_payment", "passIssued": false }`
- `200` retry of a known `externalRef` → the original result. Idempotent — retry freely on timeout.
- `422` unknown ticket type or missing required field — nothing created.

Duplicate people (same email/phone across submissions) are accepted but flagged for review in the panel — the dedup rule carried over from brief v1.

## 5 · Endpoint 2 — Stripe confirmation

We listen for `checkout.session.completed` / `payment_intent.succeeded` — which one depends on your checkout mode (**TBC**).

What we need on your side:

1. Attach the id: `metadata.registration_id` (or `client_reference_id` on Checkout Sessions).
2. Register our endpoint in the Stripe account: `POST https://www.aurapixel.live/rsvp/api/webhooks/stripe`, and pass us the signing secret (`whsec_…`) through a secure channel.
3. **TBC** (question 03): whose Stripe account — yours or ours.

The webhook amount is cross-checked against the ticket price. A mismatch is held for manual review; the pass is not auto-issued.

## 6 · Endpoint 3 — Internal account system confirmation

```
POST https://www.aurapixel.live/rsvp/api/webhooks/internal-payment
```

Proposed payload — **negotiable: send us your system's actual webhook shape and we adapt** (**TBC**):

```json
{
  "registrationId": "reg_8Kj2…",
  "paymentRef": "INV-2026-0042",
  "amount": 2800,
  "currency": "MYR",
  "paidAt": "2026-10-02T14:00:00+08:00"
}
```

Either `registrationId` or `externalRef` must be present. Auth proposal: shared-secret header (`X-Webhook-Key`) plus `X-Signature` = HMAC-SHA256 of the raw body; if your system cannot sign, shared key + IP allow-list (**TBC**).

## 7 · When the QR email goes out

| Ticket | Payment rail | Pass + QR email |
|---|---|---|
| F3 / F19 / F20 / F21 | none | Immediately on Register |
| V-SP / V-PT / V-MD | none | Immediately (usually issued by AuraPixel in the panel) |
| P1 / P2 | Stripe | On the Stripe webhook |
| P1 / P2 | Internal | On the internal-system webhook |

## 8 · Handled on our side — nothing for you to build

- **Retries:** both webhook receivers are idempotent; a double fire can never issue two passes.
- **Out-of-order:** a payment webhook arriving before the Register call is held and matched when the registration lands.
- **Manual fallback:** an authorised AuraPixel admin can mark a registration paid and issue the pass, logged against a named user — covers bank-transfer stragglers and on-site cases.
- **Upgrades and refunds:** entitlements change server-side; the emailed QR never needs reissuing. A refund revokes the pass (refund policy itself **TBC** — to add to the open-question list).

## 9 · What we need back

We will issue a test API key and a staging URL as soon as we hear back.

1. Final form field list, and when your automation calls Register (question 02).
2. Stripe: whose account; webhook registration + signing secret; confirmation you can attach `registration_id` (question 03).
3. Internal account system: a sample webhook payload, its auth scheme, retry policy, and a sandbox we can test against.
4. A technical contact for a joint end-to-end test — form → pay → QR — landing **well before the dry run on Monday 16 November**.

---

AuraPixel Creative Studio Sdn. Bhd. · RSVP System · companion to Build Brief v2 (20 Aug 2026) · draft v0.1
