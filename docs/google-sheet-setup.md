# Google Sheet mirror — one-time setup

The RSVP system mirrors every real event's guest list into one Google
Spreadsheet (a tab per event: E1, E2, E3) with payment state, so the client's
ops team always has a live list without asking for exports. It syncs on every
partner registration / cancellation / payment confirmation, and the admin
panel's **⋯ → Open Google Sheet** re-syncs right before opening.

Nothing runs until the three env vars below are set — the feature is opt-in.

## 1. Create a service account (once)

1. Go to https://console.cloud.google.com/ → create (or pick) a project,
   e.g. `aurapixel-rsvp`.
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **IAM & Admin → Service Accounts → Create service account** — name it
   `rsvp-sheet-sync`, no roles needed, create.
4. Open the account → **Keys → Add key → Create new key → JSON** — a `.json`
   file downloads. That file is the value of `GOOGLE_SHEETS_SERVICE_ACCOUNT`.

## 2. Create the spreadsheet

1. Create a new Google Sheet (e.g. "NAIRW 2026 — Guest Lists") in the account
   that will own it (yours or the client's).
2. **Share** it with the service account's email (the `client_email` field in
   the JSON, ends `@…iam.gserviceaccount.com`) as **Editor**.
3. Share it with the client's team as **Viewer** (or Editor if they want to
   annotate — the sync only rewrites the event tabs, other tabs are untouched).
4. Copy the spreadsheet id from the URL:
   `https://docs.google.com/spreadsheets/d/`**`<THIS_LONG_ID>`**`/edit`.

## 3. Set the env vars

Local (`.env.local`): paste the JSON key **on one line** —

```
GOOGLE_SHEETS_SERVICE_ACCOUNT={"type":"service_account", ... }
GOOGLE_SHEET_ID=<spreadsheet id>
NEXT_PUBLIC_GOOGLE_SHEET_ID=<same spreadsheet id>
```

Vercel (run from `rsvp/`, each command prompts for the value):

```bash
export VERCEL_TOKEN=$(cat ~/.config/aurapixel/vercel-token)
cat path/to/downloaded-key.json | tr -d '\n' | npx vercel env add GOOGLE_SHEETS_SERVICE_ACCOUNT production --scope aurapixelcs-projects --token $VERCEL_TOKEN
npx vercel env add GOOGLE_SHEET_ID production --scope aurapixelcs-projects --token $VERCEL_TOKEN
npx vercel env add NEXT_PUBLIC_GOOGLE_SHEET_ID production --scope aurapixelcs-projects --token $VERCEL_TOKEN
```

Then redeploy (any push does it — `NEXT_PUBLIC_*` is baked at build time, so
the "Open Google Sheet" button only appears after the next build).

## 4. First fill + verify

Open any event in the admin panel → **⋯ → Open Google Sheet**. That triggers a
full sync of all three events and opens the sheet — the E1/E2/E3 tabs should
appear with a header row, an "Auto-updated …" stamp, and every guest including
**AWAITING PAYMENT** rows for unconfirmed corporate-billing / HRD delegates.

Delete the downloaded `.json` key file once the env vars are set.
