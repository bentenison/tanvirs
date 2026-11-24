# DESIGN.md: Creative direction

Portfolio of **Tanvir Shaikh**, a backend-focused full-stack developer working in Go and Vue.
Status: **draft for review**. Nothing is built yet, so everything below can still change.

---

## 0. Inputs and constraints

| Decision | Value |
|---|---|
| Projects | EduFlow, Forge, FlowQ, Kreovio (all **Released**, all Go + Vue + PostgreSQL, live links only, repos are private) |
| Full case studies | **EduFlow** and **Kreovio** each get a dedicated page and an interactive product surface |
| Compact launches | **Forge** and **FlowQ** get one interactive surface each on the home page, no dedicated page |
| Excluded | The employer and its products, all work-history figures, EduFlow's marketing figures and "Trusted by" list, the load tester, the video generator |
| Contact | Email and GitHub. LinkedIn and resume have config slots and stay hidden while empty |
| Availability | Config enum: `none`, `open`, `freelance`, `custom` (default `none`) |
| Base URL | `https://tanvirs.alwaysdata.net` (overridable with an environment variable) |
| Contact form | Optional SMTP. When SMTP isn't configured, a real `mailto:` link is shown |
| Themes | Light and dark, each designed separately |
| Writing section | Hidden until real article links appear in the config |

---

## 1. Visual identity: "Living Runtime"

The core idea is that **good software behaves like an organism**. It has a core, a membrane, metabolism, load, recovery and reflexes. The site has two layers:

- **Editorial print:** large serif headlines, wide margins, asymmetric columns, small monospaced captions in the margins. It reads like a well-set technical journal.
- **Live specimen:** one soft-bodied organism that breathes, stretches, recovers, and responds to touch and to load.

The tension between the still print layer and the living layer *is* the identity. Whatever moves has a reason to move, and everything else stays still.

What it explicitly avoids: terminal aesthetics, neon on black, glass cards, bento grids, logo walls, percentage bars, particle confetti, and purple gradients.

## 2. Central creative metaphor: the hero organism

I explored three interpretations before choosing one:

| # | Concept | Description | Verdict |
|---|---|---|---|
| A | **Mycelium** | Tendrils grow outward from a core and tips bloom into technologies | Rejected. At rest it reads as a node graph or tech tree, and the growth animations become a loading spinner |
| B | **Orbital cell** | A nucleus with organelles drifting around it | Rejected. Too close to a solar system diagram, and orbits are mechanical rather than organic |
| C | **Soft-body membrane with lobes** | One continuous gooey body. A dense **Go core** fused with eight domain **lobes** through necks of membrane that thin when pulled | **Chosen** |

**How concept C works**

- The body is a **2D metaball field**: core plus lobes, rendered as one signed-distance surface, so the lobes *fuse* into the core rather than hang from lines. There are no edges and no lines, so it can never read as a graph.
- The eight lobes are Frontend, Backend, Data, Infrastructure, Distributed/Messaging, AI and RAG, Performance, and Dev Tooling. Each is a spring-anchored point mass.
- **Dragging a lobe** stretches its neck. The neck gets thinner as tension rises and its rim warms toward the tension colour (section 4). On release the lobe springs home with a small overshoot.
- **Focusing a lobe** (click, tap or keyboard) makes it swell, and its technologies appear inside it as small **organelles** labelled in mono. The info panel then shows the domain's role, practical capabilities, and related projects drawn from the config. Years of experience per technology are never shown.
- **The Go core** has a slow heartbeat: a breathing scale of roughly 1.5%, with a 4.2 s period.
- **Velocity** affects the shape: fast pointer motion squashes and stretches lobes along the direction of travel, with a clamp so the organism stays coherent.
- **Scroll** changes the organism's state. In the hero it is complete. As the visitor scrolls into Selected Work it **contracts and migrates** to become the small live "pulse" in the navigation. That pulse later reacts to load in the playground: it beats faster when the simulated queue backs up.

## 3. Typography

All three faces are self-hosted, subset WOFF2 files under the SIL Open Font License (OFL).

| Role | Face | Use |
|---|---|---|
| Display | **Instrument Serif** (regular and italic) | Hero lines, section titles, project names. Italic marks the *living* words ("working", "products") |
| Text and UI | **Geist** (variable) | Body copy, navigation, buttons, mockup interfaces |
| Technical | **Geist Mono** | Margin captions, labels, data, code, state readouts |

