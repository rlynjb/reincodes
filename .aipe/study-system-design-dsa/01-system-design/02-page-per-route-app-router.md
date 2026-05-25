# Page-per-route App Router

**Industry name(s):** File-system routing, file-based routing, convention-over-configuration routing
**Type:** Industry standard · Language-agnostic

> Every URL the user can land on is a `page.tsx` file at the matching path under `src/app/`; the folder layout *is* the router config.

**See also:** → [01-static-export-architecture.md](./01-static-export-architecture.md) · → [03-client-component-boundary.md](./03-client-component-boundary.md)

---

## Why care

#### Move 1 — The grounded scenario

You've written this in a React app before:

```ts
<Routes>
  <Route path="/sorting/bubble-sort" element={<BubbleSort />} />
  <Route path="/sorting/insertion-sort" element={<InsertionSort />} />
  <Route path="/sorting/quick-sort" element={<QuickSort />} />
  // ... 17 more lines
</Routes>
```

The component tree, the route table, and the imports all live in different files. Adding a new page means editing three places: create `QuickSort.tsx`, import it in the router file, add a `<Route>` line. Forget any of the three and you ship a broken link. The router file becomes the only file that knows the shape of the URL space.

Now picture the same app where you create a folder, drop a `page.tsx` inside, and the URL works. No imports, no route table, no third file. The folder *is* the route.

#### Move 2 — Name the question (or job) the pattern answers

The question is: *what is the source of truth for the URL space?* The answer in this codebase is the file system. Next.js's App Router treats `src/app/<path>/page.tsx` as a declaration — the path of the folder is the URL, and the default export of `page.tsx` is the component the URL renders. There is no central route table to maintain. Adding a route is creating a folder.

#### Move 3 — Why answering that question matters

**What depends on the answer:** the cost of adding a new visualizer. The visualizer set in this codebase grows — bubble-sort, then insertion-sort, then heap-sort, then BST, then Dijkstra. With a central route table, each addition touches the table; with file-based routing, each addition is a folder. Multiply that by the four visualizer families (sorting, trees, recursions, graphs) and the cost of consistency dominates. The codebase enforces a shape — one folder per visualizer family, one folder per algorithm, one `page.tsx` inside — because the file system is already enforcing the URL shape.

The second thing it depends on: *where does the page logic live?* If the URL `/sorting/bubble-sort` maps to a component imported from somewhere arbitrary, the reader has to chase the import to find the code. If the URL maps to `src/app/sorting/bubble-sort/page.tsx` deterministically, the reader can navigate to the file by typing the URL.

#### Move 4 — Concrete before/after

With a central route table (`react-router-dom`):

- Add a new sort → create `MergeSort.tsx`, import in `App.tsx`, add `<Route path="/sorting/merge-sort" element={<MergeSort />} />`
- Find the page for `/sorting/heap-sort` → search the route table for the path string, follow the imported component name to its file
- Rename a route → change the path string in the route table; the component file name and location stay the same

With file-based routing (App Router):

- Add a new sort → create `src/app/sorting/merge-sort/page.tsx`. Done.
- Find the page for `/sorting/heap-sort` → open `src/app/sorting/heap-sort/page.tsx`. The URL and the file path are the same string.
- Rename a route → rename the folder. There is no other place the route is named.

#### Move 5 — The one-line summary

File-based routing in the App Router is the assertion that the folder structure is the router — `src/app/sorting/bubble-sort/page.tsx` *is* the route for `/sorting/bubble-sort`, with no other config involved.

---

## How it works

### Move 1 — The mental model

The mental model is one rule the framework enforces: any folder with a `page.tsx` is a route. The folder path is the URL. That's it.

```
src/app/                                     URL space
─────────                                    ─────────
src/app/page.tsx              ─────▶        /
src/app/sorting/              ─────▶        /sorting        (no page.tsx → no route)
  layout.tsx                                 (wraps children)
  bubble-sort/page.tsx        ─────▶        /sorting/bubble-sort
  insertion-sort/page.tsx     ─────▶        /sorting/insertion-sort
  heap-sort/page.tsx          ─────▶        /sorting/heap-sort
src/app/trees/
  binary-search-tree/page.tsx ─────▶        /trees/binary-search-tree
src/app/recursions/
  fibonacci-numbers/page.tsx  ─────▶        /recursions/fibonacci-numbers
src/app/graphs/
  network/page.tsx            ─────▶        /graphs/network
```

