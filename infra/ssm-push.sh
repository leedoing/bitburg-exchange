#!/usr/bin/env bash
# Upload the secrets the EC2 host needs from .env to SSM Parameter Store (/bitsburg-demo/*).
# Values are never printed. DD_APP_KEY stays local (the host does not need it).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-ap-northeast-2}"

for ENTRY in DD_API_KEY:SecureString DD_RUM_CLIENT_TOKEN:SecureString ADMIN_TOKEN:SecureString \
             DD_SITE:String DD_RUM_APP_ID:String; do
  KEY="${ENTRY%%:*}"
  TYPE="${ENTRY##*:}"
  VALUE="$(grep -E "^${KEY}=" "$ROOT/.env" | head -1 | cut -d= -f2-)"
  if [[ -z "$VALUE" ]]; then echo "missing $KEY in .env" >&2; exit 1; fi
  aws ssm put-parameter --region "$REGION" --name "/bitsburg-demo/$KEY" --type "$TYPE" \
    --value "$VALUE" --overwrite --no-cli-pager >/dev/null
  aws ssm add-tags-to-resource --region "$REGION" --resource-type Parameter --resource-id "/bitsburg-demo/$KEY" \
    --tags Key=Purpose,Value=coinone-abm-demo >/dev/null
  echo "put /bitsburg-demo/$KEY ($TYPE)"
done