- Fluid scale using `clamp()`, ratio about 1.25 on mobile and 1.333 on desktop. The hero display size runs from 3.25 rem to 9.5 rem.
- Body text is 17 to 19 px with a line height of 1.6. Reading width is capped at 66 characters.
- Display headings use tight tracking (−0.02em). Mono captions are uppercase at +0.06em with tabular figures.
- Margin captions follow a fixed system: `§03 / SELECTED WORK`, `fig. 2: attendance, synthetic data`. This gives the site its journal feel.

**Hero copy (draft):**
> Engineering ideas into *working* products.
>
> Backend-focused full-stack developer. Five-plus years building efficient Go services, interactive Vue applications and intelligent developer tools.

Calls to action: **See the work**, **About me**, **Get in touch**.

## 4. Colour system

Both themes are tuned separately rather than inverted. All tokens are semantic CSS custom properties.

| Token | Light ("Paper") | Dark ("Graphite") |
|---|---|---|
| `--bg` | `#F2EFE7` warm paper | `#121311` warm graphite |
| `--surface` | `#FAF8F3` | `#1A1C19` |
| `--surface-raised` | `#FFFFFF` | `#232622` |
| `--text` | `#17160F` | `#ECEAE2` |
| `--text-muted` | `#5D5A50` | `#A3A196` |
| `--border` | `#DAD5C8` | `#30332E` |
| `--accent` (chlorophyll) | `#3D6A00` for text, `#B8E62E` for fills | `#C4F03C` |
| `--tension` (coral) | `#D9482B` | `#FF7A5C` |
| `--focus` | 2 px `--text` ring plus 2 px offset in `--accent` fill colour | same |
| `--success` / `--error` | `#2F7D4A` / `#B3261E` | `#6FD08C` / `#FF8A80` |

- **Chlorophyll** is the computational accent: alive, organic, not cyan and not purple. It is used sparingly: the organism's core, active states and one word per section at most.
- **Coral** appears only for *tension*: a stretched neck, a backed-up queue, a failed request, an exhausted pool. Meaning stays fixed: coral always means "under load".
- The organism is shaded in ink tones with a subtle rim light and a faint refraction offset. It is not a glowing neon blob.
- Every colour pair is to be checked for AA contrast. Accent text in light mode uses the dark variant.

## 5. Motion language

The motion language is **physical, brief and earned**. One engine drives everything.

- **Engine:** a single `requestAnimationFrame` ticker, fixed 1/120 s physics substeps with an accumulator, and semi-implicit Euler integration. That makes it frame-rate independent. Each spring has position, velocity, stiffness, damping and mass.
- **Presets** (stiffness / damping / mass):
  - `ui` 520 / 38 / 1: controls, settles in under 180 ms with no visible bounce
  - `premium` 170 / 26 / 1: reveals and layout shifts
  - `organic` 120 / 14 / 1: organism and tendrils
  - `heavy` 80 / 20 / 3: mockup windows and large surfaces
  - `playful` 300 / 10 / 1: used once or twice only, such as the magnetic contact button
- **Primitives:** spring, elastic drag with rubber-band past bounds, magnetic attraction, inertia (flick decay), velocity squash and stretch, staggered reveal, FLIP layout transitions, morphing indicator, scroll-progress sequences, enter and exit.
- **Rules:**
  - Text never deforms.
  - Controls never bounce for more than one cycle.
  - Nothing animates on the critical path to content.
  - Scrolling is native, never hijacked, and there is no smooth-scroll library.
- **Motion setting:** a three-way control (Full, Reduced, Minimal) persisted in `localStorage`. It defaults to the operating system's `prefers-reduced-motion` setting.
  - *Reduced:* the organism stays responsive but doesn't idle, there's no parallax, and reveals become short fades.
  - *Minimal:* a static organism illustration, no transitions, and mockups that update instantly.

## 6. Page composition

The home page follows the visitor journey. One long page with deep-linkable sections:

