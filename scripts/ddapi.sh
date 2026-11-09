#!/usr/bin/env bash
# Usage: scripts/ddapi.sh METHOD PATH [BODY_FILE|-]
# Calls the Datadog API with keys from .env. Never prints the keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT/.env"; set +a
METHOD="$1"; PATH_="$2"; BODY="${3:-}"
ARGS=(-sS -X "$METHOD" "https://api.${DD_SITE}${PATH_}"
  -H "DD-API-KEY: ${DD_API_KEY}" -H "DD-APPLICATION-KEY: ${DD_APP_KEY}"
  -H "Content-Type: application/json" -w '\n%{http_code}\n')
if [[ -n "$BODY" ]]; then
  if [[ "$BODY" == "-" ]]; then ARGS+=(--data-binary @-); else ARGS+=(--data-binary "@$BODY"); fi
fi
curl "${ARGS[@]}"
