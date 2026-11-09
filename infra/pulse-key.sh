#!/usr/bin/env bash
# Dedicated Datadog application key for the shared Pulse URL on EC2 (:8080).
#   infra/pulse-key.sh          create (or rotate) the key "bitsburg-pulse-ec2" and store it in SSM /bitsburg-demo/PULSE_DD_APP_KEY
#   infra/pulse-key.sh revoke   delete that key in Datadog and the SSM parameter (run after the event)
# The key value is never printed: it goes from the API response to SSM through 0600 temp files.
# App Builder backend functions need the key registered for Actions API access (app_key_registrations).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-ap-northeast-2}"
NAME="bitsburg-pulse-ec2"
PARAM="/bitsburg-demo/PULSE_DD_APP_KEY"

set -a; . "$ROOT/.env"; set +a
API="https://api.${DD_SITE}/api/v2/current_user/application_keys"
REG="https://api.${DD_SITE}/api/v2/actions/app_key_registrations"
dd() { curl -fsS -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" -H 'content-type: application/json' "$@"; }

revoke_keys() {
  for ID in $(dd "$API?filter=$NAME&page%5Bsize%5D=100" | jq -r --arg n "$NAME" '.data[] | select(.attributes.name == $n) | .id'); do
    dd -X DELETE "$REG/$ID" >/dev/null 2>&1 || true
    dd -X DELETE "$API/$ID" >/dev/null
    echo "revoked Datadog application key $NAME ($ID)"
  done
}

if [[ "${1:-}" == "revoke" ]]; then
  revoke_keys
  aws ssm delete-parameter --region "$REGION" --name "$PARAM" 2>/dev/null && echo "deleted $PARAM" || true
  exit 0
fi

revoke_keys
umask 077
RESP="$(mktemp)"; TMP="$(mktemp)"; trap 'rm -f "$RESP" "$TMP"' EXIT
dd -X POST "$API" -d "{\"data\":{\"type\":\"application_keys\",\"attributes\":{\"name\":\"$NAME\"}}}" > "$RESP"
jq -j '.data.attributes.key // empty' "$RESP" > "$TMP"
KEY_ID="$(jq -r '.data.id' "$RESP")"
[[ -s "$TMP" ]] || { echo "no key in Datadog response" >&2; exit 1; }
dd -X PUT "$REG/$KEY_ID" >/dev/null
echo "registered $NAME for Actions API access"
aws ssm put-parameter --region "$REGION" --name "$PARAM" --type SecureString \
  --value "file://$TMP" --overwrite --no-cli-pager >/dev/null
aws ssm add-tags-to-resource --region "$REGION" --resource-type Parameter --resource-id "$PARAM" \
  --tags Key=Purpose,Value=coinone-abm-demo >/dev/null
echo "created Datadog application key $NAME and put $PARAM (SecureString)"
