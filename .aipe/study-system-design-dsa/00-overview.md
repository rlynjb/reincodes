# reincodes — system overview

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

## Component legend

- **`next.config.ts`** — `output: "export"`, `basePath` + `assetPrefix` toggled by `NODE_ENV`, `images.unoptimized: true`. Defines the static-export contract that makes everything else possible.
- **`.github/workflows/deploy.yml`** — single GitHub Actions workflow: `next build` → upload `out/` → publish to GitHub Pages.
- **`src/app/layout.tsx`** — root layout, dark theme, Geist + Geist Mono fonts, sticky background, max-width 720px column.
- **`src/app/page.tsx`** — home page; composes Hero + FeaturedProjects + Concepts + Implementations + Footer.
- **`src/app/sorting/{bubble,insertion,selection,merge,quick,heap}-sort/page.tsx`** — 6 sorting visualizer pages. Each is `"use client"`, owns local state, drives ArrayVisualizer.
- **`src/app/trees/{binary-search-tree,binary-heap,n-ary-tree.tsx}/page.tsx`** — 3 tree visualizer pages, each drives BinaryVisualizer or NetworkDiagram.
- **`src/app/recursions/{fibonacci-numbers,n-choose-k,count-all-subsets}/page.tsx`** — 3 recursion visualizer pages, each drives CallstackVisualizer or LinearDataVisualizer.
- **`src/app/graphs/{network,finding-shortest-path,river-crossing-puzzle,grid,heatmap}/page.tsx`** — 5 graph visualizer pages, each drives NetworkDiagram or GridVisualizer.
- **`src/components/ArrayVisualizer/`** — renders an array of bars; props carry the current array, highlight indices, scan index. Read-only view.
- **`src/components/BinaryVisualizer/`** — renders a binary tree as nested SVG nodes; used by BST and heap pages.
- **`src/components/NetworkDiagram/`** — d3-force network diagram + adjacency list/matrix renderers. Used by graph pages.
- **`src/components/GridVisualizer/`** — 2D grid of cells with obstacle / path / scan classes; used by shortest-path + grid pages.
- **`src/components/CallstackVisualizer/`** — renders a recursion call stack as nested boxes; used by fibonacci page.
- **`src/components/LinearDataVisualizer/`** — flat list visualizer; used by n-choose-k and subsets pages.
- **`src/components/Home/`** — `Hero`, `FeaturedProjects`, `Concepts`, `Implementations`, `Footer`. `conceptsData.tsx` holds the static concept catalog with inline SVG thumbnails.
- **`src/utils/delayLoop.ts`** — `delayLoop(ms)` returns `Promise<void>` wrapping `setTimeout`. The mechanism that makes every algorithm step observable.
- **`src/utils/generateArrayOfRandomNumbers.ts`** — input generator for sorting visualizers.
- **`src/utils/data_structures/BinarySearchTree.ts`** — BST class with recursive + iterative insert/search/delete + four traversals.
- **`src/utils/data_structures/BinaryHeap.ts`** — MinHeap, MaxHeap, CompleteBinaryTree, iterative + recursive heap_sort. Records `swapSequence` for animation playback.
- **`src/utils/data_structures/PriorityQueue.ts`** — heap-backed PQ with `valueIndicesLookup` for O(log n) `updatePriority`. Drives Dijkstra.
- **`src/utils/data_structures/Tree.ts`** — generic n-ary tree with generator-based `preOrderTraversal` / `postOrderTraversal`.
- **`src/utils/data_structures/Graph2.ts`** — adjacency-list graph (`Node2` with `edges: { [neighbor]: Edge }`). Exports `breadth_first_search` returning parent array. Used by grid + Dijkstra + state-space BFS.
- **`src/utils/data_structures/Graph.ts`** — older adjacency-matrix-ish graph, used by NetworkDiagram. Has BFS/DFS, Eulerian checks, connected-components, tree-validity check.
- **`src/utils/data_structures/DijkstrasAlgorithm.ts`** — Dijkstra over `Graph2` + `PriorityQueue`, returns parent array for path reconstruction.
- **`src/utils/data_structures/River_crossing_puzzles/PG.ts`** — `PGState` (guards/prisoners/boat-side) + `solve_pg_bfs` over an implicit state-space graph built on-the-fly from `pg_neighbors`.
- **`src/utils/data_structures/finding_shortest_path/shortest_path.ts`** — reconstructs path from BFS parent array.

## Cross-cutting patterns

- **The animation contract:** every algorithm page follows the same loop — mutate state → `await delayLoop(speed)` → repeat. The animation IS the feature; one batched `setState` would defeat the visualizer.
- **The state ownership rule:** every page owns its own animation state. There is no global store, no context, no redux. Components below the page are read-only render targets.
- **The static-export contract:** no `getServerSideProps`, no API routes, no server components with runtime data. The site has exactly one runtime: the browser.
- **The basePath contract:** all internal links must respect `/reincodes` in production. `next/link` handles it; absolute `/` strings do not.
