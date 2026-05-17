# Feature: reincodes portfolio redesign — single-page home

## Context

The current `src/app/page.tsx` is a plain bio page ("Hi! Welcome to my Portfolio & DSA Visualizer..."). It buries the strongest signals (7+ years at Switch, $700K saved on the security audit app, AI side projects) under a personal note.

This task replaces only the home page (`/`) with a single-page layout that surfaces:
1. Identity + role + key metrics + skill chips (hero)
2. Featured projects: loopd, contrl, smart travel buddy
3. Interactive DSA visualizer concepts in a 2-column grid with thumbnails
4. Small footer line

All existing visualizer routes (`/sorting/*`, `/trees/*`, `/graphs/*`, `/recursions/*`, `/ai/helloai`) stay exactly as they are. The `<Menu />` sidebar in `layout.tsx` stays so visualizer pages keep their nav.

## What changes

**Replace** `src/app/page.tsx` entirely.

**Modify** `src/app/layout.tsx` to add github / linkedin / email links to the right side of the existing header (next to the existing "Reincodes" logo). Do not remove the `<Menu />` component — it must keep rendering for visualizer pages.

**Create** five new files under `src/components/Home/`:
- `Hero.tsx`
- `FeaturedProjects.tsx`
- `Concepts.tsx`
- `conceptsData.tsx` (data + thumbnail SVGs)
- `Footer.tsx`

**Do not touch** anything under:
- `src/app/sorting/`, `src/app/trees/`, `src/app/graphs/`, `src/app/recursions/`, `src/app/ai/`
- `src/components/Menu.tsx`, `src/components/ArrayVisualizer/`, `src/components/BinaryVisualizer/`, etc.
- `src/utils/` and `src/const/` (except as noted below)
- `globals.css`

**Optional cleanup**: `src/const/sidebarNav.ts` currently has 5 categories. The new home shows the same set in a different layout, so leave `sidebarNav.ts` alone — `<Menu />` continues to consume it for visualizer pages.

## Stack

- Next.js App Router (already in repo)
- Tailwind CSS (already in repo, see `globals.css`)
- Geist Sans + Geist Mono (already loaded in `layout.tsx`)
- `next/link` for internal navigation
- Plain `<a>` for external links and email

No new dependencies. No CSS-in-JS. No new config.

## Page structure

The home page is a single column, max-width 720px, centered, with three sections separated by ~2.5rem of vertical space.

```
┌──────────────────────────────────────────────────┐
│  HEADER (in layout.tsx, sticky)                  │
│  Reincodes                  github linkedin email│
├──────────────────────────────────────────────────┤
│                                                  │
│  HERO                                            │
│   hi, i'm rein.                                  │
│   software engineer iii at switch · 7+ yrs ...   │
│   las vegas, nv · open to senior frontend ...    │
│                                                  │
│   ┌──────────┬──────────┬──────────┐             │
│   │ $700k    │ fedex··· │ 7+       │  metrics    │
│   └──────────┴──────────┴──────────┘             │
│                                                  │
│   [vue][react][typescript][rag][openai][...]     │
│                                                  │
│  FEATURED PROJECTS                               │
│   ┌────────┬────────┬────────┐                   │
│   │ loopd  │ contrl │ travel │                   │
│   │        │        │ buddy  │                   │
│   └────────┴────────┴────────┘                   │
│                                                  │
│  CONCEPTS · INTERACTIVE VISUALIZERS              │
│   sorting               graphs                   │
│    [▥] selection sort    [⬡] network diagram     │
│    [▥] bubble sort       [▦] grid diagram        │
│    [▥] insertion sort    [▦] shortest path       │
│    [▥] merge sort        [⛵] river-crossing     │
│    [▥] quick sort                                │
│    [▥] heap sort         trees                   │
│                          [⊕] binary search tree  │
│   recursion              [⊕] binary heap [wip]   │
│    [✦] count subsets                             │
│    [✦] fibonacci                                 │
│                                                  │
│  FOOTER (small text line)                        │
└──────────────────────────────────────────────────┘
```

## Files

### `src/app/page.tsx`

Composition only — imports the four `Home/*` components and renders them inside a centered max-width container.

