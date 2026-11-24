# Dependencies and assets

Every runtime dependency is permissively licensed. Nothing paid, no external services, and all assets are self-hosted.

## Fonts (self-hosted WOFF2, latin subset)

| Font | Package | License |
|---|---|---|
| Instrument Serif (regular, italic) | `@fontsource/instrument-serif` 5.3.0 | SIL Open Font License 1.1 |
| Geist (variable) | `@fontsource-variable/geist` 5.3.0 | SIL Open Font License 1.1 |
| Geist Mono (variable) | `@fontsource-variable/geist-mono` 5.3.0 | SIL Open Font License 1.1 |

The full license texts ship inside each package under `node_modules/@fontsource*/*/LICENSE`.

## Frontend runtime (bundled into the site)

| Package | Version | License |
|---|---|---|
| vue | 3.5.46 | MIT |
| vue-router | 4.6.5 | MIT |
| reka-ui | 2.11.0 | MIT |
| @floating-ui/vue, @floating-ui/dom (via reka-ui) | | MIT |
| @vueuse/core, @vueuse/shared (via reka-ui) | | MIT |
| @internationalized/date, @internationalized/number (via reka-ui) | | Apache-2.0 |
| aria-hidden, defu, ohash, @tanstack/vue-virtual (via reka-ui) | | MIT |

Build and test tools, which never reach the browser: vite, @vitejs/plugin-vue, tailwindcss and @tailwindcss/vite, vue-tsc, vitest, @vue/test-utils and jsdom (all MIT); typescript and @playwright/test (Apache-2.0).

## Go modules (linked into the binary)

| Module | License |
|---|---|
| github.com/gin-gonic/gin, gin-contrib/sse | MIT |
| github.com/go-playground/validator, locales, universal-translator | MIT |
| github.com/gabriel-vasile/mimetype | MIT |
| github.com/goccy/go-yaml, pelletier/go-toml, ugorji/go/codec | MIT |
| github.com/leodido/go-urn, mattn/go-isatty | MIT |
| github.com/quic-go/quic-go, quic-go/qpack | MIT |
| go.mongodb.org/mongo-driver/v2 (bson types used by Gin's binding) | Apache-2.0 |
| golang.org/x/crypto, net, sys, text | BSD-3-Clause |
| google.golang.org/protobuf | BSD-3-Clause |

These are Gin's own transitive dependencies. The application code uses only Gin and the Go standard library.

## Original assets

The organism, icons, favicon, app icons and social image were all drawn for this project, and are generated from code or SVG in this repository. No stock imagery or third-party icon sets are used.
