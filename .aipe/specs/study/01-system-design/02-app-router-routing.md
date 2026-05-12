# File-based routing with the App Router

**Industry name(s):** File-system routing, App Router, convention-over-configuration routing
**Type:** Industry standard

> Every URL on the site comes from a `page.tsx` file at a corresponding path under `src/app/` — there is no explicit route table to maintain.

**See also:** → [01-static-export-spa](./01-static-export-spa.md) · → [03-client-component-islands](./03-client-component-islands.md) · → [04-component-composition](./04-component-composition.md)

---

## Why care

Most folder structures are decorative — moving a file doesn't change what users see. File-based routing inverts that: the folder is the URL. Rename `sorting/` to `sort/` and every link on the site has to update; that's the cost of the convention, but the benefit is that you never write a route table that drifts from the file system.

This is **convention-over-configuration routing**, the same idea you've seen in Ruby on Rails routing, Next.js' Pages Router, SvelteKit, Remix, Astro, Nuxt, and others. The framework reads a directory tree and turns each leaf into a URL. Here's how that actually works in this codebase.

---

## How it works

Think of it like a museum where every painting has a sign that doubles as the address. To find a painting you walk to the address; to move a painting you take the sign with you. There's no separate catalog — the placement *is* the catalog. That's what `src/app/` is.

### The folder-to-URL mapping

In the App Router, `src/app/<segments>/page.tsx` becomes `/<segments>/`. **If you're coming from frontend, you're used to a router config file that says `<Route path="/sorting/bubble-sort" element={<BubbleSort/>} />` — here it's different: the file path itself is the route, and the framework discovers routes by walking the tree.**

```
src/app/                                     URL
├─ page.tsx                                  /
├─ sorting/
│  ├─ layout.tsx                             (wraps every /sorting/* page)
│  ├─ bubble-sort/page.tsx                   /sorting/bubble-sort/
│  ├─ insertion-sort/page.tsx                /sorting/insertion-sort/
│  └─ merge-sort/page.tsx                    /sorting/merge-sort/
├─ trees/
│  ├─ binary-search-tree/page.tsx            /trees/binary-search-tree/
│  └─ binary-heap/page.tsx                   /trees/binary-heap/
└─ graphs/
   └─ finding-shortest-path/page.tsx         /graphs/finding-shortest-path/
```

The practical consequence: if you want a new visualizer at `/sorting/radix-sort`, you make a folder `src/app/sorting/radix-sort/` and put a `page.tsx` in it. No router config edit. The framework finds the file at build time and emits `/sorting/radix-sort/index.html` to `./out/`.

