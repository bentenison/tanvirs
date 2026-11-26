#!/usr/bin/env bash
# Deploys the portfolio to alwaysdata.
#
#   ./deploy/alwaysdata/deploy.sh                 build linux/amd64, upload, switch, restart, verify
#   SKIP_BUILD=1 ./deploy/alwaysdata/deploy.sh    upload the existing bin/portfolio-linux-amd64
#   ./deploy/alwaysdata/deploy.sh rollback        switch back to the previous release
#   ./deploy/alwaysdata/deploy.sh env             only push the server settings (.env) and restart
#
# Runs from Git Bash on Windows, or any Linux/macOS shell.
# Server layout:
#   ~/portfolio/run.sh                 site command (loads .env, execs current)
#   ~/portfolio/.env                   server settings, mode 600
#   ~/portfolio/releases/<version>     uploaded binaries (last 5 kept)
#   ~/portfolio/current -> releases/<version>
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env

SERVER_KEYS=(
  PORTFOLIO_BASE_URL PORTFOLIO_LOG_FORMAT PORTFOLIO_LOG_LEVEL PORTFOLIO_HSTS PORTFOLIO_TRUSTED_PROXIES
  PORTFOLIO_HERO PORTFOLIO_ASK
  DATABASE_URL ADMIN_USERNAME ADMIN_PASSWORD ADMIN_SESSION_HOURS
)

push_env() {
  step "Writing server settings to $REMOTE_DIR/.env"
  local tmp key
  tmp="$(mktemp)"
  {
    echo "# Written by deploy.sh. Edit alwaysdata.env locally and re-run 'deploy.sh env'."
    for key in "${SERVER_KEYS[@]}"; do
      if [[ -n "${!key:-}" ]]; then printf '%s=%s\n' "$key" "$(shq "${!key}")"; fi
    done
  } >"$tmp"
  ssh_run "mkdir -p '$REMOTE_DIR/releases' && umask 077 && cat > '$REMOTE_DIR/.env' && chmod 600 '$REMOTE_DIR/.env'" <"$tmp"
  rm -f "$tmp"
}

verify() {
  local url="https://$SITE_ADDRESS" i
  step "Verifying $url"
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null "$url/readyz"; then
      echo "ready: $(curl -fsS "$url/healthz")"
      curl -fsS -o /dev/null -w "home page: HTTP %{http_code}, %{size_download} bytes\n" "$url/"
      echo "contact form enabled: $(curl -fsS "$url/api/contact")"
      return 0
    fi
    sleep 2
  done
  die "site did not become ready; check ~/admin/logs/sites/ on the server (ssh $ALWAYSDATA_SSH_USER@$SSH_HOST)"
}

case "${1:-deploy}" in
rollback)
  step "Rolling back to the previous release"
  ssh_run "cd '$REMOTE_DIR' && cur=\$(basename \"\$(readlink current)\") && prev=\$(ls -1 releases | sort | grep -vx \"\$cur\" | awk -v c=\"\$cur\" '\$0 < c' | tail -n 1) && [ -n \"\$prev\" ] && ln -sfn \"releases/\$prev\" current && echo \"now serving \$prev\""
  restart_site
  verify
  exit 0
  ;;
env)
  push_env
  restart_site
  verify
  exit 0
  ;;
deploy) ;;
*) die "unknown command: $1 (use deploy, rollback or env)" ;;
esac

BIN="$ROOT/bin/portfolio-linux-amd64"
if [[ -z "${SKIP_BUILD:-}" ]]; then
  step "Building linux/amd64 with the frontend embedded"
  (cd "$ROOT" && TARGETS="linux/amd64" BASE_URL="${PORTFOLIO_BASE_URL:-https://$SITE_ADDRESS}" ./scripts/build.sh)
fi
[[ -f "$BIN" ]] || die "missing $BIN"

VERSION="$(date +%Y%m%d-%H%M%S)"
REL="portfolio-$VERSION"

push_env

step "Uploading $REL"
scp_to "$HERE/run.sh" "$REMOTE_DIR/run.sh"
scp_to "$BIN" "$REMOTE_DIR/releases/$REL.part"

step "Switching current -> releases/$REL"
ssh_run "set -e
cd '$REMOTE_DIR'
sed -i 's/\r\$//' run.sh
chmod 755 run.sh
mv 'releases/$REL.part' 'releases/$REL'
chmod 755 'releases/$REL'
ln -sfn 'releases/$REL' current
ls -1 releases | grep -v '\.part\$' | sort | head -n -5 | while read -r old; do rm -f \"releases/\$old\"; done
echo \"releases kept: \$(ls -1 releases | wc -l)\""

step "Restarting the site"
restart_site
verify
echo
echo "Deployed $REL to https://$SITE_ADDRESS"
