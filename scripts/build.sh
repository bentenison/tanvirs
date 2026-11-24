#!/usr/bin/env bash
# Builds the portfolio into standalone executables with the frontend embedded.
#
#   ./scripts/build.sh                       # all targets, with tests
#   TARGETS="linux/amd64" ./scripts/build.sh
#   SKIP_TESTS=1 ./scripts/build.sh
#   RACE=1 ./scripts/build.sh                # go test -race (needs cgo + a C toolchain)
#   BASE_URL=https://example.com ./scripts/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$ROOT/frontend"
EMBED="$ROOT/internal/web/dist"
BIN="$ROOT/bin"
TARGETS="${TARGETS:-windows/amd64 linux/amd64 linux/arm64}"
VERSION="${VERSION:-$(date +%Y.%m.%d-%H%M)}"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }

cd "$FRONTEND"
step "Installing frontend dependencies (npm ci)"
npm ci --no-audit --no-fund

step "Type-checking frontend"
npm run typecheck

if [[ -z "${SKIP_TESTS:-}" ]]; then
  step "Running frontend unit tests"
  npm test
fi

step "Building frontend (client, prerender, compress)"
VITE_BASE_URL="${BASE_URL:-}" npm run build

step "Copying frontend into internal/web/dist"
find "$EMBED" -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +
cp -R "$FRONTEND/dist/client/." "$EMBED/"
test -f "$EMBED/index.html" || { echo "index.html missing from embedded dist" >&2; exit 1; }

cd "$ROOT"
step "go vet"
go vet ./...

if [[ -z "${SKIP_TESTS:-}" ]]; then
  if [[ -n "${RACE:-}" ]]; then
    step "go test -race"
    CGO_ENABLED=1 go test -race -count=1 ./...
  else
    step "go test"
    go test -count=1 ./...
  fi
fi

mkdir -p "$BIN"
for t in $TARGETS; do
  os="${t%/*}"
  arch="${t#*/}"
  ext=""
  [[ "$os" == "windows" ]] && ext=".exe"
  out="$BIN/portfolio-$os-$arch$ext"
  step "go build $t -> $out"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "$out" .
done

step "Done"
ls -lh "$BIN"
