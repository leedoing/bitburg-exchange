#!/usr/bin/env bash
# 행사 다음 날 실행: EC2·네트워크·S3 버킷(terraform destroy)과 SSM 파라미터(/bitsburg-demo/*) 삭제.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-ap-northeast-2}"

terraform -chdir="$ROOT/infra/terraform" destroy

NAMES="$(aws ssm get-parameters-by-path --region "$REGION" --path /bitsburg-demo/ --query 'Parameters[].Name' --output text)"
if [[ -n "$NAMES" ]]; then
  # shellcheck disable=SC2086
  aws ssm delete-parameters --region "$REGION" --names $NAMES --query 'DeletedParameters' --output text
fi
echo "teardown done"