This works as long as you follow the naming conventions. The reserved files are `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, `route.ts`. Anything else (`utils.ts`, `data.ts`, even a `components/` folder) is invisible to the router and just lives alongside the route.

### Nested layouts that wrap groups of routes

`src/app/sorting/layout.tsx` exists in this codebase and wraps every page under `/sorting/*`. **This is like React Router's nested `<Outlet />` — except the layout file is implicit because of where it sits in the folder.** When `next build` produces `out/sorting/bubble-sort/index.html`, the HTML is the result of nesting: `RootLayout(SortingLayout(BubbleSortPage()))`. Each layout receives `children` and renders them inside whatever shell it provides.

```
Request /sorting/bubble-sort/
                  │
                  ▼
        src/app/layout.tsx (RootLayout)
                  │  renders <html><body>...header...{children}</body></html>
                  ▼
        src/app/sorting/layout.tsx (SortingLayout)
                  │  renders sort-section-specific shell + {children}
                  ▼
        src/app/sorting/bubble-sort/page.tsx (BubbleSort)
                  │  renders the actual bubble-sort visualizer
                  ▼
                HTML
```

The boundary condition: each layout's `children` prop is the *direct* nested route's render, not the entire downstream tree as a single component. That matters because layouts can persist across navigations between sibling routes — but in static export everything is rebuilt per route so the optimisation matters less here.

### Co-located styles, utils, and components

Look at `src/app/graphs/finding-shortest-path/`:

```
finding-shortest-path/
├─ page.tsx       ← the route
└─ styles.css     ← page-specific CSS, imported at the top of page.tsx
```

**Think of it like a CSS module — but you can put anything route-specific next to the route, and the router ignores it.** The router only treats `page.tsx` as the entry point; `styles.css` is a regular import. This is how the codebase keeps per-visualizer CSS (grid styling, transitions) next to the page it belongs to instead of in a global stylesheet.

### What about dynamic routes?

Dynamic segments use `[param]` folder names: `src/app/posts/[slug]/page.tsx` would match `/posts/anything/`. **This codebase doesn't use dynamic routes** — every URL is hand-authored and known at build time. That's because (a) the content is hand-curated (six sort algorithms, not a CMS), and (b) `output: "export"` requires that every dynamic route can be enumerated via `generateStaticParams` at build, which is more ceremony than the content justifies here.

### The principle

This is what frameworks mean by "convention over configuration": the framework picks one way to do a thing, and you don't argue with it. The win is uniformity — every Next.js project organises routes the same way, so a new contributor can find any URL by reading the folder tree. The cost is that the convention has to fit your problem; the moment you want routes that don't fit the file-tree shape (truly dynamic paths, multi-tenant subdomain routing), you end up fighting the framework. For this codebase the convention fits perfectly: every URL is a hand-built visualizer.

The full picture is below.

---

## App Router routing — diagram

```
┌─ Source layout (src/app/) ────────────────┐
│                                           │
│  src/app/                                 │
│  ├─ layout.tsx       ← global shell       │
│  ├─ page.tsx         ← /                  │
│  ├─ sorting/                              │
│  │  ├─ layout.tsx    ← /sorting/* shell   │
│  │  ├─ bubble-sort/page.tsx               │
│  │  ├─ quick-sort/page.tsx                │
│  │  └─ ...                                │
│  ├─ trees/                                │
│  │  ├─ binary-search-tree/                │
│  │  │  ├─ page.tsx                        │
│  │  │  └─ styles.css                      │
│  │  └─ binary-heap/page.tsx               │
│  ├─ recursions/                           │
│  └─ graphs/                               │
│                                           │
└───────────────────────────────────────────┘
                  │
                  ▼  next build (output: "export")
                  │
┌─ Build output (./out/) ───────────────────┐
│                                           │
│  out/                                     │
│  ├─ index.html                            │
│  ├─ sorting/                              │
│  │  ├─ bubble-sort/index.html             │
│  │  ├─ quick-sort/index.html              │
│  │  └─ ...                                │
│  ├─ trees/                                │
│  └─ graphs/                               │
│                                           │
│  Each .html =  RootLayout(                │
│                  SectionLayout?(          │
│                    Page()))               │
│                                           │
└───────────────────────────────────────────┘
```

---

## In this codebase

**Entry point:** `src/app/layout.tsx` L21–L65 — root layout wraps every route.
**Section layouts:** `src/app/sorting/layout.tsx`, `src/app/recursions/layout.tsx` — wrap their respective sub-trees.
**Example route:** `src/app/sorting/bubble-sort/page.tsx` L16–L129 — leaf page that renders the visualizer.
**Co-located CSS:** `src/app/graphs/finding-shortest-path/styles.css` — imported at the top of the corresponding `page.tsx`.

GitHub: `[src/app/](https://github.com/rlynjb/reincodes/tree/main/src/app)`.

---

## Elaborate

### Where this pattern comes from
File-based routing came out of Ruby on Rails' "convention over configuration" doctrine in 2005, then evolved through PHP frameworks (every `.php` file was a route) into modern JS frameworks. Next.js' Pages Router (2016) made it the React default; the App Router (2023) rebuilt it on React Server Components but kept the file convention.

### The deeper principle
A good convention removes a class of decisions. With file-based routing, "where does this route live?" is never an open question — there's exactly one place. This frees decision budget for the things that actually matter (what the component does, what the URL means).

### Where this breaks down
- **Multi-tenant routing** where the same path serves different content based on subdomain or header. Not file-tree-shaped.
- **Marketing pages with overlapping URL structures.** Two routes that share a layout but live in different folders need [route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups), which adds back configuration.
- **Heavy dynamic-route trees** like "every product page on Amazon." File-based routing handles `[slug]` fine but at thousands of dynamic routes, the build step starts to be the bottleneck.

### What to explore next
- [04-component-composition](./04-component-composition.md) — how `layout.tsx` files compose with `page.tsx` files.
- [06-static-data-as-source](./06-static-data-as-source.md) — how the route content is generated from hard-coded data.
- [01-static-export-spa](./01-static-export-spa.md) — how routes become static HTML files.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬────────────────────────┬────────────────────────┐
│ Cost dimension   │ File-based (App Router)│ Explicit route table   │
├──────────────────┼────────────────────────┼────────────────────────┤
│ Cognitive load   │ Find route by folder   │ Read router config     │
│ Refactor cost    │ Folder rename = URL    │ Path-string edit only  │
│ Code organisation│ Forced by router       │ Decoupled from URL     │
│ Dynamic routes   │ `[param]` folders      │ Full programmatic      │
│ Multi-tenant     │ Hard, needs groups     │ Easy, just match       │
│ Onboarding speed │ Fast — convention      │ Slow — need to read    │
│ IDE support      │ Native file nav        │ Symbol search          │
└──────────────────┴────────────────────────┴────────────────────────┘
```

### What we gave up

The ability to organise files separately from URLs. Some teams prefer to group code by feature (`features/sort/*.tsx`) and have a router config map those to URLs — that lets you keep all sort-related code in one place even if the URL structure changes. With the App Router, the URL structure *is* the code structure. For this codebase that's fine: a visualizer is its page is its folder.

Some flexibility on partial-page reuse. A pre-built layout chain (`RootLayout → SortingLayout → page`) means every page under `/sorting/*` *must* use the sorting layout. You can't have one `/sorting/foo` opt out without using a route group, which adds noise.

### What the alternative would have cost

If we used an explicit router (React Router style), every new visualizer would need two edits: create the component file *and* register the route. That's the kind of double-bookkeeping that drifts — you ship a component, forget the route registration, and the page 404s. The convention eliminates the second step, which means it can't be forgotten.

The cost would also be debugging time. With file-based routing, "where is the page for `/sorting/bubble-sort`?" is answered by `ls src/app/sorting/bubble-sort/`. With an explicit table, it's "grep the router config, find the entry, follow the import." For a project that lives in someone's head for months at a time, the second adds up.

### The breakpoint

Fine until the URL structure stops mirroring the code organisation — typically when you add multi-tenancy, when SEO wants overlapping URL structures the file tree can't express, or when you have a CMS where content authors create URLs the file tree doesn't know about. None of those apply here; this site has a hand-curated 20-route surface.

---

## Tech reference (industry pairing)

### Next.js App Router

- **Codebase uses:** Next.js 15.5.15 App Router with `src/app/` as the route root.
- **Why it's here:** the file-system-to-URL mapping and the layout-composition mechanism.
- **Leading today:** Next.js App Router — `adoption-leading` for new React projects, 2026.
- **Why it leads:** the only React router that ships with first-party support for layouts, parallel routes, route groups, intercepting routes, and React Server Components in one config-free shape.
- **Runner-up:** TanStack Router — `innovation-leading` for typed routing in client-only React apps; file-system optional; better for non-Next React projects.

### Pages Router vs App Router (the live disagreement)

- **Codebase uses:** App Router. Pages Router (`pages/`) is the legacy convention; both still work in Next 15.
- **Why this matters:** the App Router is the framework's bet for the future (RSC, layouts, streaming); the Pages Router is the battle-tested past (Vercel still uses it internally for some apps). New code goes in App Router; rewrites of Pages-Router apps remain a non-trivial choice.

---

## Summary

### Part 1 — concept recap

The App Router maps the `src/app/` folder tree directly to URLs: a `page.tsx` at any path becomes a route, and `layout.tsx` files wrap their nested routes. reincodes uses this to keep the visualizer routes self-organising — every sort/tree/graph/recursion folder you see under `src/app/` is also a URL the user can visit. The constraint that forced the choice is using Next.js 15 with App Router (the framework's recommended path for new projects), and the cost paid is that the folder structure is rigidly tied to URLs — you can't reorganise without redirecting.

### Part 2 — key points to remember

- The folder is the URL. `src/app/sorting/bubble-sort/page.tsx` → `/sorting/bubble-sort/`.
- `layout.tsx` files wrap their nested routes; the root `src/app/layout.tsx` is the global shell.
- Only `page.tsx`, `layout.tsx`, and a few other reserved files are router-aware; everything else (`utils.ts`, `styles.css`) is just code that lives alongside.
- Lives in step 2 (Request/response flow) of the system-design checklist — the routing layer is the first thing a request hits, even when "request" means "click a link."
- The cost is rigid coupling between code organisation and URL structure; moving a folder = changing a URL.

---

## Interview defense

### What an interviewer is really asking

When someone asks "why App Router over Pages Router?", they want to know if you understand the *difference* — RSC vs client-only render, nested layouts vs `_app.tsx`, streaming vs static. The honest answer here is small: for this static-export site, the App Router gives nested layouts and a cleaner convention, but most of its power (RSC, streaming) doesn't apply because there's no server.

### Likely questions

**Q [mid]: Where would I add a new sort algorithm — say bucket sort?**

A: Create `src/app/sorting/bucket-sort/page.tsx`. That's it — the file is the route. The sort-section layout (`src/app/sorting/layout.tsx`) wraps it automatically, and the next build will emit `out/sorting/bucket-sort/index.html`. The page itself would be a `"use client"` component importing the bucket-sort implementation from `src/utils/notes/Sorting/` and rendering an `ArrayVisualizer`.

```
1. Create folder         2. Add page.tsx              3. Build
src/app/sorting/         "use client";                next build
  bucket-sort/           export default function      → out/sorting/
                           BucketSort() {...}           bucket-sort/
                                                        index.html
```

**Q [senior]: This site has no dynamic routes. Why didn't you set up a generic `/sorting/[algo]` and drive it from a list?**

A: I considered it. The decision was: each visualizer has different UI affordances (sort vizzes have `inputSize` + `speed`, graph vizzes have grid dimensions + obstacle clicks, recursion vizzes have a counter input). A single `[algo]` route would have to be a switch over those affordances or accept everything via props, and the props would diverge fast. Having one page per algorithm means each can shape its own controls. The tradeoff is duplication — every sort page has nearly identical scaffolding around the algorithm — but the scaffolding is ~30 lines, not 300, and the upside is each page can evolve independently.

```
┌── What we picked ─────────┐    ┌── What we didn't ─────────┐
│  One page per algorithm   │    │  /[algo] dynamic route    │
│  ~30 lines scaffolding    │    │  switch on slug           │
│  each can evolve solo     │    │  one source of truth      │
│  duplicated structure     │    │  rigid UI                 │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: What happens to the layout file when the route is statically exported?**

A: At build time, the framework composes layouts top-down for each route and inlines them into the HTML. So `out/sorting/bubble-sort/index.html` contains the markup from `RootLayout(SortingLayout(BubbleSortPage()))` all baked together. There's no runtime "layout shell stays mounted across navigations" optimisation in static export — every navigation is a full page load (or, with `next/link`, a client-side React re-render of the entire layout chain). At higher scale, that costs nothing — the HTML is cached at the CDN edge, and the React bundle is shared.

```
At 10× scale:
┌─ Layout composition ───┐
│  ✓ build time cost,    │  ← scales with route count
│    not request time    │
└────────────────────────┘
┌─ HTML serving ─────────┐
│  ✓ identical to today  │
└────────────────────────┘
┌─ Build duration ───────┐
│  ⚠ grows linearly with │  ← breaks first at thousands of routes
│    page count          │
└────────────────────────┘
```

### The question candidates always dodge

**Q: You're using the App Router but nothing on this site actually needs RSC or layouts — it's a static SPA. Did you pick App Router just because it's the new shiny?**

A: Yes and no. The App Router doesn't *earn* its keep on this codebase the way it would on a server-rendered app — there are no server components doing async data fetching, no streaming, no parallel routes. What I get is (1) the nested layout convention, which is cleaner than the `_app.tsx` + `_document.tsx` pair from Pages Router, and (2) future portability — if this site ever grows a server side (a contact form backed by an API route, an authenticated dashboard for admin views), the App Router accommodates that without restructuring. So the choice is partly "the framework's recommended path for new code" and partly "lower migration cost later." The cost is that someone reading this code might assume RSC features are in use when they're not. I'd rather pay that cost than start on Pages Router and migrate later.

```
┌── App Router (picked) ────┐    ┌── Pages Router (didn't) ──┐
│  Used: nested layouts     │    │  Used: ~nothing extra     │
│  Used: convention         │    │  Used: convention         │
│  Unused: RSC              │    │  N/A                      │
│  Unused: streaming        │    │  N/A                      │
│  Future: server features  │    │  Future: migration cost   │
│      cheap                │    │      high                 │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "The folder is the URL — there is no route table."
- "Reserved files (`page`, `layout`, `loading`, `error`) are router-aware; everything else is just code."
- "Layouts compose top-down at build time in static export."
- "App Router is the bet on Next.js' future; Pages Router is the bet on its past."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the `src/app/` tree on the left and the resulting `./out/` tree on the right. Include at least one layout file and show what it wraps.

### Level 2 — Explain it out loud

Explain to a colleague: "How does Next.js know that `/trees/binary-search-tree/` should render the BST visualizer?" Under 90 seconds.

Checkpoints:
- Name a specific file? → `src/app/trees/binary-search-tree/page.tsx`.
- Say what makes the file "a route"? → its name (`page.tsx`) and its location.
- Name the tradeoff? → folder structure is rigidly tied to URL structure.

### Level 3 — Apply it to a new scenario

Without looking: "I want to add a category called *strings* with two pages: `palindrome-check` and `anagram-finder`. What folders and files do I create?"

Write the answer. Then check by looking at how `src/app/sorting/` is structured.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff. Answer:
"If you had to add 50 more algorithms, would you keep one-page-per-algorithm or switch to a dynamic `[algo]` route? What would that cost?"

### Quick check — code reference test

- Which folder holds all the routes?
- What file convention turns a folder into a route?
- What file wraps a sub-tree of routes with shared UI?

✓ Pass: `src/app/`, `page.tsx`, `layout.tsx`.
