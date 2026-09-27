#!/usr/bin/env bash
# Общий конфиг и функции доступа к цели.
# Ключевая особенность этого окружения: домен *.fly.dev блокируется DNS-фильтром провайдера,
# поэтому все запросы идут с явной привязкой домена к реальному IP (--resolve).
# Подробности и доказательства: docs/00-environment.md
# shellcheck disable=SC2034

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

: "${TARGET_HOST:?TARGET_HOST не задан (.env)}"
: "${PUBLISHABLE_KEY:?PUBLISHABLE_KEY не задан (.env)}"
: "${ADMIN_EMAIL:=admin@sandbox.local}"
: "${ADMIN_PASSWORD:=supersecret}"
: "${STORE_URL:=https://$TARGET_HOST/}"
: "${ADMIN_URL:=https://$TARGET_HOST/app}"
: "${HTTP_TIMEOUT:=30}"

CACHE_DIR="$ROOT/.cache"
mkdir -p "$CACHE_DIR"

# --- Определение реального IP -------------------------------------------------
# Обход блокировки: спрашиваем A-запись у публичного DoH-резолвера (он не блокируется),
# результат кэшируем, чтобы не дёргать сеть на каждый запрос.
doH_ip() {
  curl -sS -m 10 -H 'accept: application/dns-json' \
    "https://cloudflare-dns.com/dns-query?name=$TARGET_HOST&type=A" 2>/dev/null |
    python -c 'import sys,json
try:
    d=json.load(sys.stdin)
    print([a["data"] for a in d.get("Answer",[]) if a.get("type")==1][0])
except Exception:
    pass'
}

resolve_ip() {
  if [ -n "${TARGET_IP:-}" ]; then echo "$TARGET_IP"; return; fi
  local cached="$CACHE_DIR/target-ip"
  if [ -s "$cached" ]; then cat "$cached"; return; fi
  local ip; ip="$(doH_ip)"
  if [ -z "$ip" ]; then
    echo "ОШИБКА: не удалось определить IP для $TARGET_HOST через DoH" >&2
    return 1
  fi
  echo "$ip" > "$cached"
  echo "$ip"
}

IP="$(resolve_ip || true)"
CURL_BASE=(curl -sS -m "$HTTP_TIMEOUT" --resolve "$TARGET_HOST:443:$IP")
AUTH_HEADER="x-publishable-api-key: $PUBLISHABLE_KEY"

# --- HTTP-хелперы -------------------------------------------------------------
# api METHOD PATH [доп. аргументы curl...]  -> тело ответа в stdout
api() {
  local method="$1" path="$2"; shift 2
  "${CURL_BASE[@]}" -X "$method" -H "$AUTH_HEADER" "$@" "https://$TARGET_HOST$path"
}

# api_code METHOD PATH [доп. аргументы curl...] -> только статус-код
api_code() {
  local method="$1" path="$2"; shift 2
  "${CURL_BASE[@]}" -o /dev/null -w '%{http_code}' -X "$method" -H "$AUTH_HEADER" "$@" "https://$TARGET_HOST$path"
}

# api_headers METHOD PATH -> заголовки ответа
api_headers() {
  local method="$1" path="$2"; shift 2
  "${CURL_BASE[@]}" -D - -o /dev/null -X "$method" -H "$AUTH_HEADER" "$@" "https://$TARGET_HOST$path"
}

# json <выражение на python> — читает JSON из stdin, печатает результат выражения над d
json() { python -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

# admin_token — JWT администратора через /auth/user/emailpass
admin_token() {
  "${CURL_BASE[@]}" -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    "https://$TARGET_HOST/auth/user/emailpass" | json "d['token']"
}

# admin METHOD PATH [доп. аргументы curl...] -> запрос в Admin API с Bearer-токеном
admin() {
  local method="$1" path="$2"; shift 2
  "${CURL_BASE[@]}" -X "$method" -H "authorization: Bearer $ADMIN_TOKEN" "$@" "https://$TARGET_HOST/admin$path"
}
