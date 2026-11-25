# Shared helpers for the alwaysdata scripts. Sourced, not executed.
# Requires: bash, curl, ssh/scp, and python3 (or python) for JSON.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/alwaysdata.env}"
API="https://api.alwaysdata.com/v1"

step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*" >&2; }
die() {
  printf '\033[31mxx %s\033[0m\n' "$*" >&2
  exit 1
}

load_env() {
  [[ -f "$ENV_FILE" ]] || die "missing $ENV_FILE (copy alwaysdata.env.example and fill it in)"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  : "${ALWAYSDATA_ACCOUNT:?ALWAYSDATA_ACCOUNT is required}"
  ALWAYSDATA_SSH_USER="${ALWAYSDATA_SSH_USER:-$ALWAYSDATA_ACCOUNT}"
  SITE_ADDRESS="${SITE_ADDRESS:-$ALWAYSDATA_ACCOUNT.alwaysdata.net}"
  SSH_HOST="ssh-$ALWAYSDATA_ACCOUNT.alwaysdata.net"
  REMOTE_HOME="/home/$ALWAYSDATA_ACCOUNT"
  REMOTE_DIR="$REMOTE_HOME/portfolio"
}

PY="$(command -v python3 || command -v python || true)"
py() {
  [[ -n "$PY" ]] || die "python3 is required for JSON handling"
  "$PY" -I -c "$@"
}

have_api() { [[ -n "${ALWAYSDATA_API_KEY:-}" ]]; }

# api METHOD PATH [JSON_BODY] -> prints the body; returns non-zero on HTTP >= 400.
api() {
  local method="$1" path="$2" body="${3:-}" out code
  have_api || die "ALWAYSDATA_API_KEY is not set in $ENV_FILE"
  out="$(mktemp)"
  if [[ -n "$body" ]]; then
    code="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" \
      --user "$ALWAYSDATA_API_KEY account=$ALWAYSDATA_ACCOUNT:" \
      -H 'Content-Type: application/json' --data "$body" "$API$path")"
  else
    code="$(curl -sS -o "$out" -w '%{http_code}' -X "$method" \
      --user "$ALWAYSDATA_API_KEY account=$ALWAYSDATA_ACCOUNT:" "$API$path")"
  fi
  cat "$out"
  rm -f "$out"
  if [[ "$code" -ge 400 ]]; then
    warn "alwaysdata API $method $path returned HTTP $code"
    return 1
  fi
}

ssh_run() { ssh -o BatchMode=no "$ALWAYSDATA_SSH_USER@$SSH_HOST" "$@"; }
scp_to() { scp -q "$1" "$ALWAYSDATA_SSH_USER@$SSH_HOST:$2"; }

# shq VALUE -> single-quoted for POSIX sh.
shq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

# Find the id of the site serving SITE_ADDRESS (empty if none).
find_site_id() {
  api GET /site/ | py '
import json, sys
addr = sys.argv[1]
for s in json.load(sys.stdin):
    addrs = s.get("addresses") or []
    if addr in addrs:
        print(s["id"]); break
' "$SITE_ADDRESS"
}

restart_site() {
  if ! have_api; then
    warn "No API key: restart the site from the panel (Web > Sites > Restart)."
    return 0
  fi
  local id
  id="$(find_site_id)" || return 1
  [[ -n "$id" ]] || die "no alwaysdata site serves $SITE_ADDRESS (run setup-site.sh)"
  api POST "/site/$id/restart/" >/dev/null && echo "restart requested for site $id"
}
