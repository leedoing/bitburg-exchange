#!/usr/bin/env bash
# Package the committed code (git archive: no .env), upload it to the artifact bucket,
# and redeploy on the EC2 host through SSM Run Command.
#   infra/deploy.sh            # redeploy HEAD to the running instance
#   infra/deploy.sh --url-only # print nothing but upload and write the presigned URL to infra/terraform/artifact.auto.tfvars
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF="$ROOT/infra/terraform"
REGION="${AWS_REGION:-ap-northeast-2}"
BUCKET="$(terraform -chdir="$TF" output -raw artifact_bucket)"
KEY="bitsburg-$(git -C "$ROOT" rev-parse --short HEAD)-$(date +%s).tgz"

git -C "$ROOT" archive --format=tar.gz -o "/tmp/$KEY" HEAD
aws s3 cp --region "$REGION" "/tmp/$KEY" "s3://$BUCKET/$KEY" --no-progress >/dev/null
rm -f "/tmp/$KEY"
URL="$(aws s3 presign --region "$REGION" "s3://$BUCKET/$KEY" --expires-in 604800)"
echo "uploaded s3://$BUCKET/$KEY"

if [[ "${1:-}" == "--url-only" ]]; then
  printf 'artifact_url = "%s"\n' "$URL" > "$TF/artifact.auto.tfvars"
  echo "wrote $TF/artifact.auto.tfvars"
  exit 0
fi

INSTANCE="$(terraform -chdir="$TF" output -raw instance_id)"
CMD_ID="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --comment "bitsburg deploy $KEY" --timeout-seconds 1800 \
  --parameters "commands=[\"/usr/local/bin/bitsburg-deploy '$URL' 2>&1 | tail -20\"]" \
  --query Command.CommandId --output text)"
echo "ssm command $CMD_ID sent to $INSTANCE, waiting..."
aws ssm wait command-executed --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" || true
aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query '{status:Status,out:StandardOutputContent,err:StandardErrorContent}' --output json
