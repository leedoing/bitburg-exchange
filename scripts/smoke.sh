#!/usr/bin/env bash
# 가입 → KYC → 입금 → 주문 한 사이클 스모크 테스트
set -euo pipefail
BASE="${1:-http://localhost}"
VER="${APP_VERSION:-3.4.2}"
FLOW="v1"; [[ "$VER" == "3.5.0" ]] && FLOW="v2"
H=(-H 'content-type: application/json' -H "x-app-version: $VER" -H 'x-campaign-id: none' -H 'x-platform: web' -H 'x-scenario: baseline')

step() { printf '\n== %s\n' "$1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

step "signup"
SIGNUP=$(curl -fsS "${H[@]}" -X POST "$BASE/api/auth/signup" -d '{}')
echo "$SIGNUP"
USER_ID=$(echo "$SIGNUP" | jq -r .userId)
[[ "$USER_ID" == u_* ]] || fail "signup"
H+=(-H "x-user-id: $USER_ID")

step "kyc ($FLOW)"
KYC=$(curl -sS "${H[@]}" -X POST "$BASE/api/kyc/verify" -d "{\"flow\":\"$FLOW\"}")
echo "$KYC"
[[ "$(echo "$KYC" | jq -r .status)" =~ ^(approved|rejected)$ ]] || fail "kyc"

step "deposit"
DEP=$(curl -fsS "${H[@]}" -X POST "$BASE/api/wallet/deposit" -d '{"amountKrw":1000000}')
echo "$DEP"
DEP_ID=$(echo "$DEP" | jq -r .depositId)
for i in $(seq 1 60); do
  STATUS=$(curl -fsS "${H[@]}" "$BASE/api/wallet/deposit/$DEP_ID" | jq -r .status)
  [[ "$STATUS" == "completed" ]] && break
  sleep 2
done
echo "deposit status: $STATUS"
[[ "$STATUS" == "completed" ]] || fail "deposit"

step "order"
ORDER=$(curl -sS "${H[@]}" -X POST "$BASE/api/orders" -d '{"symbol":"BITS","amountKrw":300000,"side":"buy"}')
echo "$ORDER"
[[ "$(echo "$ORDER" | jq -r .status)" == "filled" ]] || fail "order"

step "cs contact"
curl -fsS "${H[@]}" -X POST "$BASE/api/cs/contact" -d '{"topic":"deposit"}'; echo

step "demo state"
curl -fsS "$BASE/api/demo/state"; echo

echo; echo "SMOKE OK ($VER, user $USER_ID)"
