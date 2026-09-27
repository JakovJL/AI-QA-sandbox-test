#!/usr/bin/env bash
# Ручной доступ к API цели через обход DNS-блокировки.
#   scripts/api.sh GET /store/products?limit=2
#   scripts/api.sh GET /store/products?limit=2 -D -     (доп. аргументы уходят в curl)
#   scripts/api.sh POST /store/carts -H 'Content-Type: application/json' -d '{"region_id":"reg_..."}'
#   scripts/api.sh --admin GET /products?limit=1        (Admin API с Bearer-токеном)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT/config/targets.sh"

if [ "${1:-}" = "--admin" ]; then
  shift
  ADMIN_TOKEN="$(admin_token)"
  METHOD="$1"; shift
  echo "--- admin $METHOD /admin$1 ---"
  admin "$METHOD" "$1" "${@:2}" -w '\n[HTTP %{http_code}]\n'
else
  METHOD="$1"; shift
  echo "--- $METHOD https://$TARGET_HOST$1 (IP $IP) ---"
  api "$METHOD" "$1" "${@:2}" -w '\n[HTTP %{http_code}]\n'
fi