The underlying strategy is *convention over configuration* — the framework decides what counts as a route by reading the file system, so you don't have to declare it.

### Move 2 — The layered walkthrough

**The `page.tsx` convention**

A folder under `src/app/` becomes a route the moment it contains a file literally named `page.tsx`. The default export of that file is the React component the route renders. Sibling files in the same folder are *not* routes — `data.ts`, `helpers.ts`, `Visualizer.tsx`, all invisible to the router.

If you're coming from Pages Router or Vue Router or React Router, the contract is the same shape but the convention is stricter. In Pages Router, any `.tsx` file under `pages/` is a route. In App Router, only files named exactly `page.tsx` are. That naming rule is what lets you co-locate route-private helpers next to the page without polluting the URL space.

```
src/app/sorting/bubble-sort/
├── page.tsx          ◀── this is the route
├── helpers.ts        ◀── invisible to router, but importable
├── styles.module.css ◀── invisible to router

URL: /sorting/bubble-sort
```

The practical consequence: a visualizer page can break itself into multiple files — the page component, its helpers, its local types — and only the file with the magic name is exposed as a URL. Nothing is leaked.

**Nested folders → nested URL segments**

The path from `src/app/` to `page.tsx` is the URL. `src/app/sorting/bubble-sort/page.tsx` means the URL is `/sorting/bubble-sort`. There is no other transformation step. The string is the string.

```
file path                                          URL
─────────────────────────────────────────────────  ────────────────────────
src/app/page.tsx                                   /
src/app/sorting/bubble-sort/page.tsx               /sorting/bubble-sort
src/app/trees/binary-search-tree/page.tsx          /trees/binary-search-tree
src/app/graphs/finding-shortest-path/page.tsx      /graphs/finding-shortest-path
src/app/recursions/n-choose-k/page.tsx             /recursions/n-choose-k
```

The practical consequence: routes are organized the way humans organize them in conversation. The reader who asks "where's the heap-sort page?" can find it by typing `src/app/sorting/heap-sort/page.tsx` — same as the URL. This makes the codebase grep-friendly and pattern-friendly.

**`layout.tsx` wraps siblings**

A folder can also hold a `layout.tsx`. It wraps every `page.tsx` and every child folder's pages. The root `src/app/layout.tsx` wraps the entire app — that's where the `<html>` and `<body>` tags, the global header, the fonts, and the sticky nav live.

If you're coming from React, you've seen `<App>` wrapping `<Routes>` in a router setup — a single top-level shell every route renders into. App Router formalizes this as a per-folder file. The root layout is required; nested layouts are optional.

```
                  url: /sorting/bubble-sort

src/app/layout.tsx        ─── <html>, <body>, header, fonts
  src/app/sorting/layout.tsx  ─── pass-through wrapper here
    src/app/sorting/bubble-sort/page.tsx  ─── the actual visualizer
```

In this codebase, `src/app/sorting/layout.tsx` is a pass-through:

```ts
export default function SortingLayout({ children }) {
  return <>{children}</>;
}
```

It exists but does nothing. That's intentional — App Router can be configured to require a `layout.tsx` per route group, and the empty wrapper satisfies the requirement without imposing visual structure. If a future feature wanted "show the same toolbar above every sort visualizer," this file is where it goes.

**Routes the framework's discovered get pre-rendered**

Because the app is in static-export mode, every route Next.js discovers from the file system gets pre-rendered into HTML at build time. The router doesn't run at request time — the URL is satisfied by a file on disk in `out/`.

```
build step                          out/ directory                        URL served
──────────                          ───────────────────                   ──────────
walk src/app/ → find every  ──▶    out/index.html                ──▶    /
page.tsx                            out/sorting/bubble-sort/      ──▶    /sorting/bubble-sort
                                      index.html
                                    out/trees/binary-search-      ──▶    /trees/binary-search-tree
                                      tree/index.html
                                    ...

trailingSlash: true means /index.html files at every folder
```

