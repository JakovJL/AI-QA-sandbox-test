#!/usr/bin/env bash
# Показывает реальный IP цели, полученный в обход DNS-фильтра провайдера, и обновляет кэш.
# Использование: scripts/resolve-doh.sh [--refresh]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi
: "${TARGET_HOST:?TARGET_HOST не задан (.env)}"

mkdir -p "$ROOT/.cache"
CACHE="$ROOT/.cache/target-ip"
[ "${1:-}" = "--refresh" ] && rm -f "$CACHE"

if [ -s "$CACHE" ]; then
  echo "из кэша:  $(cat "$CACHE")"
else
  IP="$(curl -sS -m 10 -H 'accept: application/dns-json' \
    "https://cloudflare-dns.com/dns-query?name=$TARGET_HOST&type=A" |
    python -c 'import sys,json;d=json.load(sys.stdin);print([a["data"] for a in d.get("Answer",[]) if a.get("type")==1][0])')"
  echo "$IP" > "$CACHE"
  echo "через DoH: $IP"
fi

echo "--- что отдаёт DNS провайдера (для сравнения) ---"
nslookup "$TARGET_HOST" 2>&1 | tail -4
