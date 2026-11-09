#!/usr/bin/env bash
# Usage: scripts/fault.sh <kyc_vendor_slow|deposit_delay|listing_spike|state> [on|off] [intensity] [durationMin]
#   BASE=http://<host> scripts/fault.sh kyc_vendor_slow on 0.7 15
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_TOKEN="$(grep -E '^ADMIN_TOKEN=' "$ROOT/.env" | cut -d= -f2-)"
BASE="${BASE:-http://localhost}"
FAULT="${1:?fault name or 'state'}"

if [[ "$FAULT" == "state" ]]; then
  curl -fsS "$BASE/admin/state" -H "X-Admin-Token: $ADMIN_TOKEN" | jq .
  exit 0
fi

ACTION="${2:?on|off}"
ENABLED=false; [[ "$ACTION" == "on" ]] && ENABLED=true
INTENSITY="${3:-0.7}"
DURATION="${4:-15}"

curl -fsS -X POST "$BASE/admin/faults" \
  -H "X-Admin-Token: $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d "{\"fault\":\"$FAULT\",\"enabled\":$ENABLED,\"intensity\":$INTENSITY,\"durationMin\":$DURATION}" | jq -c '.faults[] | select(.enabled) // empty, .campaign'
