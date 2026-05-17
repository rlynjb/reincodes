# Spec: reincodes — portfolio + interactive DSA visualizer

## Purpose

A single-engineer portfolio site that doubles as an interactive playground for data-structure and algorithm visualizations. The home page surfaces who Rein is, what he's shipped, and what he can demonstrate hands-on; every concept tile links to a live visualizer page that renders the algorithm in the browser.

Built as a fully static Next.js app, deployed from GitHub Pages via GitHub Actions. No backend, no API routes, no environment secrets — every page is pre-rendered at build time.

## Repo

- Slug: `rlynjb/reincodes`
- Live: `https://rlynjb.github.io/reincodes/`
- Source of truth: `main` branch
- Deploy trigger: push to `main` (or manual `workflow_dispatch`)

## Stack

- Next.js 15.5.15 (App Router) with `output: "export"`
- React 19
- TypeScript 5.8
- Tailwind CSS 3.4 — uses arbitrary-value syntax (`bg-[#3C3489]`) freely; no design tokens added to `tailwind.config.ts` for content-level colors
- d3 7 + d3-force (network/graph visualizers)
- `@datastructures-js/priority-queue` (Dijkstra in `/graphs/finding-shortest-path`)
- Fonts: Geist Sans, Geist Mono (next/font/google) — body uses `font-[family-name:var(--font-geist-mono)]`
- No backend deps. No server actions. No `/api` routes.

## Routes

All routes are static-prerendered. Production builds emit them under `out/` with `basePath: /reincodes` and `trailingSlash: true`.

```
/                                  home
/sorting/selection-sort            O(n²)
/sorting/bubble-sort               O(n²)
/sorting/insertion-sort            O(n²)
/sorting/merge-sort                O(n log n)
/sorting/quick-sort                O(n log n)
/sorting/heap-sort                 O(n log n)
/graphs/network                    d3 force-directed graph
/graphs/grid                       grid BFS/DFS
/graphs/finding-shortest-path      Dijkstra
/graphs/river-crossing-puzzle      state-space search
/graphs/heatmap                    (placeholder)
/trees/binary-search-tree          BST crud + traversal
/trees/binary-heap                 WIP — partial page
/trees/n-ary-tree.tsx              (legacy file, kept for compatibility)
/recursions/count-all-subsets      backtracking
/recursions/fibonacci-numbers      call-stack visualization
/recursions/n-choose-k             (placeholder)
```

22 routes total in the production build.

## Layout

`src/app/layout.tsx` is shared across all routes.

### Header (sticky)

- Background: solid black, `z-10`
- Inner container: `max-w-[720px] mx-auto px-4 sm:px-6 py-4 flex justify-between items-baseline` — aligns flush with the home page content column below
- Left: `<Link href="/">` showing `Reincodes` (text-xl) + subtitle `Portfolio & DSA Visualizer` (text-xs, text-gray-400)
- Right: `<nav>` with three plain `<a>` links — `github`, `linkedin`, `email`. Style: `text-xs text-gray-400 hover:text-white`. External targets use `target="_blank" rel="noopener noreferrer"`; email uses `mailto:`.

### Main

- `<main className="mx-4 relative grid grid-cols-12" style={{ height: "85vh" }}>`
- Inner: `<div className="b-container col-span-12">` wraps `{children}`
- `b-container` adds `padding: 2em; text-align: center` via `globals.css`. The home page overrides centering with `text-left` at its own wrapper level.

The sidebar `<Menu />` is **not rendered**. The Menu component file and `src/const/sidebarNav.ts` are kept in the repo as dead code in case the side nav is reinstated; if rebuilt, they can be deleted.

## Home page (`/`)

Composition is a single column inside a 720px-max-width container, lowercase voice throughout, with the page wrapper at:

```tsx
<div className="max-w-[720px] mx-auto px-4 sm:px-6 py-6 text-left">
  <Hero />
  <FeaturedProjects />
  <Concepts />
  <Footer />
</div>
```

### Hero (`src/components/Home/Hero.tsx`)

Section: `<section className="mb-14">`.

1. **Title**: `<h1 className="text-2xl font-medium mb-1.5">hi, i'm rein.</h1>`
2. **Subtitle paragraph** (`text-[15px] text-neutral-300 leading-relaxed max-w-[560px]`):
   > software engineer III at Switch · 7+ yrs in vue and react · building ai-powered tools on the side and deepening into product engineering.
3. **Location line** (`text-[13px] text-neutral-500 mb-8`):
   > seattle, wa · open to frontend / ai engineering roles
