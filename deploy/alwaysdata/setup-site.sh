#!/usr/bin/env bash
# One-time: points the alwaysdata site for SITE_ADDRESS at the Go binary.
# Configures a "User program" site with HTTPS forced. Safe to re-run.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
have_api || die "set ALWAYSDATA_API_KEY in $ENV_FILE (Profile > Tokens), or follow the manual steps in README.md"

COMMAND="$REMOTE_DIR/run.sh"
BODY="$(py '
import json, sys
print(json.dumps({
    "type": "user_program",
    "addresses": [sys.argv[1]],
    "command": sys.argv[2],
    "working_directory": "portfolio",
    "environment": "",
    "ssl_force": True,
}))' "$SITE_ADDRESS" "$COMMAND")"

step "Looking for the site that serves $SITE_ADDRESS"
ID="$(find_site_id || true)"
if [[ -n "$ID" ]]; then
  step "Updating site $ID to run $COMMAND"
  api PATCH "/site/$ID/" "$BODY" >/dev/null
else
  step "Creating a user-program site for $SITE_ADDRESS"
  api POST /site/ "$BODY" >/dev/null
  ID="$(find_site_id)"
fi
echo "site $ID: type=user_program, command=$COMMAND, HTTPS forced"
echo "Next: ./deploy/alwaysdata/deploy.sh"