```tsx
import Hero from "@/components/Home/Hero";
import FeaturedProjects from "@/components/Home/FeaturedProjects";
import Concepts from "@/components/Home/Concepts";
import Footer from "@/components/Home/Footer";

export default function Home() {
  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-6">
      <Hero />
      <FeaturedProjects />
      <Concepts />
      <Footer />
    </div>
  );
}
```

### `src/app/layout.tsx`

Modify the existing header. Currently it only renders the logo. Add a right-side `<nav>` with three links: github, linkedin, email. Use `text-xs text-gray-400 hover:text-white` for the links. Make the header `flex justify-between items-baseline`. Keep `<Menu />` and `<main>` exactly as they are.

```tsx
<header className="sticky top-0 p-4 z-10 bg-black flex justify-between items-baseline">
  <Link className="block" href={"/"}>
    <h1 className="text-xl leading-none">
      Reincodes
      <br />
      <span className="text-xs text-gray-400">Portfolio & DSA Visualizer</span>
    </h1>
  </Link>

  <nav className="flex gap-3.5 text-xs">
    <a href="https://github.com/rlynjb" target="_blank" rel="noopener noreferrer"
       className="text-gray-400 hover:text-white">github</a>
    <a href="https://www.linkedin.com/in/rlynpro" target="_blank" rel="noopener noreferrer"
       className="text-gray-400 hover:text-white">linkedin</a>
    <a href="mailto:rlynjb@gmail.com"
       className="text-gray-400 hover:text-white">email</a>
  </nav>
</header>
```

### `src/components/Home/Hero.tsx`

Renders:
- `<h1>` with text `hi, i'm rein.` — text-2xl, font-medium, mb-1.5
- A subtitle paragraph — text-[15px], text-neutral-300, leading-relaxed, max-w-[560px]: `software engineer iii at switch · 7+ yrs in vue and react · building ai-powered tools on the side and deepening into product engineering.`
- A location line — text-[13px], text-neutral-500, mb-6: `las vegas, nv · open to senior frontend / product engineering roles`
- A 3-column metric grid (`grid-cols-1 sm:grid-cols-3 gap-2 mb-5`) — each tile has `bg-neutral-900 rounded-lg px-3.5 py-3`, with a 10px uppercase label (`text-[10px] text-neutral-400 uppercase tracking-wider`) and a value below
  - Tile 1: label `led to savings`, value `$700k` (text-xl)
  - Tile 2: label `customers shipped to`, value `fedex · amazon` then `<br>` then `netflix · coreweave` (text-[13px], leading-tight — smaller because two lines)
  - Tile 3: label `years at switch`, value `7+` (text-xl)
- A flex-wrap row of skill chips (gap-1.5):

| chip text                | bg color   | text color |
|--------------------------|------------|------------|
| `vue · nuxt · quasar`    | `#EEEDFE`  | `#3C3489`  |
| `react · next.js`        | `#EEEDFE`  | `#3C3489`  |
| `typescript`             | `#EEEDFE`  | `#3C3489`  |
| `turborepo · monorepo`   | `#EEEDFE`  | `#3C3489`  |
| `rag · pgvector`         | `#E1F5EE`  | `#085041`  |
| `openai · langchain`     | `#E1F5EE`  | `#085041`  |
| `mediapipe · pwa`        | `#FAECE7`  | `#712B13`  |
| `dsa · system design`    | `#FBEAF0`  | `#72243E`  |

Each chip: `inline-flex px-2.5 py-[3px] rounded-full text-[11px] font-medium` plus the bg/text color.

Use `bg-[#EEEDFE]` arbitrary value syntax — do not add these to `tailwind.config.ts`.

The whole component is wrapped in a `<section className="mb-10">`.

### `src/components/Home/FeaturedProjects.tsx`

A small section label at the top: `text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-6`, content `featured projects`.

Then a 3-column card grid (`grid grid-cols-1 sm:grid-cols-3 gap-2.5`).

Each card: `bg-black border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition-colors h-full flex flex-col gap-2 cursor-pointer`.

Card structure:
1. Top row (flex, gap-2.5, items-center): a 34×34 rounded-md icon with the project's two-letter initials, then a column with name (font-medium text-sm) and subtitle (text-[11px] text-neutral-500)
2. Description paragraph: text-xs, text-neutral-300, leading-snug
3. Tech tags (flex-wrap, gap-1, mt-auto pt-1): each `font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-neutral-900 text-neutral-400`