4. **Metric grid** (`grid grid-cols-1 sm:grid-cols-3 gap-2 mb-8`). Each tile: `bg-neutral-900 rounded-lg px-3.5 py-3`. Label is uppercase 10px / `text-neutral-400 tracking-wider`. Tiles:

   | label                  | value                                          | value class           |
   |------------------------|------------------------------------------------|-----------------------|
   | client cost savings    | `$700k`                                        | `text-xl`             |
   | customers shipped to   | `fedex · amazon` / `netflix · coreweave`       | `text-[13px] leading-tight` (two lines) |
   | years at switch        | `7+`                                           | `text-xl`             |

5. **Skill chips** (`flex flex-wrap gap-1.5`). Each chip: `inline-flex px-2.5 py-[3px] rounded-full text-[11px] font-medium ${bg} ${text}`. The palette uses **dark-theme saturated backgrounds with light tint text**, grouped by implicit category:

   | chip                       | bg class           | text class          | category       |
   |---------------------------|--------------------|---------------------|----------------|
   | `vue · nuxt · quasar`     | `bg-[#3C3489]`     | `text-[#EEEDFE]`    | web frontend   |
   | `react · next.js`         | `bg-[#3C3489]`     | `text-[#EEEDFE]`    | web frontend   |
   | `typescript`              | `bg-[#3C3489]`     | `text-[#EEEDFE]`    | web frontend   |
   | `turborepo · monorepo`    | `bg-[#3C3489]`     | `text-[#EEEDFE]`    | web frontend   |
   | `rag · pgvector`          | `bg-[#085041]`     | `text-[#E1F5EE]`    | ai layer       |
   | `openai · langchain`      | `bg-[#085041]`     | `text-[#E1F5EE]`    | ai layer       |
   | `mediapipe · pwa`         | `bg-[#712B13]`     | `text-[#FAECE7]`    | on-device + pwa|
   | `dsa · system design`     | `bg-[#72243E]`     | `text-[#FBEAF0]`    | fundamentals   |

### FeaturedProjects (`src/components/Home/FeaturedProjects.tsx`)

Section: `<section className="mb-14">` with an uppercase 11px label `featured projects` (mb-6), then a 2-column grid (`grid grid-cols-1 sm:grid-cols-2 gap-2.5`).

**Project model:**

```ts
type Project = {
  name: string;
  subtitle: string;
  description: string;
  tech: string[];
  href?: string;           // optional — when absent, renders as non-clickable <div>
  external?: boolean;      // only meaningful when href present
  iconBg: string;          // tailwind bg class
  iconText: string;        // tailwind text class
  initials: string;        // 2-char string for icon tile
};
```

Render branches:
- No `href` → `<div className={baseCardClass}>` (no hover border, no pointer)
- `external: true` → `<a target="_blank" rel="noopener noreferrer">`
- otherwise → `<Link>`

Card classes:
```ts
baseCardClass = "bg-black border border-neutral-800 rounded-xl p-4 transition-colors h-full flex flex-col gap-2"
linkCardClass = baseCardClass + " hover:border-neutral-700 cursor-pointer"
```

Card body: 34×34 rounded-md icon tile with two-letter initials → name/subtitle column → description paragraph (text-xs text-neutral-300 leading-snug) → tech tag row at `mt-auto` (each tag `font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-neutral-900 text-neutral-400`).

**Projects (in render order):**

| name       | subtitle                          | href                                  | external | icon palette          | initials |
|------------|-----------------------------------|---------------------------------------|----------|-----------------------|----------|
| loopd      | daily journal and vlog            | — (no link)                           | n/a      | `#E1F5EE` / `#085041` | `lp`     |
| contrl     | skilltree calisthenics workout    | — (no link)                           | n/a      | `#FAECE7` / `#712B13` | `ct`     |
| AdvntrCue  | rag travel guide                  | `https://adventurecue.netlify.app/`   | true     | `#EEEDFE` / `#3C3489` | `ac`     |
| aipe       | ai spec templates                 | `https://github.com/rlynjb/aipe`      | true     | `#FBEAF0` / `#72243E` | `ai`     |

Descriptions and tech-tag arrays are inline in the component — see the file for verbatim copy.

Casing note: loopd / contrl / aipe tags are lowercase. AdvntrCue tags are capitalized (`Next.js · TypeScript · RAG · pgvector · OpenAI · Vercel AI SDK · Drizzle ORM · Netlify Functions`). This inconsistency is intentional for now.

### Concepts (`src/components/Home/Concepts.tsx`)

Section: `<section className="mb-14">` with uppercase 11px label `concepts · interactive visualizers` (mb-6). 2-column grid (`grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6`).

Data comes from `src/components/Home/conceptsData.tsx` which exports `CONCEPT_CATEGORIES: ConceptCategory[]`. Types:

