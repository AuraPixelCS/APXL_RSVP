#!/bin/sh
# Create a Resend sending domain for the pass emails and print the DNS records
# to forward to PEOPLElogy. They chose events.imaiready.asia (2 Sep reply) —
# same domain delegates register on, so all event mail aligns.
#
#   sh scripts/add-sending-domain.sh                 # create events.imaiready.asia + print records
#   sh scripts/add-sending-domain.sh --show          # just re-print the records
#   sh scripts/add-sending-domain.sh --verify        # ask Resend to check the DNS now (repeat until "verified")
#   sh scripts/add-sending-domain.sh other.dom.tld   # different subdomain
#
# Region ap-northeast-1 (Tokyo) — closest Resend region to Malaysia, same as
# aurapixel.live.
#
# DMARC note: imaiready.asia publishes p=quarantine with adkim=s (strict).
# Resend signs DKIM with d=<exactly the domain added here>, so a From address
# on this same subdomain (e.g. passes@events.imaiready.asia) passes strict
# alignment via DKIM. SPF will NOT strictly align (Resend's Return-Path lives
# on send.<domain>) — that is fine, DMARC needs only one of the two.
set -e
cd "$(dirname "$0")/.."

KEY=$(grep '^RESEND_API_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'")
[ -n "$KEY" ] || { echo "RESEND_API_KEY not found in .env.local" >&2; exit 1; }

DOMAIN="events.imaiready.asia"
MODE="create"
for a in "$@"; do
  case "$a" in
    --show) MODE="show" ;;
    --verify) MODE="verify" ;;
    *) DOMAIN="$a" ;;
  esac
done

if [ "$MODE" = "create" ]; then
  curl -s -X POST https://api.resend.com/domains \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"name\":\"$DOMAIN\",\"region\":\"ap-northeast-1\"}" >/dev/null
fi

# The list endpoint has no records — fetch the domain's detail for them.
DOMAIN_ID=$(curl -s https://api.resend.com/domains -H "Authorization: Bearer $KEY" |
DOMAIN="$DOMAIN" python3 -c '
import json, os, sys
matches = [d["id"] for d in json.load(sys.stdin).get("data", []) if d["name"] == os.environ["DOMAIN"]]
print(matches[0] if matches else "")
')
[ -n "$DOMAIN_ID" ] || { echo "Domain $DOMAIN not found — creation may have failed; re-run without --show." >&2; exit 1; }

if [ "$MODE" = "verify" ]; then
  curl -s -X POST "https://api.resend.com/domains/$DOMAIN_ID/verify" \
    -H "Authorization: Bearer $KEY" >/dev/null
  echo "Verification requested — status below (re-run --verify or --show until it reads \"verified\"; usually under a minute once DNS has propagated)."
  echo ""
fi

curl -s "https://api.resend.com/domains/$DOMAIN_ID" -H "Authorization: Bearer $KEY" |
DOMAIN="$DOMAIN" python3 -c '
import json, os, sys
domain = os.environ["DOMAIN"]
d = json.load(sys.stdin)
print("Domain: %s   status: %s   region: %s" % (d.get("name"), d.get("status"), d.get("region")))
print("")
print("DNS records for PEOPLElogy to add (copy this table into the email):")
print("")
print("%-6s %-42s %-8s %s" % ("TYPE", "HOST", "PRIORITY", "VALUE"))
apex = ".".join(domain.split(".")[-2:])
for r in d.get("records", []):
    name = r.get("name") or ""
    # Resend returns names relative to the zone apex ("send.events") — print
    # the full host so the records land at the right level of the zone.
    host = name if name.endswith(apex) else ("%s.%s" % (name, apex) if name else domain)
    prio = str(r.get("priority") or "")
    print("%-6s %-42s %-8s %s" % (r.get("type", ""), host, prio, r.get("value", "")))
'
