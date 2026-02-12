#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://127.0.0.1}"
TOKEN="${RESOLVER_REGISTER_TOKEN:-dev-resolver-token}"
CODE="smoke$(date +%s)"

curl -4 -kfsS -X POST "$BASE_URL/api/resolver/register" \
  -H 'content-type: application/json' \
  -H "x-resolver-token: $TOKEN" \
  --data "{\"code\":\"$CODE\",\"targetUrl\":\"$BASE_URL\",\"expiresAt\":null}" >/dev/null

RESP="$(curl -4 -kfsS "$BASE_URL/api/resolver/resolve/$CODE")"
echo "$RESP" | rg -q '"redirectTo"' || {
  echo "resolver smoke failed"
  exit 1
}

echo "resolver smoke ok: $CODE"