The practical consequence: if a route is meant to exist, its file must be findable by the framework's static analysis pass. Dynamic route imports (`import(`./pages/${name}`)`) wouldn't be discoverable, so they wouldn't be exported. The static-export constraint and the file-based routing convention reinforce each other — both demand that routes be statically known.

### Move 3 — The principle

File-based routing exemplifies *making the system's shape visible in the file system itself.* The route map isn't hidden behind a router config you have to read; it's the folder tree you see in your editor. The cost is locking you into the convention — you can't rename a route without renaming a folder, and you can't share a component across routes without importing it explicitly. The win is that anyone who reads the directory listing has read the route table.

The full picture is below.

---

## Page-per-route App Router — diagram

```
┌─ File system (src/app/) ──────────────────────────────────────────────────┐
│                                                                           │
│   layout.tsx                ─── wraps everything                          │
│   page.tsx                  ─── /                                         │
│                                                                           │
│   sorting/                                                                │
│     layout.tsx              ─── wraps /sorting/*                          │
│     bubble-sort/page.tsx    ─── /sorting/bubble-sort                      │
│     insertion-sort/page.tsx ─── /sorting/insertion-sort                   │
│     selection-sort/page.tsx ─── /sorting/selection-sort                   │
│     merge-sort/page.tsx     ─── /sorting/merge-sort                       │
│     quick-sort/page.tsx     ─── /sorting/quick-sort                       │
│     heap-sort/page.tsx      ─── /sorting/heap-sort                        │
│                                                                           │
│   trees/                                                                  │
│     binary-search-tree/page.tsx                                           │
│     binary-heap/page.tsx                                                  │
│                                                                           │
│   recursions/                                                             │
│     fibonacci-numbers/page.tsx                                            │
│     n-choose-k/page.tsx                                                   │
│     count-all-subsets/page.tsx                                            │
│                                                                           │
│   graphs/                                                                 │
│     network/page.tsx                                                      │
│     grid/page.tsx                                                         │
│     finding-shortest-path/page.tsx                                        │
│     river-crossing-puzzle/page.tsx                                        │
│                                                                           │
└──────────────────────────────────│────────────────────────────────────────┘
                                   │ next build (static export)
                                   ▼
┌─ out/ directory ──────────────────────────────────────────────────────────┐
│                                                                           │
│   one index.html per page.tsx, at the matching path                       │
│                                                                           │
│   out/sorting/bubble-sort/index.html                                      │
│   out/sorting/insertion-sort/index.html                                   │
│   out/trees/binary-search-tree/index.html                                 │
│   ... etc                                                                 │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Canonical visualizer page**
**File:** `src/app/sorting/bubble-sort/page.tsx`
**Function / class:** `BubbleSort` (default export)
**Line range:** L1–L129

The route `/sorting/bubble-sort` (or `/reincodes/sorting/bubble-sort/` in prod) is rendered entirely by the default export of this file. The component opens with `"use client"` (L1), pulls in shared utilities and components (L3–L14), then owns its full state and animation loop.

**Per-family layout**
**File:** `src/app/sorting/layout.tsx`
**Function / class:** `SortingLayout` (default export)
**Line range:** L1–L11

A pass-through wrapper for every sort page. Currently does nothing structural — exists so the route group has a layout file in case a future feature wants to wrap all sort pages.

**Root layout**
**File:** `src/app/layout.tsx`
**Function / class:** `RootLayout` (default export)
**Line range:** L21–L65

Wraps every page in the app — `<html>`, `<body>`, fonts, the sticky header with github/linkedin/email links, the 720px-wide main column.

**Route inventory (all `page.tsx` files):**

```
src/app/page.tsx                                  → /
src/app/sorting/{bubble,insertion,selection,
                 merge,quick,heap}-sort/page.tsx  → /sorting/*-sort   (6 routes)
src/app/trees/{binary-search-tree,
               binary-heap}/page.tsx              → /trees/*          (2 routes)
src/app/recursions/{fibonacci-numbers,
                    n-choose-k,
                    count-all-subsets}/page.tsx   → /recursions/*     (3 routes)
src/app/graphs/{network,grid,
                finding-shortest-path,
                river-crossing-puzzle}/page.tsx   → /graphs/*         (4 routes)
```

---

## Elaborate

### Where this pattern comes from

File-based routing was popularised by Next.js around 2017 (Pages Router) as a reaction to the boilerplate of `react-router-dom` route tables. Sapper, SvelteKit, Nuxt, Remix, Astro all adopted the same convention through the late 2010s and early 2020s. App Router (Next.js 13, 2022) was the second-generation refinement — same file-based routing, but with conventions for layouts, loading states, error boundaries, and explicit `page.tsx` naming to allow route-private files.

### The deeper principle

The deeper principle is *the file system is a database the team already knows how to navigate.* Routes are records; folders are tables; the URL is the primary key. Any IDE can browse it; any developer can read it; renaming is a filesystem operation. The tradeoff is the loss of programmatic flexibility — you cannot generate routes at runtime — but that loss only matters when routes themselves are data, which they rarely are.

```
Central route table                File-based routing
──────────────────                 ──────────────────
src code:                          src code:
  routes.ts:                         src/app/sorting/
    [ {path: '/sort', ...},            bubble-sort/
      {path: '/tree', ...},            tree/
      ...                              ...

source of truth: routes.ts         source of truth: folder structure
add route: 3 edits                 add route: 1 mkdir + 1 file
```

### Where this breaks down

File-based routing breaks when routes need to be generated dynamically — a multi-tenant app where each tenant has a custom set of routes, an admin tool where routes come from a database, an app that A/B-tests entirely different page trees. It also breaks when the convention starts fighting you: deeply nested route groups (`(auth)/(account)/(billing)/page.tsx`) become hard to read, and parallel routes (App Router's `@modal/` slots) push the convention past where most teams stay comfortable. The convention is at its strongest when routes are stable, known at build time, and few enough to fit in one screen of the file tree.

### What to explore next

- Dynamic route segments (`[id]/page.tsx`) → file-based routing for routes whose path includes a parameter, used everywhere outside this codebase
- Route groups (`(group)/`) → folder name in parens that doesn't show up in the URL; lets you organise the file tree without changing the URL space
- Parallel routes (`@slot/`) → renders multiple sibling routes into one layout simultaneously, App Router's most advanced routing feature
- Middleware → the App Router escape hatch for "I do need to run something per request" — useful when adding auth, but breaks static export

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌─────────────────────┬───────────────────────────┬───────────────────────────┐
│ Cost dimension      │ File-based (taken)        │ Centralized route table   │
├─────────────────────┼───────────────────────────┼───────────────────────────┤
│ Add a route         │ 1 mkdir + 1 file          │ 1 file + 1 import +       │
│                     │                           │   1 route entry           │
│ Find a route's code │ navigate to URL path      │ search route table,       │
│                     │ in file tree              │ follow import             │
│ Rename a route      │ rename folder             │ edit path string          │
│ Share logic across  │ explicit import           │ shared component prop     │
│ pages               │                           │                           │
│ Programmatic        │ impossible (build-time)   │ trivial — routes are      │
│ route gen           │                           │ just data                 │
│ Discoverability     │ entire route map visible  │ requires reading one file │
│                     │ in file explorer          │                           │
│ Cognitive load      │ low if shallow, high if   │ medium constant —         │
│                     │ deeply nested with        │ route table grows         │
│                     │ groups                    │ linearly                  │
│ Onboarding          │ "the folder is the URL"   │ "open routes.ts, read     │
│                     │ — one sentence            │ the table"                │
└─────────────────────┴───────────────────────────┴───────────────────────────┘
```

### Sub-block 1 — what we gave up

The first thing gone is *runtime route generation*. A future feature like "generate a visualizer page per user-uploaded dataset" cannot exist under file-based routing — the routes have to be in the file tree at build time. The way the static-export contract reinforces this is convenient: both constraints want the same thing, so neither feels like it's fighting the other.

The second thing gone is *easy programmatic introspection of the route space*. To list every URL the site exposes, you read the file tree or call into Next.js's internal route discovery. There's no `routes` array you can import and map over. For this codebase that's fine — the route count is small and bounded. For a larger app with sitemap generation or admin tooling, the missing introspection would mean reaching for a build-time script that walks the file tree manually.

The third cost is *deep nesting becomes punishing*. A route at `src/app/(public)/(marketing)/sorting/bubble-sort/page.tsx` is harder to read in the file tree than its URL would suggest, especially when the parenthesised groups aren't visible in the URL. This codebase stays at two or three levels deep, so the cost doesn't bite — but it's a real one as soon as route groups appear.

### Sub-block 2 — what the alternative would have cost

If this had been a CRA-style SPA with `react-router-dom`, every new visualizer would have been three edits instead of two — create the component file, import it in the router file, add a `<Route>` entry. With 15 visualizers, that's 45 edits made instead of 15 mkdirs + 15 page.tsx files. The cumulative cost is small per route but compounds for a hobby project where the bottleneck is friction, not complexity.

More importantly, the central route table would have become a coordination point in a way the file tree doesn't. Renaming `/sorting/bubble-sort` to `/sorts/bubble` means editing the path in the route table *and* moving the component file — and you have to remember both. With file-based routing, you rename the folder and the URL changes; there's no second step to forget.

The alternative would also have made it easier to gate routes — "this route requires auth" is one if-check in a route guard. File-based routing pushes that to middleware or layout-level checks, which is fine when there are no auth needs, costly when there are.

### Sub-block 3 — the breakpoint

File-based routing stops being the right call when the route count exceeds ~50–100 stable routes (the file tree becomes hard to scan) or when routes need to be generated at runtime (entire CMS-driven sites, admin tools where routes come from config). Below ~50 stable, build-time-known routes, file-based routing is strictly easier than a route table. This codebase has fewer than 20 routes and is solidly in the comfortable range.

### Sub-block 4 — what wasn't actually a tradeoff

Pages Router was not a meaningfully different choice for this codebase. Both file-based, both work with static export. The App Router was picked because it's the default for `create-next-app` in Next.js 15, not because the codebase needs server components or streaming — neither of which is reachable under static export.

### Tone

File-based routing is the right call when the route space is small and stable. This codebase pays nothing for the choice and gets one line per route instead of three; it would make the same call again.

---

## Tech reference (industry pairing)

### Next.js App Router

- **Codebase uses:** Next.js 15.5.15 App Router. Routes under `src/app/**/page.tsx`; root layout at `src/app/layout.tsx`; one pass-through `layout.tsx` at `src/app/sorting/`.
- **Why it's here:** the routing layer for the entire site. Without it, every visualizer would need to be wired into a route table by hand.
- **Leading today:** Next.js App Router — adoption-leading for new React apps, 2026.
- **Why it leads:** convention-over-configuration routing with first-class layouts, loading boundaries, and error boundaries; same file convention works for SSR, SSG, and static export.
- **Runner-up:** Remix / React Router 7 — innovation-leading for the data-loader-first crowd; routes still file-based, but data fetching is co-located via `loader` exports rather than React Server Components.

### `next/link` for internal navigation

- **Codebase uses:** `<Link href="/sorting/bubble-sort">` in `src/components/Home/Concepts.tsx` L19–L21 and `src/app/layout.tsx` L34–L42.
- **Why it's here:** prepends `basePath` automatically and uses client-side navigation instead of full-page reloads. Hardcoded `<a href="/sorting/bubble-sort">` would 404 in prod because it skips the `/reincodes` prefix.
- **Leading today:** `next/link` — adoption-leading inside the Next.js ecosystem, 2026.
- **Why it leads:** zero-config integration with the basePath, automatic prefetching of routes likely to be visited next, no extra setup.
- **Runner-up:** TanStack Router — innovation-leading for type-safe routing in any React app; routes-as-objects with full type inference for params, used in non-Next.js projects.

### File-system routing convention itself

- **Codebase uses:** the `src/app/<path>/page.tsx` convention enforced by Next.js. No central route table file exists; the file tree is the only declaration.
- **Why it's here:** the URL space and the directory structure are kept in sync without manual coordination.
- **Leading today:** file-based routing — adoption-leading across all major full-stack JS frameworks, 2026 (Next.js, Remix, SvelteKit, Nuxt, Astro all use it).
- **Why it leads:** convergent industry choice — once Next.js Pages Router validated the pattern, every framework that came after copied it. New developers expect it.
- **Runner-up:** none in mainstream frameworks. Centralised route tables (`react-router-dom`'s `createBrowserRouter`) are still used in CRA-era SPAs, but no new framework picks them as the default.

---

## Summary

### Part 1 — concept recap

Page-per-route App Router is the convention that every URL in this app maps to a file at `src/app/<path>/page.tsx`, with no central route table. In this codebase, the four visualizer families (sorting, trees, recursions, graphs) are folders under `src/app/`, each containing one folder per algorithm, each containing one `page.tsx`. The constraint that made it the right call is the route count: small, stable, and known at build time, which is exactly the regime where file-based routing pays back. The cost is rigidity — routes can't be generated at runtime — but this codebase doesn't need that capability.

### Part 2 — key points to remember

- This pattern lives in checklist step 2 (**Request / response flow**) — the URL-to-component mapping is the first hop of every page request.
- The folder path is the URL string, character for character; `src/app/sorting/bubble-sort/page.tsx` *is* the route for `/sorting/bubble-sort`.
- Only files literally named `page.tsx` become routes; siblings (`helpers.ts`, `Visualizer.tsx`) are invisible to the router, which lets you co-locate route-private code.
- `layout.tsx` files wrap every page in their folder and below; the root layout at `src/app/layout.tsx` carries the global shell.
- Adding a new visualizer is one folder + one file; no route table to maintain.
- Pairs with static export — both demand routes be known at build time, so neither constraint fights the other.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about file-based routing, they're checking whether you understand the convention or just followed it because the framework forced you to. The answer they want shows you can name the alternative (a central route table), name what file-based routing costs, and name the regime where it pays off — small, stable, build-time-known route spaces.

### Likely questions

[mid] Q: How does Next.js know what URL `src/app/sorting/bubble-sort/page.tsx` corresponds to?

A: The App Router walks the `src/app/` directory at build time, looks for files named exactly `page.tsx`, and maps the folder path of each one to the URL path. So `src/app/sorting/bubble-sort/page.tsx` becomes `/sorting/bubble-sort`. The naming is strict — only `page.tsx` (and `layout.tsx`, `loading.tsx`, `error.tsx`) have special meaning. Other files in the folder are just regular modules that the page can import.

Diagram:
```
build-time discovery

