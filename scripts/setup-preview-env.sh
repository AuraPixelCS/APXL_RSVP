#!/usr/bin/env bash
# One-shot staging setup for the partner-form integration (Phase 4).
#
#   bash scripts/setup-preview-env.sh
#
# The Vercel PREVIEW environment of apxl-rsvp has none of the Firebase or
# Resend variables (they were only ever added to Production), so every branch
# build fails at "auth/invalid-api-key". This copies them across and adds the
# two integration variables with a fresh TEST key. Idempotent (--force).
#
# Source of truth is .env.local, NOT `vercel env pull`: the production values
# are stored as *sensitive* on Vercel, so a pull returns them as "" (verified
# 2026-08-28). .env.local carries the same values for the aurapixel-rsvp project.
#
# Values are never echoed. The generated test key is written to
# .integration-test-key (git-ignored) — send it to the partner over a secure
# channel, not in the same message as the URL.
set -euo pipefail
cd "$(dirname "$0")/.."

SCOPE=aurapixelcs-projects
TOKEN="$(cat ~/.config/aurapixel/vercel-token)"

[[ -f .env.local ]] || { echo "!! .env.local not found"; exit 1; }
project="$(node -e 'const m=require("fs").readFileSync(".env.local","utf8").match(/^NEXT_PUBLIC_FIREBASE_PROJECT_ID=["\x27]?([^"\x27\n]+)/m); process.stdout.write(m?m[1]:"")')"
[[ "$project" == "aurapixel-rsvp" ]] || { echo "!! .env.local points at '$project', expected aurapixel-rsvp — refusing"; exit 1; }

KEY_FILE=.integration-test-key
if [[ ! -s "$KEY_FILE" ]]; then openssl rand -hex 32 > "$KEY_FILE"; chmod 600 "$KEY_FILE"; echo "→ new test key written to $KEY_FILE"; else echo "→ reusing test key from $KEY_FILE"; fi

COPY=(FIREBASE_SERVICE_ACCOUNT_KEY NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID RESEND_API_KEY RESEND_FROM RESEND_REPLY_TO)

# Same line parser as scripts/seed-events-iamairready.js (KEY=value, optional quotes).
readvar() {
  node -e '
    const fs=require("fs"); const want=process.argv[1];
    for (const line of fs.readFileSync(".env.local","utf8").split("\n")) {
      const m=line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && m[1]===want) { process.stdout.write(m[2].replace(/^[\x27"]|[\x27"]$/g,"")); break; }
    }' "$1"
}

add() { # name value
  local out
  if out="$(printf '%s' "$2" | npx vercel env add "$1" preview --scope "$SCOPE" --token "$TOKEN" --force --yes 2>&1)"; then
    echo "  ok    $1 (${#2} chars)"
  else
    echo "  FAIL  $1 — $(echo "$out" | grep -i error | head -1)"
  fi
}

for name in "${COPY[@]}"; do
  val="$(readvar "$name")"
  if [[ -z "$val" ]]; then echo "  skip  $name (not in .env.local)"; continue; fi
  add "$name" "$val"
done
add INTEGRATION_API_KEY "$(cat "$KEY_FILE")"

echo
echo "Done. Redeploy the branch (git push) and the preview will build."
