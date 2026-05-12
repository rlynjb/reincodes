# Project context

reincodes is a personal site + DSA visualizer. Two things in one Next.js app: (1) a portfolio home page with a project list, and (2) a set of interactive algorithm visualizers under `/sorting`, `/trees`, `/recursions`, `/graphs`. There is no backend, no auth, no database, no AI. Everything renders statically, ships to GitHub Pages, and runs in the browser. Animations are driven by client `useState` plus a `delayLoop` async helper so each algorithm step is observable.

## Stack
- **Runtime**: client-side only. No Node server in production.
- **Framework**: Next.js 15.5.15 (App Router) with `output: "export"` for static HTML/JS bundles.
- **Hosting**: GitHub Pages at `/reincodes` basePath. `basePath` + `assetPrefix` are toggled in `next.config.ts` by `NODE_ENV`.
- **Language**: TypeScript 5.8 (strict-ish; many algorithm files use `any` liberally — see `src/utils/data_structures/Graph2.ts`).
- **UI**: React 19 + Tailwind CSS 3.4 + Geist / Geist Mono fonts. Dark theme, single 720px column.
- **Visualization libs**: `d3` 7 + `d3-force` (network diagram only); `@datastructures-js/priority-queue` (used in PriorityQueue glue, not directly in pages); custom DOM/SVG for everything else.
- **Tooling**: ESLint 9 + `eslint-config-next`, PostCSS, Tailwind CLI. No tests. No CI beyond the GH Pages deploy.

## Data model
There is no persistent data. All state is either:

- **Static config** (`src/components/Home/conceptsData.tsx`, `src/components/Home/FeaturedProjects.tsx`): hard-coded arrays of concept tiles and project cards, including SVG thumbnail components.
- **Constants** (`src/const/options.ts`, `src/const/sidebarNav.ts`): `inputSizeOptions`, `speedOptions`, default values.
- **Algorithm in-memory structures** in `src/utils/data_structures/`:
  - `Tree` — generic n-ary tree with `preOrder`/`postOrder` generators, used to render the Fibonacci callstack.
  - `BinarySearchTree` — recursive + iterative variants of insert/search/successor/predecessor/delete + four traversals.
  - `Graph2` — adjacency list of `Node2` objects each with `edges: { [neighbor]: Edge }`. Drives grid + Dijkstra + state-space BFS. Carries `breadth_first_search` as a free function.
  - `Graph` — older adjacency-matrix-ish version, used by `NetworkDiagram`.
  - `BinaryHeap` + `PriorityQueue` — min-heap; PQ exposes `enqueue`/`dequeue`/`inQueue`/`updatePriority`.
  - `River_crossing_puzzles/PG.ts` — `PGState` (guards_left, prisoners_left, boat_side) + `solve_pg_bfs` over an implicit state-space graph built from `pg_neighbors`.
- **Page-local React state** (per visualizer): bars array, highlight indices, scan index, obstacle list, speed, input size. Reset via `useState` setters and an `await delayLoop(speed)` between mutations to make steps visible.

## File structure
- `src/app/` — App Router pages. One folder per visualizer family: `sorting/{bubble,insertion,selection,merge,quick,heap}-sort/page.tsx`, `trees/{binary-search-tree,binary-heap,n-ary-tree.tsx}/page.tsx`, `recursions/{fibonacci-numbers,n-choose-k,count-all-subsets}/page.tsx`, `graphs/{network,finding-shortest-path,river-crossing-puzzle,grid}/page.tsx`. Every page is `"use client"`.
- `src/app/page.tsx` + `src/app/layout.tsx` — home + global shell (header with github/linkedin/email links, sticky bg, max-width 720px).
- `src/components/Home/` — `Hero`, `FeaturedProjects` (4 cards: loopd, contrl, AdvntrCue, aipe), `Concepts` (grid of visualizers grouped by sorting/graphs/trees/recursion), `Footer`. `conceptsData.tsx` defines inline SVG thumbnails.
- `src/components/` (visualizers): `ArrayVisualizer`, `BinaryVisualizer`, `CallstackVisualizer`, `GridVisualizer`, `LinearDataVisualizer`, `NetworkDiagram`. Each is `"use client"`, owns its DOM, reads animation state via props.
- `src/components/ui/` — small UI primitives, e.g. `BSelect` for the input-size/speed dropdowns.
- `src/utils/` — `delayLoop.ts`, `generateRandomNumber.ts`, `generateArrayOfRandomNumbers.ts`, plus `data_structures/` (see above) and `notes/` (per-algorithm reference implementations: `Sorting/`, `Graph/`, `BST/`, `Recursions/` — these aren't always imported, they read like a personal study notebook).
- `next.config.ts` — `output: "export"`, `images: { unoptimized: true }`, `basePath: "/reincodes"` in prod.
- `spec.md`, `spec-reincodes.md`, `reincodes-redesign-spec.md` — design specs for the home redesign. Not load-bearing.

## What must not change
- **Static export contract**: the app must keep building under `output: "export"`. No `getServerSideProps`, no API routes, no runtime-only Next features. Anything that needs a server is out of scope.
- **GitHub Pages basePath**: `basePath: "/reincodes"` and `assetPrefix` must stay correctly toggled by `NODE_ENV`. Internal links must go through `next/link` or honor the basePath; absolute `/` links will 404 in prod.
- **Visualizer step-through pattern**: every algorithm page mutates state, calls `await delayLoop(speed)`, then mutates again so a user can watch each step. Don't replace with a single batched `setState` — the animation IS the feature.
- **Home page composition**: `Hero → FeaturedProjects → Concepts → Footer`, in that order, inside a `max-w-[720px]` column. The four featured projects (loopd, contrl, AdvntrCue, aipe) and the concept categories (sorting, graphs, trees, recursion) are the surface area of the site.
- **No backend creep**: do not add API routes, auth, analytics, or a database. The site is intentionally a static visualizer.
- **Data-structure files in `src/utils/data_structures/`**: these double as reference implementations for the visualizers. Renaming exports or splitting them breaks page imports.
