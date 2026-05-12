# reincodes — system overview

```
Build & deploy

┌─ Author machine ─────────────────────────────────────────────────────────────┐
│  pnpm/npm dev   →   Next.js dev server   →   localhost (basePath = "")       │
│  npm run build  →   next build           →   ./out/ (static HTML/JS/CSS)     │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼  push to main
┌─ GitHub Actions ─────────────────────────────────────────────────────────────┐
│  Build static export   →   Publish ./out/   →   gh-pages branch              │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─ GitHub Pages CDN ───────────────────────────────────────────────────────────┐
│  rlynjb.github.io/reincodes/  ←  static files only, basePath = "/reincodes"  │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼  HTTPS GET, no auth, no cookies
┌─ Browser (one user, one session) ────────────────────────────────────────────┐
│                                                                              │
│  ┌─ React 19 / App Router shell ─────────────────────────────────────────┐   │
│  │  src/app/layout.tsx   →   sticky header (github · linkedin · email)   │   │
│  │                       →   <main> 720px column   →   {children}        │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│            │                                                                 │
│            ├──▶  /  (Home)                                                   │
│            │     Hero · FeaturedProjects (4 cards, static data)              │
│            │     Concepts (sorting/graphs/trees/recursion, links out)        │
│            │     Footer                                                      │
│            │                                                                 │
│            ├──▶  /sorting/<algo>     ──┐                                     │
│            ├──▶  /trees/<algo>       ──┤  every page is "use client"         │
│            ├──▶  /recursions/<algo>  ──┤  owns its useState                  │
│            └──▶  /graphs/<algo>      ──┘  runs await delayLoop(speed)        │
│                                                                              │
│  ┌─ Visualizer components (src/components/) ─────────────────────────────┐   │
│  │  ArrayVisualizer    BinaryVisualizer    CallstackVisualizer           │   │
│  │  GridVisualizer     LinearDataVisualizer                              │   │
│  │  NetworkDiagram (d3-force, imperative useEffect)                      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│            │                                                                 │
│            ▼  imports                                                        │
│  ┌─ Data structures + algorithms (src/utils/) ───────────────────────────┐   │
│  │  data_structures/   Tree · BinarySearchTree · Graph · Graph2          │   │
│  │                     BinaryHeap · PriorityQueue                        │   │
│  │  notes/             Sorting/ · Graph/ · BST/ · Recursions/            │   │
│  │  delayLoop · generateArrayOfRandomNumbers · generateRandomNumber      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Legend — one line per component

- **Next.js 15.5.15 (App Router, static export)** — builds `./out/` at author time; `output: "export"` + `basePath: "/reincodes"` in `next.config.ts`; no server in production.
- **GitHub Pages** — hosts the static bundle at `rlynjb.github.io/reincodes/`; no SSR, no API routes, no auth.
- **`src/app/layout.tsx`** — root shell: Geist + Geist Mono fonts, sticky black header with three external links, `max-w-[720px]` column.
- **`src/app/page.tsx` (Home)** — composes `<Hero /> → <FeaturedProjects /> → <Concepts /> → <Footer />`; all four are server components that read static data.
- **`src/components/Home/FeaturedProjects.tsx`** — renders 4 project cards (loopd, contrl, AdvntrCue, aipe) from a hard-coded `projects` array.
- **`src/components/Home/Concepts.tsx` + `conceptsData.tsx`** — grid of visualizer links grouped by category (sorting / graphs / trees / recursion); each tile carries an inline-SVG thumbnail.
- **`src/app/<category>/<algo>/page.tsx`** — one page per visualizer; all `"use client"`; each page owns input-size + speed state and calls an animated algorithm.
- **`ArrayVisualizer`** — bar chart for sort visualizers; takes `array`, `highlightIndices`, `scanIndices`.
- **`BinaryVisualizer`** — used by binary-search-tree page; renders tree with current node highlighted.
- **`CallstackVisualizer`** — recursive HTML-list rendering of a `Tree` instance; used by Fibonacci, count-all-subsets, n-choose-k.
- **`GridVisualizer`** — N×M grid of `Graph2` nodes, click to toggle obstacles, highlight cells from outside.
- **`LinearDataVisualizer`** — generic horizontal bar/array renderer for one-shot data displays.
- **`NetworkDiagram`** — d3-force simulation, imperative DOM mutations inside `useEffect`, animates BFS traversal via `delayLoop`.
- **`src/utils/data_structures/Graph2.ts`** — adjacency-list graph + `breadth_first_search`; the workhorse for grid, Dijkstra, state-space search.
- **`src/utils/data_structures/BinarySearchTree.ts`** — recursive + iterative insert/search/successor/predecessor/delete + pre/in/post-order traversals.
- **`src/utils/data_structures/Tree.ts`** — generic n-ary tree with `preOrderTraversal` / `postOrderTraversal` generators; backs `CallstackVisualizer`.
- **`src/utils/data_structures/BinaryHeap.ts` + `PriorityQueue.ts`** — min-heap + thin PQ wrapper (`enqueue`/`dequeue`/`inQueue`/`updatePriority`).
- **`src/utils/delayLoop.ts`** — `(ms) => new Promise(r => setTimeout(r, ms))`; the load-bearing 4-line helper that turns every algorithm into a watchable animation.
- **`src/const/options.ts`** — `inputSizeOptions`, `speedOptions`, defaults; the only "config" surface.

## What's *not* in this diagram (and intentionally)

- No API server. No database. No auth. No cookies. No analytics.
- No AI / LLM calls from this codebase. The featured projects mention AI (loopd, AdvntrCue, aipe) but those are *external* apps shown as portfolio cards — this site never makes an LLM request.
- No service worker, no PWA shell, no offline cache beyond what GH Pages and the browser do by default.
- No streaming. No SSR. No partial hydration. Every page is a fully-rendered HTML file at build time, hydrated on load.

## How to read the rest of this guide

- **`01-system-design/`** — the architectural patterns that hold the site together. Read first.
- **`02-dsa/`** — the algorithms each visualizer page renders. Read in the order they're listed; later files reference data structures from earlier ones.
- **`03-ai-engineering/`** and **`04-machine-learning/`** — concepts the curriculum says reincodes is *supposed* to eventually host as interactive vizzes. Each file is Case B ("not yet implemented") with the curriculum's exercise as the buildable target. Use these to plan upcoming work.
