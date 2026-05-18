# 01 — System design

Six patterns that describe the shape of reincodes as a system: how it builds, how it ships, how it runs in the browser, and where state lives. Each file stands alone; the order below is the recommended read sequence.

## Files in this section

1. [01-static-export-architecture.md](./01-static-export-architecture.md) — `output: "export"` flips Next.js from "ship a server" to "ship files"; the basePath/assetPrefix toggle adapts to GitHub Pages.
2. [02-page-per-route-app-router.md](./02-page-per-route-app-router.md) — every URL is a `page.tsx` at the matching folder under `src/app/`; the file system *is* the router.
3. [03-client-component-boundary.md](./03-client-component-boundary.md) — `"use client"` at the top of every visualizer page opts out of React Server Components so hooks and event handlers work.
4. [04-state-driven-animation-with-delayloop.md](./04-state-driven-animation-with-delayloop.md) — the animation contract: `setState → await delayLoop(speed) → setState`, with the renderer always a function of state.
5. [05-data-and-renderer-separation.md](./05-data-and-renderer-separation.md) — `conceptsData.tsx` is the typed catalog; `Concepts.tsx` is one `.map()` rendering it.
6. [06-page-local-state-ownership.md](./06-page-local-state-ownership.md) — every visualizer page owns its own `useState`; no context, no global store, no shared state across pages.

---

## System map

```
┌─ Build time (developer machine + GitHub Actions runner) ──────────────────────┐
│                                                                               │
│   src/app/**/page.tsx   ──▶   Next.js App Router  ──▶  `next build`           │
│   src/components/**     ──▶   "use client" leaves                             │
│   src/utils/**          ──▶   data structures + delayLoop                     │
│                                       │                                       │
│                                       ▼                                       │
│                          output: "export"  (next.config.ts)                   │
│                                       │                                       │
│                                       ▼                                       │
│                          out/  (static HTML + JS bundles)                     │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼   gh-pages branch
┌─ Hosting (GitHub Pages, basePath: /reincodes) ────────────────────────────────┐
│                                                                               │
│         CDN-served static files; no server, no API, no DB                     │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼   HTTPS GET
┌─ Browser (the only runtime in production) ────────────────────────────────────┐
│                                                                               │
│   React 19 hydrates the page                                                  │
│       │                                                                       │
│       ▼                                                                       │
│   Page-local useState owns: bars, scan index, speed, input size, obstacles    │
│       │                                                                       │
│       ▼                                                                       │
│   user clicks "run"                                                           │
│       │                                                                       │
│       ▼                                                                       │
│   async loop:   mutate state  ──▶  await delayLoop(speed)  ──▶  repeat        │
│       │                                                                       │
│       ▼                                                                       │
│   Visualizer component re-renders each frame (ArrayVisualizer / Grid /        │
│   BinaryVisualizer / NetworkDiagram / CallstackVisualizer / LinearData)       │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## The 6-step mental checklist

When designing or reading a system, walk these six checkpoints in order. The patterns in this section are mapped to the step(s) they live in.

1. **Data model** — what records exist, what their shape is, how they relate.
2. **Request / response flow** — how a user action becomes a server response (or, here, a re-render).
3. **Caching layers** — what's cached where, what invalidates, what stays warm.
4. **State ownership** — who owns each piece of state, who can mutate it, who can read it.
5. **Failure handling** — what breaks first, what catches the break, what the user sees when it does.
6. **Scale concerns** — what changes at 10×, 100×, 1000× current load.

### How each pattern maps

- **01 Static export architecture** → step 1 (Data model: none persisted; everything in the bundle) + step 2 (Request flow: CDN serves pre-built files, no compute on the response path).
- **02 Page-per-route App Router** → step 2 (Request flow: URL-to-component mapping is the first hop of every page request).
- **03 Client component boundary** → step 2 (Request flow: every page hands off to the browser after initial HTML lands) + step 4 (State ownership: only client components can own React state).
- **04 State-driven animation with delayLoop** → step 2 (Request flow inside the browser: the per-frame loop) + step 4 (State ownership: animation state drives the renderer).
- **05 Data and renderer separation** → step 1 (Data model: `CONCEPT_CATEGORIES` is the static catalog, the closest thing to a database table in this codebase).
- **06 Page-local state ownership** → step 4 (State ownership: every page owns its `useState`; no cross-page sharing).

### Steps with no pattern in this codebase

- **Step 3 (Caching layers)** — the CDN handles caching at the edge; the codebase makes no caching decisions of its own. Browser caching is governed by GitHub Pages' default `Cache-Control` headers, not by code.
- **Step 5 (Failure handling)** — there are no runtime failure modes to handle. No server can error, no DB can be unreachable, no rate limit can trip. The only failure path is "the build failed," which is caught in CI before deploy.
- **Step 6 (Scale concerns)** — the static-export contract is the scale story: CDN serves files; bandwidth is GitHub's problem. The codebase's scale ceiling is "visualizer routes that won't fit in `next build` time," and at current count (~17) it's not close.

The absence of patterns for steps 3, 5, and 6 is itself a design signal: this codebase made the system's shape simple enough that those steps don't need their own patterns. The day any of them does, a new pattern file enters this section.