```ts
interface Concept {
  title: string;
  href: string;
  meta?: string;     // e.g. "o(n²)", "dijkstra"
  wip?: boolean;     // shows "wip" pill instead of meta
  thumb: ReactNode;  // inline SVG component
}
interface ConceptCategory {
  name: string;
  concepts: Concept[];
}
```

Each row is a `<Link>`: `flex items-center gap-3 p-2 rounded-md hover:bg-neutral-900 transition-colors`.
- Left: 40×40 thumbnail container (`w-10 h-10 shrink-0 bg-neutral-900 rounded-md border border-neutral-800 flex items-center justify-center overflow-hidden`)
- Right (flex-1, justify-between): title (text-sm font-medium) and either meta (`text-[11px] text-neutral-500 font-mono`) or wip pill (`text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 font-medium`).

**Categories and concepts (order matters):**

- **sorting**: selection-sort, bubble-sort, insertion-sort (`o(n²)`); merge-sort, quick-sort, heap-sort (`o(n log n)`)
- **graphs**: network (`d3 · components`), grid (`bfs / dfs`), finding-shortest-path (`dijkstra`), river-crossing-puzzle (`state-space`)
- **trees**: binary-search-tree (`crud + traversal`), binary-heap (wip)
- **recursion**: count-all-subsets (`backtracking`), fibonacci-numbers (`call-stack viz`)

**Thumbnails** are inline SVG functional components in `conceptsData.tsx`, all wrapped at `<svg viewBox="0 0 100 100" className="w-3/4 h-3/4">`:

- `SortingThumb({ bars, highlight, faded })` — 6 bars, purple palette (`#AFA9EC`, highlighted `#534AB7`)
- `MergeThumb` — divide-tree shape (1/2/5 bars)
- `QuickThumb` — 7 thin bars with `+` pivot indicator
- `HeapThumb` — tree of 7 nodes
- `TreeThumb({ leftLeaves })` — teal palette (`#0F6E56`, `#5DCAA5`); BST uses 2 leaves, binary-heap uses 1
- `NetworkThumb` — 7-node coral graph (`#D85A30`, `#993C1D`)
- `GridThumb({ pattern })` — 5×5 grid; cell chars map to fills: `e/p` `#F5C4B3`, `o` `#444441`, `s` `#5DCAA5`, `g` `#993C1D`, `h` `#D85A30`. Patterns for BFS/DFS grid and Dijkstra are precomputed constants in the file.
- `RiverThumb` — two grass rectangles + dashed blue river + figures + boat
- `RecursionThumb` — pink tree (`#993556`, `#D4537E`); subset variant
- `FibonacciThumb` — same shape, lighter pink leaves (`#ED93B1`), text labels `5/4/3` inside top nodes

### Footer (`src/components/Home/Footer.tsx`)

`<footer className="pt-6 border-t border-neutral-800 text-[11px] flex gap-3.5 flex-wrap">` containing the same three social links as the header nav (`github`, `linkedin`, `email`), each `text-gray-400 hover:text-white`.

## Visualizer pages

Each visualizer is its own client component under `src/app/{category}/{name}/page.tsx`, consuming reusable visualization primitives from `src/components/`:

```
src/components/
├── ArrayVisualizer/        — bar-chart rendering for sorting
├── BinaryVisualizer/        — binary tree rendering
├── CallstackVisualizer/     — recursion call-stack rendering
├── GridVisualizer/          — grid/heatmap rendering
├── LinearDataVisualizer/    — linear data structure rendering
├── NetworkDiagram/          — d3 force-directed graph
├── Home/                    — home-page components only
├── ui/                      — generic UI primitives
├── Menu.tsx                 — unused (kept for future)
├── styles.css               — visualizer-specific CSS
└── index.ts                 — barrel
```

Each category has its own `layout.tsx` at `src/app/{sorting,recursions}/layout.tsx` if a shared shell is needed. `trees` and `graphs` do not share a layout.

### Algorithm logic

Located under `src/utils/` (not enumerated here). The visualizer components import from `src/utils/` and `src/const/`. `src/const/sidebarNav.ts` is currently unreferenced.

## Visual contract — non-negotiables

- Home page copy is **lowercase** except: brand names (`Reincodes`, `Switch`, `AdvntrCue`), Roman numerals (`III`), and where literal name casing matters
- No emoji
- No gradients, no box-shadows
- Borders: `border-neutral-800` default, `border-neutral-700` on hover
- Muted text: `text-neutral-500`; secondary: `text-neutral-300` / `text-neutral-400`
- Body background `#0a0a0a` from globals.css dark-mode `@media (prefers-color-scheme: dark)`
- Thumbnail hex colors are **content**, not theme tokens — hardcoded in `conceptsData.tsx`
- All Home internal thumbnails are inline SVG ReactNodes — never external image files. The `Concept.thumb` field accepts any ReactNode so future swaps to `<Image>` are one-line changes.