src/app/                                URL space
─────────                               ─────────
walk dirs ──▶ find page.tsx ──▶ map folder path → URL

src/app/sorting/bubble-sort/page.tsx    →    /sorting/bubble-sort
src/app/sorting/heap-sort/page.tsx      →    /sorting/heap-sort
src/app/page.tsx                        →    /
```

[senior] Q: When would you reach for `react-router-dom`'s route table instead of file-based routing?

A: When routes are *data*, not structure. If route definitions come from a database, a feature flag, or per-tenant config, a central route table is the right shape because routes are values you compute, not folders you create. For a portfolio site with maybe twenty stable routes known at code time, file-based wins on every dimension — discoverability, friction of adding routes, alignment with editor navigation. The breakpoint is when routes start moving faster than commits.

Diagram:
```
Route source             Right routing shape
────────────             ───────────────────
folders in repo    ──▶   file-based
config / DB rows   ──▶   central table
remote / per user  ──▶   central table + dynamic loader
```

[arch] Q: If this codebase grew to 500 visualizers, what breaks first about file-based routing?

A: Two things degrade together. The file tree becomes hard to scan in any IDE — 500 folders under `src/app/sorting/` doesn't fit a sidebar, so navigation slows. Second, `next build` time grows linearly with route count under static export; 500 routes pre-rendered probably pushes build time past two or three minutes, slowing the CI feedback loop. Neither is a hard failure — the routing convention still works — but the friction crosses a threshold. The fix is route groups (`(sorting-a-l)`, `(sorting-m-z)`) to subdivide the tree, or dynamic routes (`[algorithm]/page.tsx`) with a data file driving them. The latter sacrifices the "URL is the file path" property in exchange for one shared page component.

Diagram:
```
What scales with route count

