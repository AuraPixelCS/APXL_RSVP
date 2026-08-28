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
# Values are never echoed. The generated test key is written to
# .integration-test-key (git-ignored) — send it to the partner over a secure
# channel, not in the same message as the URL.
set -euo pipefail
cd "$(dirname "$0")/.."

SCOPE=aurapixelcs-projects
TOKEN="$(cat ~/.config/aurapixel/vercel-token)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "→ pulling production values"
npx vercel env pull "$TMP/prod.env" --environment=production --scope "$SCOPE" --token "$TOKEN" -y >/dev/null

KEY_FILE=.integration-test-key
if [[ ! -s "$KEY_FILE" ]]; then openssl rand -hex 32 > "$KEY_FILE"; chmod 600 "$KEY_FILE"; echo "→ new test key written to $KEY_FILE"; else echo "→ reusing test key from $KEY_FILE"; fi

COPY=(FIREBASE_SERVICE_ACCOUNT_KEY NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID RESEND_API_KEY RESEND_FROM RESEND_REPLY_TO)

add() { # name value
  local out
  if out="$(printf '%s' "$2" | npx vercel env add "$1" preview --scope "$SCOPE" --token "$TOKEN" --force --yes 2>&1)"; then
    echo "  ok    $1"
  else
    echo "  FAIL  $1 — $(echo "$out" | grep -i error | head -1)"
  fi
}

node -e '
  const fs=require("fs"); const env={};
  for (const line of fs.readFileSync(process.argv[1],"utf8").split("\n")) { const m=line.match(/^([A-Z_0-9]+)="?(.*?)"?$/); if (m) env[m[1]]=m[2]; }
  fs.writeFileSync(process.argv[2], JSON.stringify(env));
' "$TMP/prod.env" "$TMP/prod.json"

for name in "${COPY[@]}"; do
  val="$(node -e 'const e=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(e[process.argv[2]]??"")' "$TMP/prod.json" "$name")"
  if [[ -z "$val" ]]; then echo "  skip  $name (not set in production)"; continue; fi
  add "$name" "$val"
done
add INTEGRATION_API_KEY "$(cat "$KEY_FILE")"
add INTEGRATION_EVENT_SUFFIX "-TEST"

echo
echo "Done. Redeploy the branch (git push, or: npx vercel --scope $SCOPE --token \$TOKEN) and the preview will build."