## Behaviour

### Happy path

- User loads `/` → sees hero, four featured project cards, four-category concept grid, footer
- User clicks `AdvntrCue` or `aipe` → opens external URL in a new tab
- User clicks a concept thumbnail row → navigates via `<Link>` to the corresponding visualizer
- User clicks header logo → returns to `/`
- User clicks `github` / `linkedin` / `email` in header or footer → external nav (email uses `mailto:`)

### Non-link cards

- `loopd` and `contrl` render as `<div>` cards with no hover border or pointer cursor — they're informational only until production URLs exist.

### Unhappy path

- `binary-heap` visualizer is incomplete; the `wip` pill communicates this. The link still works and lands on the partial page.
- `n-choose-k`, `heatmap`, and `n-ary-tree.tsx` exist as routes but aren't surfaced in the concept grid.

### Responsive

- < 600px: metric grid, featured project grid, and concept category grid all collapse to single column via `grid-cols-1 sm:grid-cols-N`. Skill chips wrap. Thumbnail rows stay single column.
- Header logo + nav stay in `flex justify-between` on all sizes; nav wraps naturally if cramped.

## Build & deploy

### Local dev

```bash
npm install
npm run dev      # next dev --turbopack, http://localhost:3000
```

In dev, `basePath` is empty so the site serves from `/`.

### Production build

```bash
npm run build    # next build → emits out/
```

22 static routes produced into `out/`. With `basePath: "/reincodes"` applied (production only), all asset URLs are prefixed and all `<Link>` hrefs resolve correctly to `/reincodes/{path}/`.

### CI/CD

`.github/workflows/deploy.yml` runs on push to `main` (or manual `workflow_dispatch`):

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with Node 20 and npm cache
3. `npm ci` → `npm run build`
4. `touch out/.nojekyll` (prevents Jekyll on Pages)
5. `actions/configure-pages@v5`
6. `actions/upload-pages-artifact@v3` (path: `out`)
7. `actions/deploy-pages@v4`

Concurrency group `pages` with `cancel-in-progress: false`. Permissions: `contents: read`, `pages: write`, `id-token: write`.

GitHub Pages must be enabled at repo Settings → Pages with **Source = "GitHub Actions"**.

### Custom domain (optional, not yet configured)

To run without basePath: remove the `basePath` and `assetPrefix` lines from `next.config.ts`, add a `CNAME` file under `public/`, configure DNS. Internal `<Link>` hrefs need no changes — they're already relative to the basePath.

## Constraints

- **No new npm packages** unless they replace something already there. The site is intentionally lean (`~440 packages` post-cleanup vs. ~2000 before).
- **No backend / no API routes / no server actions** — `output: "export"` requires fully static output.
- **No `<Image>`-based optimization** — `images: { unoptimized: true }` is required for static export and GitHub Pages.
- **Do not extract content-hex colors** (thumbnail palettes, chip colors) into `tailwind.config.ts` — they're content, not theme tokens.
- **Do not modify `globals.css` except via override classes at the component level** (the home page uses `text-left` to override `.b-container`'s `text-align: center`).
- **Lowercase voice** for home copy; preserve casing for project names (`AdvntrCue`, `Next.js`) and metadata (`Switch`, `III`).

## Verification

After build:

1. `npm run build` exits 0 and produces `out/index.html` + per-route HTML files
2. `out/index.html` contains the strings `hi, i&#x27;m rein.`, `featured projects`, `concepts · interactive visualizers`
3. All asset references in `out/index.html` are prefixed with `/reincodes/` (production basePath)
4. All visualizer routes produce static HTML files under their respective paths in `out/`
5. `npm run lint` does not error on any file under `src/app/`, `src/components/Home/`, or `src/components/ui/` (pre-existing lint errors in `src/utils/` are tolerated; `eslint.ignoreDuringBuilds: true`)
6. The GitHub Actions workflow completes successfully and the site is reachable at `https://rlynjb.github.io/reincodes/`

## Known dead code / cleanup candidates

- `src/components/Menu.tsx` — not rendered anywhere
- `src/const/sidebarNav.ts` — only Menu consumed it
- `src/app/recursions/n-choose-k/` — not in concept grid
- `src/app/graphs/heatmap/` — not in concept grid
- `src/app/trees/n-ary-tree.tsx` — odd `.tsx` extension on a route folder, not in concept grid
- `reincodes-redesign-spec.md`, `spec.md` — historical spec docs, untracked

None of these block deployment; all are safe to remove when convenient.