┌─ Visible (linear) ───────────────────────────────────┐
│   IDE file tree height         ▲ 20 routes: fine     │
│                                  500 routes: scroll  │
└──────────────────────────────────────────────────────┘
┌─ Hidden (linear, until it's not) ────────────────────┐
│   next build time              ▲ 20 routes: 30s      │
│                                  500 routes: 3min+   │
│   out/ artifact size           ▲ grows linearly      │
└──────────────────────────────────────────────────────┘
┌─ Stable (constant) ──────────────────────────────────┐
│   per-route cognitive load     ▲ each route still    │
│                                  fits on one screen  │
└──────────────────────────────────────────────────────┘
```

### The question candidates always dodge

Q: Why are there folders like `src/app/sorting/layout.tsx` that just pass children through? Isn't that pointless?

A: It looks pointless and there's an honest version of "it is, at the moment." The file currently does nothing structural — it's a fragment wrapping `children`. But it's also a placeholder that means a future change like "show a shared toolbar above all sorting visualizers" has a single landing place. The cost of leaving it in is one file containing six lines; the cost of leaving it out is that the first future feature wanting to wrap the sort pages has to introduce both the file *and* the change at the same time, which mixes a structural commit with a feature commit. I'd rather pay six lines now to avoid that. If the project stays small enough that no sort-family layout is ever added, the file is dead weight — and that's the worst case.

Diagram:
```
With the empty layout.tsx        Without it
─────────────────────            ─────────────────────
src/app/sorting/                 src/app/sorting/
  layout.tsx ◀── pass-through      bubble-sort/page.tsx
  bubble-sort/page.tsx             ...
  ...
                                 first sort-wide feature
first sort-wide feature          ─────────────────────
─────────────────────            adds layout.tsx + the
edit layout.tsx                  feature in one commit
                                 (mixed concerns)
```

### One-line anchors

- "The folder is the URL — `src/app/sorting/bubble-sort/page.tsx` is the route for `/sorting/bubble-sort`."
- "Adding a route is one `mkdir` and one file; there's no central table to coordinate."
- "Only files named `page.tsx` become routes, so route-private helpers can live next to the page without leaking into the URL space."
- "File-based routing pays off when routes are small, stable, and known at build time — which is exactly this codebase."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On paper, list five routes the site has and write their corresponding `page.tsx` file paths. Then sketch the full tree under `src/app/` from memory — top-level folders only.

Open the file and compare against the *Page-per-route App Router — diagram* section.

- Pass: you got the four visualizer families (sorting, trees, recursions, graphs) and the page-to-URL mapping rule
- Fail: re-read Move 2 and the codebase route inventory, then try again

### Level 2 — Explain it out loud

Explain file-based routing to a colleague who's only worked with `react-router-dom`. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the specific convention (folder path = URL, file must be `page.tsx`)?
- Reference `src/app/sorting/bubble-sort/page.tsx` as a worked example?
- Name the tradeoff in one sentence (no runtime route generation)?

### Level 3 — Apply it to a new scenario

You want to add a new visualizer at `/algorithms/string-search/kmp`. What exactly do you create, where, and how do you link to it from the home page?

Write your answer (3–5 sentences), then open `src/components/Home/conceptsData.tsx` and check how existing visualizers register themselves in the link grid.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: *no runtime route generation*. Answer in writing:

"If this site grew to include user-submitted visualizers — each user's submission gets a URL — would file-based routing still work? What would the data flow have to look like instead?"

Reference `src/app/` structure and `next.config.ts` static export contract to support your answer.

### Quick check — code reference test

Without opening any files, answer:
- What file holds the route for `/trees/binary-search-tree`?
- What file wraps every page in the site with the header, fonts, and 720px column?
- What's the file name an App Router folder must contain to become a route?

Then open the files and verify.