The three projects:

| name           | subtitle              | description                                                                                                                | tech                                  | href                | icon bg     | icon text   | initials |
|----------------|-----------------------|----------------------------------------------------------------------------------------------------------------------------|---------------------------------------|---------------------|-------------|-------------|----------|
| `loopd`        | `productivity pwa`    | `plan → live → reflect → improve. unified journal + habit system, plus a vlog editor for short-form video.`                | `next.js`, `notion api`, `ffmpeg`     | external (TODO URL) | `#E1F5EE`   | `#085041`   | `lp`     |
| `contrl`       | `calisthenics pwa`    | `webcam-based rep counting and form scoring with on-device pose estimation. form is the gate to the next level.`           | `next.js`, `mediapipe`, `on-device ml`| external (TODO URL) | `#FAECE7`   | `#712B13`   | `ct`     |
| `travel buddy` | `rag · sf guide`      | `end-to-end rag pipeline over neon postgres with pgvector. embed query → vector search → gpt answer.`                      | `pgvector`, `drizzle`, `openai`       | `/ai/helloai`       | `#EEEDFE`   | `#3C3489`   | `tb`     |

For loopd and contrl URLs: use `https://loopd.app` and `https://contrl.app` as placeholders (Rein will replace them). Render those as `<a href={...} target="_blank" rel="noopener noreferrer">`. Render travel buddy with `<Link href="/ai/helloai">` from `next/link`.

Do this with a discriminated union — one `Project` type with an optional `external: boolean` flag, then a single render function that picks `<a>` or `<Link>` based on it.

### `src/components/Home/conceptsData.tsx`

Exports a typed array of category groups:

```ts
export interface Concept {
  title: string;
  href: string;
  meta?: string;     // e.g. "o(n²)", "dijkstra", "crud + traversal"
  wip?: boolean;     // shows a "wip" pill instead of meta
  thumb: ReactNode;  // SVG component
}

export interface ConceptCategory {
  name: string;
  concepts: Concept[];
}

export const CONCEPT_CATEGORIES: ConceptCategory[] = [...];
```

The four categories, in order, with their concepts:

**sorting**
| title           | href                       | meta         |
|-----------------|----------------------------|--------------|
| selection sort  | `/sorting/selection-sort`  | `o(n²)`      |
| bubble sort     | `/sorting/bubble-sort`     | `o(n²)`      |
| insertion sort  | `/sorting/insertion-sort`  | `o(n²)`      |
| merge sort      | `/sorting/merge-sort`      | `o(n log n)` |
| quick sort      | `/sorting/quick-sort`      | `o(n log n)` |
| heap sort       | `/sorting/heap-sort`       | `o(n log n)` |

**graphs**
| title                  | href                                | meta              |
|------------------------|-------------------------------------|-------------------|
| network diagram        | `/graphs/network`                   | `d3 · components` |
| grid diagram           | `/graphs/grid`                      | `bfs / dfs`       |
| shortest path          | `/graphs/finding-shortest-path`     | `dijkstra`        |
| river-crossing puzzle  | `/graphs/river-crossing-puzzle`     | `state-space`     |

**trees**
| title              | href                          | meta                | wip   |
|--------------------|-------------------------------|---------------------|-------|
| binary search tree | `/trees/binary-search-tree`   | `crud + traversal`  | false |
| binary heap        | `/trees/binary-heap`          | (none — show wip)   | true  |

**recursion**
| title             | href                              | meta              |
|-------------------|-----------------------------------|-------------------|
| count all subsets | `/recursions/count-all-subsets`   | `backtracking`    |
| fibonacci         | `/recursions/fibonacci-numbers`   | `call-stack viz`  |

**Thumbnails.** Each thumb is an inline SVG component, all viewBox `0 0 100 100`, rendered at `w-3/4 h-3/4` inside a 40×40 container. Build small reusable thumbnail components:

- `SortingThumb({ bars, highlight, faded })` — array of 6 bar heights, paint bars purple `#AFA9EC`, highlighted bar `#534AB7`, faded bars at 0.4 opacity
- `TreeThumb({ leftLeaves })` — root + 2 children + 2-3 grandchildren, root and edges in teal `#0F6E56`, leaves in `#5DCAA5`
- `RecursionThumb({ withLabels })` — same shape as TreeThumb but pink (`#993556` for root and edges, `#D4537E` for mid, `#ED93B1` for leaves). With labels: shows `5`, `4`, `3` text inside top three nodes (fibonacci variant)
- `NetworkThumb` — 7 nodes, 8 edges, coral palette (`#D85A30` nodes, `#993C1D` edges, one `#993C1D` filled node as root)
- `GridThumb({ pattern })` — takes a 25-cell pattern array, each cell either `e` (empty, fill `#F5C4B3`), `o` (obstacle, `#444441`), `s` (start, `#5DCAA5`), `g` (goal, `#993C1D`), `h` (highlighted path, `#D85A30`), `p` (visited, `#F5C4B3`)
- `RiverThumb` — two grass rectangles on either side of a dashed blue river, 2 figures + boat
- `MergeThumb` — divide-tree shape: 1 wide bar on top, 2 medium bars middle, 5 small bars bottom (purple)
- `QuickThumb` — 7 thin bars with a pivot indicator (small "+") above the middle one
- `HeapThumb` — same as TreeThumb but with 4 bottom-row leaves instead of 3

Use the existing patterns from this earlier prototype as the source of truth for SVG content (paste in directly):

[See implementation hints below]

### `src/components/Home/Concepts.tsx`

Section label: `concepts · interactive visualizers` in the same uppercase-tracker style as featured projects.

Then a 2-column grid (`grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6`).

Each category renders:
- A category name (text-[13px] font-medium text-neutral-300, mb-2 px-2)
- A flex column of rows

Each row is a `<Link>` from `next/link` — full row clickable:
```
flex items-center gap-3 p-2 rounded-md hover:bg-neutral-900 transition-colors
```

Row contents:
1. 40×40 thumbnail container (`w-10 h-10 shrink-0 bg-neutral-900 rounded-md border border-neutral-800 flex items-center justify-center overflow-hidden`)
2. Body (flex-1, items-center, justify-between):
   - Left: title (text-sm font-medium)
   - Right: either the meta text in mono (`text-[11px] text-neutral-500 font-mono`) OR a `wip` pill if `wip: true` (`text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 font-medium`)

### `src/components/Home/Footer.tsx`

A footer with `pt-4 border-t border-neutral-800 text-[11px] text-neutral-500 flex justify-between gap-3 flex-wrap`.

Two spans:
- `currently · interview kickstart fe program`
- `built in next.js · deployed on netlify`

## Visual contract — non-negotiables

