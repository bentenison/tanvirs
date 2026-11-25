#!/bin/sh
# Launcher used as the alwaysdata site "Command": /home/<account>/portfolio/run.sh
#
# alwaysdata starts this with IP and PORT in the environment and proxies the
# site to exactly that address, so the server must listen there. This script:
#   1. loads private settings (database URL, admin password) from .env,
#   2. makes sure nothing in .env can override alwaysdata's IP and PORT,
#   3. refuses to start without PORT, instead of silently using a default,
#   4. replaces itself with the current release.
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"

# Keep alwaysdata's values safe from whatever .env contains.
AD_IP="${IP:-}"
AD_PORT="${PORT:-}"

if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$DIR/.env"
  set +a
fi

if [ -z "$AD_PORT" ]; then
  echo "run.sh: PORT is not set; start this from the alwaysdata site (Command), which provides IP and PORT" >&2
  exit 1
fi

# The address comes only from alwaysdata.
unset PORTFOLIO_ADDR
IP="$AD_IP"
PORT="$AD_PORT"
export IP PORT

exec "$DIR/current"
