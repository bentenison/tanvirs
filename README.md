# Tanvir Shaikh · Portfolio

A personal portfolio served by a single Go binary. The Vue 3 frontend is prerendered at build time, precompressed, and embedded with `go:embed`. After compiling, nothing else is needed at runtime: no Node.js, no database, no CDN.

- **Backend:** Go 1.26, Gin, `log/slog`, graceful shutdown, security headers, request IDs, optional SMTP contact form.
- **Frontend:** Vue 3 (Options API), Vite, TypeScript, Tailwind CSS v4, Reka UI primitives, a small custom spring engine, raw WebGL2 for the hero organism (with Canvas2D and SVG fallbacks).
- **Docs:** [DESIGN.md](DESIGN.md) (creative direction), [PERFORMANCE.md](PERFORMANCE.md) (measured results), [LICENSES.md](LICENSES.md) (dependencies and fonts).

## Layout

```
main.go                 entry point (config, server, graceful shutdown)
internal/config         environment configuration
internal/server         Gin engine and http.Server
internal/middleware     request ID, logging, recovery, security headers, body limit
internal/handlers       static/SPA serving, health, contact API
internal/contact        validation, rate limiting, SMTP mailer
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
| `SMTP_HOST`, `SMTP_PORT` | `587` | Contact form delivery |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | | PLAIN auth, used only if a username is set; never logged |
| `SMTP_FROM`, `CONTACT_TO` | | Sender and recipient. Both required, together with `SMTP_HOST`, to enable the form |
| `SMTP_TLS` | `starttls` | `starttls`, `tls` (implicit, port 465) or `none` |

If SMTP is not configured, the contact section shows the email address instead of a form. The form never shows success unless the server confirms delivery. A Gmail account works with an app password: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_TLS=starttls`.

Endpoints: `GET /healthz`, `GET /readyz` (returns 503 while shutting down), `GET /api/contact` (returns whether the form is enabled), `POST /api/contact`.

## Deploying

### alwaysdata

1. Build `bin/portfolio-linux-amd64` and upload it to your account (for example to `~/portfolio/`), then run `chmod +x`.
2. In the admin panel, add a **Site** of type **User program** with the command `~/portfolio/portfolio-linux-amd64`. alwaysdata provides `IP` and `PORT`, which the server picks up automatically.
3. Add environment variables in the site settings (`PORTFOLIO_HSTS=true` once HTTPS is forced, plus SMTP values if you want the form).
4. Enable "Force HTTPS" on the site. alwaysdata terminates TLS and proxies to the program.

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
