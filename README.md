# Tanvir Shaikh · Portfolio

A personal portfolio served by a single Go binary. The Vue 3 frontend is prerendered at build time, precompressed, and embedded with `go:embed`. After compiling, nothing else is needed at runtime: no Node.js, no database, no CDN.

- **Backend:** Go 1.26, Gin, `log/slog`, PostgreSQL (pgx), graceful shutdown, security headers, request IDs, a contact inbox with an admin page.
- **Frontend:** Vue 3 (Options API), Vite, TypeScript, Tailwind CSS v4, Reka UI primitives, a small custom spring engine, raw WebGL2 for the hero organism (with Canvas2D and SVG fallbacks).
- **Docs:** [DESIGN.md](DESIGN.md) (creative direction), [PERFORMANCE.md](PERFORMANCE.md) (measured results), [LICENSES.md](LICENSES.md) (dependencies and fonts).

## Layout

```
main.go                 entry point (config, server, graceful shutdown)
internal/config         environment configuration
internal/server         Gin engine and http.Server
internal/middleware     request ID, logging, recovery, security headers, body limit
internal/handlers       static/SPA serving, health, contact API
internal/contact        validation and rate limiting
internal/store          PostgreSQL: contact messages, admin login and sessions, migrations
internal/admin          server-rendered /admin pages
internal/web            go:embed of the built frontend (internal/web/dist)
frontend/               Vue app
  src/config/           all content: profile, projects, technologies, navigation, site
  src/engine/           framework-independent physics, rendering, simulations
  src/components/       UI, navigation, organism, surfaces, projects, playground, sections
  scripts/              prerender, compress, screenshots, measure
  tests/unit, tests/e2e Vitest and Playwright
scripts/                build.ps1, build.sh, race-env.ps1
```

## Requirements

- Go 1.26+
- Node.js 22.12+ and npm (build time only)
- Optional: a C toolchain for `go test -race` (see below)

## Local development

Frontend with hot reload (proxies `/api` and health checks to the Go server):

```sh
cd frontend
npm ci
npm run dev            # http://localhost:5173
```

Backend (in another terminal, from the repo root):

```sh
go run .               # http://localhost:8080
```

Until the frontend has been built and copied into `internal/web/dist`, the Go server answers page routes with a 503 "frontend not built" message. `/healthz` and the API still work. Use `PORTFOLIO_DEV_BACKEND=http://host:port` to point the Vite proxy somewhere else.

## Production build

Windows PowerShell:

```powershell
./scripts/build.ps1                                   # windows/amd64, linux/amd64, linux/arm64
./scripts/build.ps1 -Targets linux/amd64 -SkipTests
./scripts/build.ps1 -Race                             # Go tests with the race detector
./scripts/build.ps1 -BaseUrl https://example.com      # canonical URLs, sitemap, OG tags
```

Linux / macOS:

```sh
./scripts/build.sh
TARGETS="linux/amd64" SKIP_TESTS=1 ./scripts/build.sh
RACE=1 BASE_URL=https://example.com ./scripts/build.sh
```

The script runs `npm ci`, type-checks, runs unit tests, builds, prerenders every route, and precompresses assets (Brotli and gzip). It then copies the result into `internal/web/dist`, runs `go vet` and `go test`, and cross-compiles static binaries (`CGO_ENABLED=0`) into `bin/`.

### Race detector on Windows

Go's race runtime needs `libsynchronization.a`, which older MinGW builds (for example TDM-GCC 5.x) do not ship. `scripts/race-env.ps1` generates it with the toolchain's own `dlltool` and sets `CGO_LDFLAGS`. `build.ps1 -Race` uses it automatically. To use it manually:

```powershell
. ./scripts/race-env.ps1
go test -race ./...
```

## Running

```sh
./bin/portfolio-linux-amd64
```