```
00  Opening    ~900 ms ink "drop" forms the organism. Text is visible from frame 0.
               Plays once per session and can be skipped (any key, scroll or click).
01  Hero       Left 5/12: headline and CTAs. Right 7/12 (bleeding off-edge): organism.
               Accessible domain list beneath, visually as margin index.
02  Ecosystem  Organism pinned briefly (CSS sticky, not scroll-jacked); 3 short
               "states": core → domains → how they connect in a real product.
03  Work       EduFlow: full-bleed launch composition + live surface → /work/eduflow
               Kreovio: mirrored composition + live surface         → /work/kreovio
               Forge & FlowQ: editorial two-up spread, one live surface each,
                              link out to live site.
04  Capability Six capability "specimens" (backend, frontend, data, infra,
               performance, AI-assisted) each a small working demonstration,
               set as a staggered editorial column, not a grid of cards.
05  Playground Four simulations (see §7).
06  About      Short narrative, journal-style two-column with margin notes.
07  Contact    Closing "specimen": organism returns full-size; magnetic email CTA,
               GitHub, optional form, availability line when configured.
```

**Product surfaces.** All are real lightweight Vue interfaces, labelled *"Simulated demo · synthetic data"*, and they pause when offscreen.

- **EduFlow:** mark attendance for a batch by tapping students. The batch attendance chart and the defaulter list update live. A fee receipt is generated with a gapless number. Includes a filter-driven analytics chart.
- **Kreovio:** a slide deck becomes a live session. Learners "join" with a six-character code, poll results stream in, and the visitor can draw ink on the shared whiteboard.
- **Forge:** add a field to an entity, see the schema migration preview, and watch the generated form morph into place.
- **FlowQ:** a token board calls A-046 to Counter 3. The visitor can transfer or hold tickets and watch the waiting time shift.

Mockups use restrained perspective (maximum tilt of 6°), layered windows, and *component assembly* on first reveal: parts fly in on `heavy` springs. They stay fully legible at all times.

## 7. Interaction model

- **Organism:** pointer and touch drag, keyboard focus (Tab or arrow keys between lobes, Enter to open), and a mirrored **accessible domain list** that drives the same state. Canvas is never the only way to reach information.
- **Playground** (deterministic simulations, all labelled as simulations):
  1. **Goroutine worker pool:** a slider for 1 to 32 workers and a job burst button. Shows queue depth, distribution and completion.
  2. **Connection pool:** concurrency against pool capacity. When the pool is exhausted, requests visibly queue, and the queue turns coral.
  3. **Cache:** least-recently-used eviction plus time-to-live expiry, with hits, misses, expiry and eviction shown as discrete events.
  4. **RAG pipeline:** a short sample document is chunked, a question retrieves the top three chunks, and the answer cites them as context.
  - The API request lifecycle and event-driven workflow are omitted, because four is the limit.
- **Navigation:** a floating minimal bar holds the live **pulse** (the small organism) and a morphing pill indicator that slides between sections. On mobile the bar is a bottom-anchored compact bar that expands to a sheet.
- **Routes:** `/`, `/#work`, `/work/eduflow`, `/work/kreovio`, `/playground`, 404. Page transitions use the View Transitions API with a shared element: the project surface expands into the case-study hero. The fallback is a quick fade, and navigation is never blocked.
- **Magnetic buttons:** a small pull toward the pointer (maximum 6 px) and compression on press. Disabled on touch devices.

## 8. Mobile adaptations

- **Organism:** five merged lobes instead of eight on phones, at a lower simulation resolution. Dragging only starts after a deliberate press or a horizontal intent, so vertical scrolling always wins. Tap focuses a lobe and a bottom sheet shows its details.
- **Typography:** the hero becomes a stacked three-line composition with the organism *behind* the headline at reduced opacity, which is a different composition from desktop.
- **Product surfaces:** shown as mobile-app surfaces where that fits the product (FlowQ mobile ticket, Kreovio learner join), with no tilt and swipeable steps.
- **Playground:** one simulation at a time in a swipeable tab set, controls at the thumb zone, touch targets of at least 44 px.
- **Navigation:** bottom bar plus sheet, with the pulse acting as the menu button.
- Hover-only behaviour is replaced by tap, with no exceptions.

## 9. Technical decisions

