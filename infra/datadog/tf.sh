#!/usr/bin/env bash
# terraform wrapper for infra/datadog: exports DD_API_KEY / DD_APP_KEY / DD_SITE from ../../.env without printing them.
#   infra/datadog/tf.sh plan
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
set -a
# shellcheck disable=SC1091
source "$DIR/../../.env"
set +a
export TF_VAR_dd_site="${DD_SITE:-datadoghq.com}"
exec terraform -chdir="$DIR" "$@"