| Variable | Default | Purpose |
|---|---|---|
| `PORTFOLIO_ADDR` | `:8080` | Listen address. Falls back to `IP` and `PORT` (alwaysdata convention) |
| `PORTFOLIO_BASE_URL` | `https://tanvirs.alwaysdata.net` | Public URL (validated) |
| `PORTFOLIO_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `PORTFOLIO_LOG_FORMAT` | `json` | `json` or `text` |
| `PORTFOLIO_TRUSTED_PROXIES` | `127.0.0.1,::1` | IPs/CIDRs allowed to set `X-Forwarded-For`; `none` to trust nobody |
| `PORTFOLIO_HSTS` | `false` | Send HSTS and `upgrade-insecure-requests`. Enable only when the site is HTTPS-only |
| `PORTFOLIO_HERO` | `organism` | Landing-page centrepiece: `organism` or `request` (the visitor's own request traced through the stack). Switch and restart; no rebuild needed |
| `PORTFOLIO_ASK` | `true` | Show the "Ask my portfolio" section |
| `DATABASE_URL` | | PostgreSQL connection string. Enables the contact form and `/admin`; never logged |
| `ADMIN_USERNAME` | `admin` | Login for `/admin` |
| `ADMIN_PASSWORD` | | Admin password (12+ characters), seeded at startup as a bcrypt hash; changing it signs out all sessions |
| `ADMIN_SESSION_HOURS` | `12` | Admin session lifetime |

Contact form submissions are stored in PostgreSQL and managed at `/admin`, which provides an inbox, statuses, notes, reply-by-email links and CSV export. Without `DATABASE_URL` the site still works; the form shows a GitHub link instead. Tables are created by embedded migrations on startup.

Endpoints: `GET /healthz`, `GET /readyz` (returns 503 while shutting down), `GET /api/contact` (returns whether the form is enabled), `POST /api/contact`, and the server-rendered `/admin` pages.

## Deploying

### alwaysdata

Everything for `tanvirs.alwaysdata.net` is scripted in [deploy/alwaysdata/](deploy/alwaysdata/README.md): site setup, one-command deploys with rollback, and the PostgreSQL database behind the contact inbox.

```sh
bash deploy/alwaysdata/setup-site.sh    # once
bash deploy/alwaysdata/deploy.sh        # every release
```

### Behind a reverse proxy (nginx / Caddy)

Run the binary on a local port and proxy to it. Caddy handles HTTPS certificates automatically:

```
example.com {
    reverse_proxy 127.0.0.1:8080
}
```

nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Keep the proxy's own compression off for these routes. The server already serves precompressed Brotli and gzip with correct `Vary` headers. A minimal systemd unit:

```ini
[Service]
ExecStart=/opt/portfolio/portfolio-linux-amd64
Environment=PORTFOLIO_ADDR=127.0.0.1:8080 PORTFOLIO_HSTS=true
Restart=on-failure
DynamicUser=yes
```

`SIGTERM` triggers a graceful shutdown: readiness goes to 503, in-flight requests get up to 15 seconds, then the process exits.

## Updating content

All content lives in `frontend/src/config/`. Components never hard-code it.

- `profile.ts`: name, headline, biography, principles, links (email, GitHub, LinkedIn, resume), availability.
- `projects.ts`: products. Add an entry to add a project. `presentation: 'feature'` creates a case-study page at `/work/<slug>`; `'compact'` shows it in the home-page spread. Each project points at a `surface` demo in `components/surfaces/registry.ts`.
- `technologies.ts`: the organism's domains and the technologies inside each.
- `site.ts`: SEO defaults and published articles. The writing section stays hidden while the list is empty.

Empty links are hidden, never rendered broken:

- To show LinkedIn, set `links.linkedin`.
- To offer a resume, put a PDF in `frontend/public/` and set `links.resume: '/resume.pdf'`.
- To show availability, set `availability` to `{ mode: 'open' }`, `{ mode: 'freelance' }` or `{ mode: 'custom', text: '…' }`.

The build validates the configuration and fails on bad entries.

## Tests

```sh
cd frontend
npm run typecheck
npm test                 # Vitest: physics, config, preferences, contact, simulations, organism, components
npm run test:e2e         # Playwright against the real Go binary (desktop and mobile projects)
node scripts/screenshots.mjs http://127.0.0.1:18080   # review screenshots, both themes
node scripts/measure.mjs http://127.0.0.1:18080       # lab performance numbers

cd ..
go vet ./... && go test ./...
TEST_DATABASE_URL="postgres://user:pass@localhost:5432/portfolio_test?sslmode=disable" go test ./internal/store   # PostgreSQL tests
```

`npm run test:e2e` starts `go run .` on port 18080 if nothing is already listening there, so build the frontend into `internal/web/dist` first (the build script does this). Install the browser once with `npx playwright install chromium`.

## Docker (optional)

Not required. If you want an image anyway, the static binary runs on `scratch`:

```dockerfile
FROM scratch
COPY bin/portfolio-linux-amd64 /portfolio
ENV PORTFOLIO_ADDR=:8080
EXPOSE 8080
ENTRYPOINT ["/portfolio"]
```
