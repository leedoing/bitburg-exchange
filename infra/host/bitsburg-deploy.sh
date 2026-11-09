#!/bin/bash
# Runs on the EC2 host (installed to /usr/local/bin/bitsburg-deploy by user-data and by infra/deploy.sh).
# Usage: bitsburg-deploy <presigned tarball URL>
set -euo pipefail
URL="$1"
REGION="$(curl -s -H "X-aws-ec2-metadata-token: $(curl -s -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')" http://169.254.169.254/latest/meta-data/placement/region)"
mkdir -p /opt/bitsburg
cd /opt/bitsburg
curl -fsSL "$URL" -o /tmp/bitsburg.tgz
tar -xzf /tmp/bitsburg.tgz -C /opt/bitsburg
rm -f /tmp/bitsburg.tgz

# .env from SSM Parameter Store (values never printed)
umask 077
ssm_values() {
  # AmazonSSMManagedInstanceCore allows ssm:GetParameters but not GetParametersByPath.
  aws ssm get-parameters --region "$REGION" --with-decryption --output json --names "$@" \
    | jq -r '.Parameters[] | "\(.Name | sub("^/bitsburg-demo/"; ""))=\(.Value)"'
}
ssm_values /bitsburg-demo/DD_API_KEY /bitsburg-demo/DD_SITE /bitsburg-demo/DD_RUM_APP_ID \
           /bitsburg-demo/DD_RUM_CLIENT_TOKEN /bitsburg-demo/ADMIN_TOKEN > .env.tmp
[ "$(wc -l < .env.tmp)" -eq 5 ] || { echo "missing SSM parameters" >&2; exit 1; }
# Optional: Pulse dev server key (infra/pulse-key.sh). Without it Pulse is not started.
ssm_values /bitsburg-demo/PULSE_DD_APP_KEY >> .env.tmp
{
  cat .env.tmp
  echo "DD_HOSTNAME=bitsburg-demo"
  echo "APP_VERSION_STABLE=3.4.2"
  echo "APP_VERSION_NEW=3.5.0"
  echo "WEB_PORT=80"
} > .env
rm -f .env.tmp

docker compose up -d --build --remove-orphans
docker compose --profile traffic build traffic-gen
if grep -q '^PULSE_DD_APP_KEY=' .env; then
  docker compose --profile pulse up -d --build pulse
else
  echo "PULSE_DD_APP_KEY not in SSM, skipping Pulse"
fi

install -m 644 tools/traffic-gen/bitsburg-traffic.service /etc/systemd/system/bitsburg-traffic.service
systemctl daemon-reload
systemctl enable bitsburg-traffic.service
systemctl restart bitsburg-traffic.service
echo "bitsburg deploy done: $(date -u +%FT%TZ)"