- All copy is **lowercase** (matches Rein's existing voice across loopd / contrl / dpth)
- No emoji anywhere
- No gradients, no shadows
- All borders use `border-neutral-800` for default, `border-neutral-700` on hover
- All muted text uses `text-neutral-500`; secondary text uses `text-neutral-300` or `text-neutral-400`
- Background stays the existing `#0a0a0a` (don't override)
- Thumbnail hex colors are hardcoded — these are content, not theme tokens

## Behaviour

### Happy path
- User loads `/` → sees hero with metrics, three project cards, four-category concept grid, footer
- User clicks any concept thumbnail row → navigates via `<Link>` to the corresponding visualizer page (which keeps its existing layout including the `<Menu />` sidebar)
- User clicks loopd or contrl card → opens external URL in new tab
- User clicks travel buddy card → navigates to `/ai/helloai`
- User clicks any nav link in header (github / linkedin / email) → opens in new tab (mailto for email)
- User clicks logo from any visualizer page → navigates back to `/`

### Unhappy path
- External project URLs are placeholder (`https://loopd.app`, `https://contrl.app`) — these may 404 until Rein replaces them. That is expected; do not add validation or fallback handling.
- Binary heap visualizer is incomplete; the `wip` pill communicates this. The link still works and lands on the existing partial page.

### Weird path
- Mobile (<600px): the metric grid, project grid, and concept category grid all collapse to single column via `grid-cols-1 sm:grid-cols-N`. Skill chips already wrap. The thumbnail rows stay in single column but read fine.
- If a visualizer route is renamed in the future, only `conceptsData.tsx` needs editing — every href is centralized there.
- If a new visualizer is added, append a row to the relevant category in `conceptsData.tsx`. No other file changes needed.

## Constraints

- **Do not add new npm packages.** Everything uses what's already in the repo.
- **Do not modify** any visualizer page, the Menu component, or `globals.css`.
- **Do not delete** `src/const/sidebarNav.ts` — `<Menu />` still consumes it for visualizer pages.
- **Do not extract** the hex colors into `tailwind.config.ts`. Use Tailwind's arbitrary value syntax (`bg-[#E1F5EE]`).
- All thumbnails must be **inline SVG components** in `conceptsData.tsx`, not external image files. (Rein will swap these to `<Image>` later when real screenshots exist — keep the contract that "thumbnail is a ReactNode" so swapping is one-line per concept.)
- Use `next/link` for internal navigation, plain `<a target="_blank" rel="noopener noreferrer">` for external.
- Do not introduce client components unless required. None of these components need `"use client"` — they're all static.

## Verification

After implementing, the following should be true:

1. Running `npm run dev` and visiting `/` shows the new layout, no console errors.
2. Visiting `/sorting/selection-sort` (or any other visualizer route) still shows that visualizer with the `<Menu />` sidebar working as before.
3. Clicking the logo in the header from any visualizer page returns to `/`.
4. Resizing the browser to ~400px width: metric grid, project cards, and concept grid all collapse to single column; nothing horizontally scrolls.
5. `npm run lint` passes (note: `eslint.ignoreDuringBuilds: true` is set in `next.config.ts`, so this is a soft check, not a build blocker).
6. No file in `src/app/sorting/`, `src/app/trees/`, `src/app/graphs/`, `src/app/recursions/`, or `src/app/ai/` has been modified.

## Reference values for SVG thumbnails

Below are the exact SVG bodies for each thumbnail type. Paste them into the corresponding component in `conceptsData.tsx`. All are inside a `<svg viewBox="0 0 100 100" className="w-3/4 h-3/4">` wrapper.

**SortingThumb (selection sort example, bars=[30,50,70,40,60,20], highlight=2):**
```jsx
{bars.map((h, i) => (
  <rect
    key={i}
    x={10 + i * 14}
    y={90 - h}
    width={10}
    height={h}
    fill={i === highlight ? "#534AB7" : "#AFA9EC"}
    opacity={faded?.includes(i) ? 0.4 : 1}
  />
))}
```

Then per concept:
- selection sort: `bars=[30,50,70,40,60,20]`, `highlight=2`
- bubble sort: `bars=[35,55,45,25,65,40]`, `highlight=1`
- insertion sort: `bars=[20,40,60,70,35,50]`, `highlight=3`, `faded=[4,5]`

**MergeThumb:**
```jsx
<rect x="20" y="15" width="60" height="10" fill="#534AB7" rx="2" />
<rect x="14" y="40" width="28" height="10" fill="#AFA9EC" rx="2" />
<rect x="58" y="40" width="28" height="10" fill="#AFA9EC" rx="2" />
{[10, 26, 42, 58, 74].map((x, i) => (
  <rect key={i} x={x} y="65" width="12" height="10" fill="#AFA9EC" rx="2" opacity="0.6" />
))}
<line x1="50" y1="25" x2="28" y2="40" stroke="#AFA9EC" strokeWidth="1" opacity="0.5" />
<line x1="50" y1="25" x2="72" y2="40" stroke="#AFA9EC" strokeWidth="1" opacity="0.5" />
```

**QuickThumb:**
```jsx
{[[10, 35], [22, 25], [34, 50], [46, 70], [58, 60], [70, 40], [82, 20]].map(([x, h], i) => (
  <rect key={i} x={x} y={90 - h} width="8" height={h} fill={i === 3 ? "#534AB7" : "#AFA9EC"} />
))}
<line x1="44" y1="14" x2="56" y2="14" stroke="#534AB7" strokeWidth="1.5" />
<line x1="50" y1="10" x2="50" y2="18" stroke="#534AB7" strokeWidth="1.5" />
```

**HeapThumb:**
```jsx
<circle cx="50" cy="20" r="8" fill="#534AB7" />
<circle cx="30" cy="45" r="7" fill="#AFA9EC" />
<circle cx="70" cy="45" r="7" fill="#AFA9EC" />
<circle cx="18" cy="72" r="6" fill="#AFA9EC" />
<circle cx="42" cy="72" r="6" fill="#AFA9EC" />
<circle cx="58" cy="72" r="6" fill="#AFA9EC" />
<circle cx="82" cy="72" r="6" fill="#AFA9EC" />
<line x1="50" y1="28" x2="32" y2="40" stroke="#AFA9EC" strokeWidth="1" />
<line x1="50" y1="28" x2="68" y2="40" stroke="#AFA9EC" strokeWidth="1" />
<line x1="28" y1="51" x2="20" y2="66" stroke="#AFA9EC" strokeWidth="1" />
<line x1="32" y1="51" x2="40" y2="66" stroke="#AFA9EC" strokeWidth="1" />
<line x1="68" y1="51" x2="60" y2="66" stroke="#AFA9EC" strokeWidth="1" />
<line x1="72" y1="51" x2="80" y2="66" stroke="#AFA9EC" strokeWidth="1" />
```

**TreeThumb (binary search tree, leftLeaves=2):**
```jsx
<line x1="50" y1="22" x2="28" y2="48" stroke="#0F6E56" strokeWidth="1" />
<line x1="50" y1="22" x2="72" y2="48" stroke="#0F6E56" strokeWidth="1" />
<line x1="28" y1="52" x2="14" y2="76" stroke="#0F6E56" strokeWidth="1" />
{leftLeaves >= 2 && <line x1="28" y1="52" x2="42" y2="76" stroke="#0F6E56" strokeWidth="1" />}
<line x1="72" y1="52" x2="86" y2="76" stroke="#0F6E56" strokeWidth="1" />
<circle cx="50" cy="20" r="9" fill="#0F6E56" />
<circle cx="28" cy="50" r="8" fill="#5DCAA5" />
<circle cx="72" cy="50" r="8" fill="#5DCAA5" />
<circle cx="14" cy="78" r="7" fill="#5DCAA5" />
{leftLeaves >= 2 && <circle cx="42" cy="78" r="7" fill="#5DCAA5" />}
<circle cx="86" cy="78" r="7" fill="#5DCAA5" />
```

binary search tree uses `leftLeaves={2}`; binary heap uses `leftLeaves={1}` (it's still being built).

**NetworkThumb:**
```jsx
<line x1="25" y1="30" x2="55" y2="20" stroke="#993C1D" strokeWidth="1" />
<line x1="55" y1="20" x2="80" y2="40" stroke="#993C1D" strokeWidth="1" />
<line x1="25" y1="30" x2="35" y2="65" stroke="#993C1D" strokeWidth="1" />
<line x1="55" y1="20" x2="50" y2="55" stroke="#993C1D" strokeWidth="1" />
<line x1="80" y1="40" x2="70" y2="75" stroke="#993C1D" strokeWidth="1" />
<line x1="35" y1="65" x2="50" y2="55" stroke="#993C1D" strokeWidth="1" />
<line x1="50" y1="55" x2="70" y2="75" stroke="#993C1D" strokeWidth="1" />
<line x1="35" y1="65" x2="50" y2="85" stroke="#993C1D" strokeWidth="1" />
<circle cx="25" cy="30" r="6" fill="#D85A30" />
<circle cx="55" cy="20" r="6" fill="#993C1D" />
<circle cx="80" cy="40" r="6" fill="#D85A30" />
<circle cx="35" cy="65" r="6" fill="#D85A30" />
<circle cx="50" cy="55" r="6" fill="#D85A30" />
<circle cx="70" cy="75" r="6" fill="#D85A30" />
<circle cx="50" cy="85" r="6" fill="#D85A30" />
```

**GridThumb (25 cells in a 5×5 grid, parameterized by `pattern` array of length 25):**

Pattern character → fill:
- `e` (empty): `#F5C4B3`
- `o` (obstacle): `#444441`
- `s` (start): `#5DCAA5`
- `g` (goal): `#993C1D`
- `h` (highlighted): `#D85A30`
- `p` (path/visited): `#F5C4B3`

```jsx
<g stroke="#D85A30" strokeWidth="0.5">
  {pattern.map((cell, i) => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    const x = 15 + col * 14;
    const y = 15 + row * 14;
    const fillMap = { e: "#F5C4B3", p: "#F5C4B3", o: "#444441", s: "#5DCAA5", g: "#993C1D", h: "#D85A30" };
    return <rect key={i} x={x} y={y} width="14" height="14" fill={fillMap[cell]} />;
  })}
</g>
```

Per-concept patterns (read row by row, top to bottom):

grid diagram (BFS/DFS, with obstacles):
```
e e g e e
h o h e e
h o e o h
e h h h e
e e s e e
```

shortest path (dijkstra, with path traced):
```
s p e e e
e p p e e
e e p p e
e e e p p
e e e e g
```

**RiverThumb:**
```jsx
<rect x="10" y="20" width="35" height="60" fill="#9FE1CB" rx="2" />
<rect x="55" y="20" width="35" height="60" fill="#5DCAA5" opacity="0.3" rx="2" />
<line x1="48" y1="15" x2="48" y2="85" stroke="#85B7EB" strokeWidth="6" strokeDasharray="3 3" />
<line x1="52" y1="15" x2="52" y2="85" stroke="#85B7EB" strokeWidth="6" strokeDasharray="3 3" />
<circle cx="22" cy="35" r="5" fill="#0F6E56" />
<circle cx="33" cy="35" r="5" fill="#444441" />
<rect x="60" y="46" width="22" height="8" fill="#854F0B" rx="2" />
<circle cx="22" cy="65" r="5" fill="#0F6E56" />
<circle cx="33" cy="65" r="5" fill="#854F0B" />
```

**RecursionThumb (count subsets, withLabels=false):**
```jsx
<line x1="50" y1="18" x2="25" y2="38" stroke="#993556" strokeWidth="0.8" />
<line x1="50" y1="18" x2="75" y2="38" stroke="#993556" strokeWidth="0.8" />
<line x1="25" y1="42" x2="14" y2="62" stroke="#993556" strokeWidth="0.8" />
<line x1="25" y1="42" x2="36" y2="62" stroke="#993556" strokeWidth="0.8" />
<line x1="75" y1="42" x2="64" y2="62" stroke="#993556" strokeWidth="0.8" />
<line x1="75" y1="42" x2="86" y2="62" stroke="#993556" strokeWidth="0.8" />
<circle cx="50" cy="16" r="5" fill="#993556" />
<circle cx="25" cy="40" r="4" fill="#D4537E" />
<circle cx="75" cy="40" r="4" fill="#D4537E" />
<circle cx="14" cy="64" r="3.5" fill="#D4537E" />
<circle cx="36" cy="64" r="3.5" fill="#D4537E" />
<circle cx="64" cy="64" r="3.5" fill="#D4537E" />
<circle cx="86" cy="64" r="3.5" fill="#D4537E" />
```

**RecursionThumb (fibonacci, withLabels=true)** — same shape but slightly tighter, with text inside top three nodes:
```jsx
<line x1="50" y1="18" x2="32" y2="38" stroke="#993556" strokeWidth="0.8" />
<line x1="50" y1="18" x2="68" y2="38" stroke="#993556" strokeWidth="0.8" />
<line x1="32" y1="42" x2="20" y2="62" stroke="#993556" strokeWidth="0.8" />
<line x1="32" y1="42" x2="44" y2="62" stroke="#993556" strokeWidth="0.8" />
<line x1="68" y1="42" x2="56" y2="62" stroke="#993556" strokeWidth="0.8" />
<line x1="68" y1="42" x2="80" y2="62" stroke="#993556" strokeWidth="0.8" />
<circle cx="50" cy="16" r="6" fill="#993556" />
<text x="50" y="19" textAnchor="middle" fontSize="7" fill="#FBEAF0" fontWeight="500">5</text>
<circle cx="32" cy="40" r="5" fill="#D4537E" />
<text x="32" y="43" textAnchor="middle" fontSize="6" fill="#FBEAF0" fontWeight="500">4</text>
<circle cx="68" cy="40" r="5" fill="#D4537E" />
<text x="68" y="43" textAnchor="middle" fontSize="6" fill="#FBEAF0" fontWeight="500">3</text>
<circle cx="20" cy="64" r="4" fill="#ED93B1" />
<circle cx="44" cy="64" r="4" fill="#ED93B1" />
<circle cx="56" cy="64" r="4" fill="#ED93B1" />
<circle cx="80" cy="64" r="4" fill="#ED93B1" />
```
