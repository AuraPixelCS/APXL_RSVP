#!/bin/sh
# Create events.peoplelogy.com as a Resend sending domain and print the DNS
# records PEOPLElogy must add (their open-items reply, item 9).
#
#   sh scripts/add-peoplelogy-domain.sh          # create + print records
#   sh scripts/add-peoplelogy-domain.sh --show   # just re-print the records
#
# Region ap-northeast-1 (Tokyo) — closest Resend region to Malaysia.
set -e
cd "$(dirname "$0")/.."

KEY=$(grep '^RESEND_API_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'")
[ -n "$KEY" ] || { echo "RESEND_API_KEY not found in .env.local" >&2; exit 1; }

DOMAIN="events.peoplelogy.com"

if [ "$1" != "--show" ]; then
  curl -s -X POST https://api.resend.com/domains \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"name\":\"$DOMAIN\",\"region\":\"ap-northeast-1\"}" >/dev/null
fi

curl -s https://api.resend.com/domains -H "Authorization: Bearer $KEY" |
python3 -c '
import json, sys
data = json.load(sys.stdin)
found = False
for d in data.get("data", []):
    if d["name"] != "events.peoplelogy.com":
        continue
    found = True
    print("Domain: %s   status: %s   region: %s" % (d["name"], d["status"], d["region"]))
    print("")
    print("DNS records for PEOPLElogy to add (copy this table into the email):")
    print("")
    print("%-6s %-40s %-8s %s" % ("TYPE", "NAME", "PRIORITY", "VALUE"))
    for r in d.get("records", []):
        name = "%s %s" % (r.get("record", ""), r.get("name", ""))
        prio = str(r.get("priority") or "")
        print("%-6s %-40s %-8s %s" % (r.get("type", ""), name, prio, r.get("value", "")))
    break
if not found:
    print("Domain not found — creation may have failed; re-run without --show.")
'
