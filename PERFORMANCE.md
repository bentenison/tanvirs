# Performance report

Measured on 2026-11-24 with `frontend/scripts/measure.mjs`. The test ran Playwright's Chromium headless shell against the production Go binary on localhost, on a Windows 11 desktop. These are lab numbers, not field data. Re-run them after changes:

```sh
node frontend/scripts/measure.mjs http://127.0.0.1:18080
```

## Results

| Scenario | LCP | CLS | Long tasks (longest) | JS transferred |
|---|---|---|---|---|
| Home, desktop 1440×900, unthrottled | 376 ms | 0.003 | 22 (565 ms) | 120 KB |
| Home, mobile 390×844, 4× CPU slowdown, 1.6 Mbps / 150 ms RTT | 2.53 s | 0.012 | 22 (493 ms) | 120 KB |
| Case study (/work/eduflow), same mobile throttling | 1.80 s | 0.0005 | 3 (433 ms) | 91 KB |

The other compressed transfers on the first load:

| Resource | Size |
|---|---|
| CSS | 15.6 KB |
| Fonts (4 files) | 93 KB |
| HTML (home) | 13 KB |

### Organism frame timing (desktop, 8 rapid drags)

- The capability check chose the **high** tier.
- Sustained slow frames moved it down to **light** (Canvas2D) during the test.
- After that, the median frame was **16.8 ms (about 60 fps)** and the p95 was 33 ms.

The step-down happens because headless Chromium renders WebGL in software (SwiftShader). On a machine with a GPU, the WebGL tiers are expected to hold. This adaptive behaviour is exactly what the frame monitor is for.

### Memory and cleanup

48 client-side navigations rotated through home, both case studies and the playground, with GC forced between samples:

| Point | JS heap |
|---|---|
| Start | 3.0 MB |
| After 16 navigations | 6.0 MB |
| After 32 navigations | 6.4 MB |
| After 48 navigations | 6.7 MB |

The heap stays flat rather than growing with each navigation. Unit and e2e tests also cover teardown. Every component releases its animation frames, observers, timers, listeners and WebGL program, buffers and context in `beforeUnmount`.

## Against the targets

| Target | Result |
|---|---|
| LCP ≤ 2.5 s | Met on desktop (0.38 s) and on the throttled case study (1.8 s). The throttled mobile home page is at the edge (2.53 s) |
| CLS ≤ 0.1 | Met everywhere (max 0.012) |
| Initial compressed JS < 200 KB (excluding deferred creative modules) | Met: about 120 KB, of which the Vue runtime is 43 KB. The WebGL organism (6 KB) and the below-the-fold sections load on demand |
| About 60 fps on capable devices | Met after adaptive quality settled (software GL). Not yet measured on a real mobile GPU |
| Lighthouse scores | **Not measured**: Lighthouse is not installed in this environment. Run `npx lighthouse http://127.0.0.1:18080 --view` to get them |
| INP ≤ 200 ms | **Not measured** in the lab. The longest main-thread task after load is under 600 ms unthrottled, during initial hydration |

## Changes made because of these measurements

1. **Single stylesheet** (`cssCodeSplit: false`). The case-study page had a CLS of **0.36**, because its route CSS was only fetched after JavaScript ran. One small stylesheet in the prerendered HTML brought it to **0.0005**.
2. **Lazy hydration of below-the-fold sections** (`hydrateOnVisible`). Their HTML is still prerendered, but their JavaScript downloads and hydrates when they approach the viewport. The longest task on throttled mobile dropped from **945 ms to 493 ms**, and long tasks from 57 to 22.

## Remaining trade-offs and next steps

- **Mobile LCP is about 2.5 s under heavy throttling.** The LCP element is the hero headline, so the main costs are the preloaded display font (21 KB) and hydration competing for the CPU. Options: inline a tiny critical subset of Instrument Serif, or preload only the italic face that "working" uses.
- **Hydration of the hero stage** is still the largest task. The organism itself is already deferred. Splitting the domain panel and Reka UI popover out of the entry chunk would trim it further.
- **Field data.** Consider adding the free `web-vitals` library and logging the results to the Go server's structured logs, to replace lab estimates with real visitors' numbers.