| Area | Choice | Why |
|---|---|---|
| Framework | Vue 3 Options API, Vite, TypeScript in engine and config | Required by the brief |
| Styling | Tailwind CSS v4 mapped to CSS tokens | Tokens stay in `tokens.css`, Tailwind just consumes them |
| Primitives | **Reka UI** (MIT) for dialog, tabs, tooltip and sheet | Accessible behaviour without visual styling |
| Animation | **Custom spring engine plus Web Animations API**. **No GSAP, no Three.js** | One engine and no overlapping frameworks. GSAP's licence isn't OSI-permissive. Three.js would be over 150 KB for what one fragment shader does |
| Organism renderer | Raw **WebGL2** full-screen fragment shader (metaball field, up to 12 blobs as uniforms), lazy-loaded | A few KB, GPU-cheap, scales by resolution |
| Fallbacks | Canvas2D at low resolution, then a static inline SVG plus the accessible list | Quality tiers below |
| Routing | Vue Router, history mode, prerendered public routes at build time with Vite SSR | Real HTML for SEO and social sharing, and content is present without JavaScript |
| Backend | Go 1.26, Gin, `log/slog`, `embed` plus `fs.Sub`, graceful shutdown, request IDs, security headers, rate-limited contact endpoint, `net/smtp` | Brief §16 |
| Assets | Brotli and gzip precompressed at build time (Node's built-in `zlib`, no extra dependency) and served with negotiation, `Vary`, ETags and immutable caching for hashed files | |
| Tests | Vitest and Vue Test Utils, Playwright, Go `testing` with `-race` (if CGO and a C toolchain are available on Windows, otherwise noted) | |
| Build | `scripts/build.ps1` and `build.sh` producing windows/amd64, linux/amd64 and linux/arm64 with `CGO_ENABLED=0` | Fits alwaysdata, which runs the Linux binary behind its proxy |

**Quality tiers.** The starting tier comes from a cheap capability check: WebGL2 support, `deviceMemory`, `hardwareConcurrency`, coarse pointer, and the motion setting. Sustained frame time over 22 ms for about 2 s drops one tier, and there is no continuous benchmarking.

1. **High:** WebGL2, device pixel ratio up to 2, all lobes, refraction.
2. **Balanced:** device pixel ratio up to 1.5, no refraction.
3. **Light:** Canvas2D at about half resolution, five lobes.
4. **Static:** SVG illustration plus the accessible list.

## 10. Performance trade-offs

- **Budget:** under 200 KB of compressed JavaScript at initial load, excluding the lazy-loaded organism and playground modules. The target for the initial bundle is 90 KB or less: Vue, router, shell and config.
- **LCP** is the hero headline (text, not canvas), so the organism never gates it. The canvas reserves its own box, which keeps CLS near 0.
- Animation state lives outside Vue reactivity. Components get coarse events such as `focus:frontend`, never per-frame state.
- A single shared ticker sleeps when nothing is moving, when the tab is hidden, or when every subscriber is offscreen (checked with IntersectionObserver).
- **Prerendering** adds build complexity (an SSR entry, and code that touches the browser runs only in `mounted`) in exchange for real HTML, metadata and SEO. I'm accepting that cost.
- **Fonts:** three families, subset to Latin plus punctuation, with `font-display: swap` and size-adjusted fallbacks so the swap causes no layout shift. The display face is preloaded.
- **Measurement:** Lighthouse and Playwright traces for frame times, long tasks, and heap after repeated navigation. The results go in `PERFORMANCE.md` as measured, not estimated.

---

## Open points for review

1. Do you approve the **Living Runtime** metaphor (concept C) and the **chlorophyll and coral** palette?
2. Are you happy with **no GSAP and no Three.js**? It's permitted by the brief, and I think it's the stronger engineering story.
3. Can the hero copy draft in section 3 stay, or would you like different wording?
4. The playground has four simulations: worker pool, connection pool, cache and RAG. Swap any?

---

## Changes made during the build (2026-11-24)

- **Hero layout:** the headline stays inside its own column and never overlaps the organism, so it is readable in both themes. In dark mode the organism is a graphite body with a lit rim, not a pale body.
- **Organism proportions:** the core is smaller and the lobes sit further out on thinner necks, so it reads as one body with distinct lobes rather than a single flower shape.
- **Mobile:** all eight lobes are kept (not merged into five), scaled to the screen. The organism owns the upper half of the screen and the top bar is hidden in favour of the bottom navigation.
- **Frontend capability:** the spring-tuner demo was replaced by a UI-states demo (ready, loading, empty and error states, with radius and density tokens), which reflects Vue, Tailwind, shadcn-vue and UX design work.
- **Content:** no em dashes anywhere in the site copy. The site never presents itself as one of the projects. TypeScript and WebAssembly are not listed as skills.
- **Performance:** a single stylesheet (prevents layout shift on prerendered routes) and lazy hydration of below-the-fold sections. See PERFORMANCE.md.
