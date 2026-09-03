#!/bin/sh
# Send a DKIM-alignment probe from the new sender identity to one or more
# inboxes, BEFORE flipping the real pass emails. Run only after
# `add-sending-domain.sh --verify` reports the domain "verified".
#
#   sh scripts/probe-imaiready-sender.sh you@gmail.com you@outlook.com ...
#
# What to check in each inbox:
#   1. The mail landed in the INBOX, not Junk/Spam (their DMARC is
#      p=quarantine — a failure goes to junk silently).
#   2. Open the raw headers (Gmail: ⋮ → Show original) and confirm:
#        dkim=pass  ... header.d=events.imaiready.asia
#        dmarc=pass
#      (spf may show as unaligned/neutral — expected and fine.)
set -e
cd "$(dirname "$0")/.."

[ $# -ge 1 ] || { echo "usage: sh scripts/probe-imaiready-sender.sh <inbox> [more inboxes...]" >&2; exit 1; }

KEY=$(grep '^RESEND_API_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'")
[ -n "$KEY" ] || { echo "RESEND_API_KEY not found in .env.local" >&2; exit 1; }

STAMP=$(date "+%Y-%m-%d %H:%M")
for TO in "$@"; do
  RESP=$(curl -s -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{
      \"from\": \"PEOPLElogy Events <passes@events.imaiready.asia>\",
      \"to\": [\"$TO\"],
      \"replyTo\": \"secretariat@imaiready.asia\",
      \"subject\": \"NAIRW sender probe — $STAMP\",
      \"html\": \"<p>Deliverability probe for the NAIRW 2026 pass sender.</p><p>If you can read this in your <strong>inbox</strong> (not junk), open the raw headers and confirm <code>dkim=pass</code> with <code>header.d=events.imaiready.asia</code> and <code>dmarc=pass</code>.</p><p>Replies to this message should go to secretariat@imaiready.asia.</p>\"
    }")
  echo "$TO -> $RESP"
done
echo ""
echo "Now check each inbox per the notes at the top of this script."
