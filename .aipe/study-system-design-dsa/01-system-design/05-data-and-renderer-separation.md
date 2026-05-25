# Data and renderer separation

**Industry name(s):** Static data module + presentational component, configuration-as-data pattern
**Type:** Industry standard · Language-agnostic

> `conceptsData.tsx` holds the static catalog of visualizer tiles (titles, links, SVG thumbnails); `Concepts.tsx` maps over the catalog and renders the grid. The data and the renderer live in two files.

**See also:** → [02-page-per-route-app-router.md](./02-page-per-route-app-router.md)

---

## Why care

#### Move 1 — The grounded scenario

You've written this component before:

```tsx
function Concepts() {
  return (
    <div>
      <div className="card">
        <h3>bubble sort</h3>
        <a href="/sorting/bubble-sort">open</a>
        <svg>{/* the thumbnail */}</svg>
      </div>
      <div className="card">
        <h3>insertion sort</h3>
        <a href="/sorting/insertion-sort">open</a>
        <svg>{/* the thumbnail */}</svg>
      </div>
      {/* 18 more cards exactly like this, with different titles */}
    </div>
  );
}
```

It works. It renders the grid. But the moment you want to reorder the cards, you scroll through twenty-card-shaped JSX blocks looking for the right one. The moment you want to know "what's the URL for bubble sort?" — you have to read the JSX to find it. The card *layout* and the card *content* are tangled in the same braces.

#### Move 2 — Name the question (or job) the pattern answers

The question is: *what's data and what's view?* The catalog of visualizers — twenty titles, twenty URLs, twenty thumbnails — is data. Looping over data to produce DOM is view. The pattern is to pull the data out into a typed exported array (`conceptsData.tsx`) and leave the renderer (`Concepts.tsx`) doing nothing but `.map()`.

#### Move 3 — Why answering that question matters

**What depends on getting this right:** the velocity of every future edit. Adding a new visualizer to the home grid means *adding one object to an array.* No JSX gymnastics, no risk of forgetting a className, no copy-paste of the card layout. The card layout exists exactly once, in the renderer; every card uses it.

The second thing depending on the answer: *the layout of the grid becomes a property of the data array, not a property of the JSX.* The order of cards is the order of array elements. Move element 3 to position 0, and card 3 is now the first card. No JSX reordering, no `flex-order` CSS hacks.

In this codebase, `conceptsData.tsx` defines `CONCEPT_CATEGORIES: ConceptCategory[]` with four categories (sorting, graphs, trees, recursion), each containing an array of `Concept` objects. The `Concepts.tsx` component is 45 lines, mostly Tailwind classes, doing two nested `.map()`s.

#### Move 4 — Concrete before/after

Without the split (inline JSX, twenty cards in `Concepts.tsx`):

- Add a new visualizer → write a new card-shaped JSX block in the right grid section, manually applying the same classes as the others
- Reorder a category → rearrange JSX blocks, risk of copy-paste errors
- Change the card layout (e.g., move the WIP badge) → edit twenty places
- Find "where is the heap-sort thumbnail defined?" → grep the file
- TypeScript catches typos in title strings? No — strings inside JSX aren't typed

With the split (current state):

- Add a new visualizer → append one object to the right `concepts: [...]` array
- Reorder a category → reorder array elements
- Change the card layout → edit one JSX block in `Concepts.tsx`
- Find "where is heap-sort defined?" → grep for `"heap-sort"` in `conceptsData.tsx`; one match
- TypeScript catches typos in field names because every entry conforms to `Concept` interface (L3–L9)

#### Move 5 — The one-line summary

Data and renderer separation is the move of pulling a hard-coded list out of JSX into a typed array, leaving the JSX with one `.map()` — the data file becomes the authoritative catalog and the renderer becomes a layout engine.

---

## How it works

### Move 1 — The mental model

The mental model is *one file is a database table; another file is the query that renders it.*

```
conceptsData.tsx                          Concepts.tsx
────────────────                          ────────────
exports CONCEPT_CATEGORIES                imports CONCEPT_CATEGORIES
type:                                     renders:
  ConceptCategory[] {                       for each category:
    name: string                              <section>
    concepts: Concept[]                         <header>{name}</header>
  }                                             for each concept:
                                                  <Link>
data:                                               <thumb />
  4 categories                                      <title />
  17 concepts                                       <meta />
  17 inline SVG thumbnails                        </Link>
                                              </section>

  ▲                                         ▲
  │ the catalog (data)                      │ the layout (view)
  │                                         │
  └─ "what cards exist"                     └─ "how cards look"
```

The strategy: *the data file owns identity (titles, URLs, thumbnails); the renderer owns presentation (grid layout, spacing, hover states).*

### Move 2 — The layered walkthrough

**The data file**

`src/components/Home/conceptsData.tsx` exports two things: an `interface Concept` (L3–L9), an `interface ConceptCategory` (L11–L14), and a single `const CONCEPT_CATEGORIES: ConceptCategory[]` array (L240–L345).

```ts
export interface Concept {
  title: string;
  href: string;
  meta?: string;
  wip?: boolean;
  thumb: ReactNode;
}

export interface ConceptCategory {
  name: string;
  concepts: Concept[];
}
```

If you're coming from frontend, you've used a similar pattern: a `const products = [{ id: 1, name: "..." }, ...]` array imported into a list component. The twist here is the `thumb: ReactNode` field — the thumbnail is JSX inside the data array. Each concept has its own inline `<SortingThumb>`, `<TreeThumb>`, `<GridThumb>` component embedded in the object literal.

```
type shape                       example entry
──────────                       ──────────────────────────────────────
ConceptCategory[]                [
  ConceptCategory {                {
    name: string                     name: "sorting",
    concepts: Concept[]              concepts: [
      Concept {                        {
        title: string                    title: "bubble sort",
        href: string                     href: "/sorting/bubble-sort",
        meta?: string                    meta: "o(n²)",
        wip?: boolean                    thumb: <SortingThumb bars={...} />
        thumb: ReactNode               },
      }                                ...
                                     ]
                                   },
                                   ...
                                 ]
```

The practical consequence: TypeScript checks every entry. If you forget `href`, the file doesn't compile. If you misspell `wip` as `WIP`, the file doesn't compile. The data file becomes the single source of truth for what's in the catalog, and the type forces every entry to be complete and consistent.

**Inline component definitions in the data file**

The non-standard part is that `conceptsData.tsx` is not just data — it also contains small component definitions for each thumbnail style: `SortingThumb`, `MergeThumb`, `QuickThumb`, `HeapThumb`, `TreeThumb`, `NetworkThumb`, `GridThumb`, `RiverThumb`, `RecursionThumb`, `FibonacciThumb` (L22–L222). They live in the data file because they're only used inside the data definition — nothing else imports them.

```
conceptsData.tsx layout
───────────────────────
L1–L14    type definitions (Concept, ConceptCategory)
L16–L20   svgWrap helper (shared SVG wrapper)
L22–L222  10 thumbnail components (private to this file)
L224–L238 two grid pattern constants (private to this file)
L240–L345 the CONCEPT_CATEGORIES export
```

If you're coming from frontend, you've probably seen the "factor every component into its own file" rule. This file deliberately breaks it — the thumbnails are *part of the data*, not first-class reusable components, so they live where they're used.

The practical consequence: a developer adding a new visualizer can read the file top-to-bottom and see everything that goes into the catalog. There's no chasing imports to find `<HeapThumb>` in a separate file; it's right there above the array. The file is longer (345 lines), but it's self-contained.

**The renderer**

`src/components/Home/Concepts.tsx` is 45 lines (L1–L46). It imports `CONCEPT_CATEGORIES`, runs a nested `.map()`, and renders the grid.

```ts
import Link from "next/link";
import { CONCEPT_CATEGORIES } from "./conceptsData";

export default function Concepts() {
  return (
    <section className="mb-14">
      <div className="text-[12px] ...">concepts · interactive visualizers</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        {CONCEPT_CATEGORIES.map((category) => (
          <div key={category.name}>
            <div className="text-[13px] ...">{category.name}</div>
            <div className="flex flex-col">
              {category.concepts.map((c) => (
                <Link key={c.href} href={c.href} className="...">
                  <div className="w-10 h-10 ...">{c.thumb}</div>
                  <div className="flex-1 ...">
                    <span>{c.title}</span>
                    {c.wip ? <span>wip</span> : <span>{c.meta}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

If you're coming from frontend, this is the canonical "list of cards" component. The Tailwind classes carry the design; the `.map()` carries the iteration. There is exactly one place where a card's DOM shape lives.

```
data ──▶ renderer ──▶ DOM
  │           │
  │           │ for each category:
  │           │   <div className="grid-col">
  │           │     <header>{name}</header>
  │           │     for each concept:
  │           │       <Link>
  │           │         {thumb}
  │           │         <span>{title}</span>
  │           │         {wip ? badge : <span>{meta}</span>}
  │           │       </Link>
  │           │   </div>
  │           │
  └───────────┴─ the only place card-shape exists is here
```

The practical consequence: a redesign of the card — say, "show the time complexity as a colored pill below the title" — is one edit in `Concepts.tsx`, applied to every card automatically. The data file doesn't change.

**The same pattern repeats in `FeaturedProjects.tsx` and `Implementations`**

The codebase uses the same shape for the featured projects (`src/components/Home/FeaturedProjects.tsx` — `projects: Project[]` at L17 followed by a `.map()` in the component) and the implementations list (`conceptsData.tsx` L354–L375 — `IMPLEMENTATIONS: Implementation[]` consumed by `Implementations.tsx`).

```
data exports                              renderer
─────────────                             ─────────
CONCEPT_CATEGORIES (conceptsData.tsx)     Concepts.tsx
projects (FeaturedProjects.tsx)           FeaturedProjects.tsx
IMPLEMENTATIONS (conceptsData.tsx)        Implementations.tsx
```

A small inconsistency: `FeaturedProjects.tsx` keeps its data array *inside* the same file as the renderer (the `projects` const at L17 is a private module-level declaration, not exported). Same pattern, different file boundary. The team picked file-level split for concepts/implementations because they're consumed by two-deep nested rendering; kept inline for projects because the data is only used in one renderer.

### Move 3 — The principle

The principle this exemplifies is *separate the catalog from the layout when there are many catalog entries and one layout.* Twenty cards mean twenty places to forget a class name if the JSX inlines them; one `.map()` means one place. The cost is the field-name indirection — a typo in `href: "/sorting/bubble-sort"` won't be caught at the type level, only at runtime when the link 404s. But that's a small cost compared to the layout drift that the inline-JSX approach would have produced over the lifetime of the codebase.

The full picture is below.

---

## Data and renderer separation — diagram

```
┌─ Data file: src/components/Home/conceptsData.tsx ─────────────────────────┐
│                                                                           │
│   types:                                                                  │
│     interface Concept { title, href, meta?, wip?, thumb }                 │
│     interface ConceptCategory { name, concepts }                          │
│                                                                           │
│   private components (thumbnails, only used inside the data array):       │
│     SortingThumb, MergeThumb, QuickThumb, HeapThumb,                      │
│     TreeThumb, NetworkThumb, GridThumb, RiverThumb,                       │
│     RecursionThumb, FibonacciThumb                                        │
│                                                                           │
│   exports:                                                                │
│     CONCEPT_CATEGORIES: ConceptCategory[]                                 │
│       [                                                                   │
│         { name: "sorting",   concepts: [ ... 6 entries ... ] },          │
│         { name: "graphs",    concepts: [ ... 4 entries ... ] },          │
│         { name: "trees",     concepts: [ ... 2 entries ... ] },          │
│         { name: "recursion", concepts: [ ... 2 entries ... ] },          │
│       ]                                                                   │
│                                                                           │
└──────────────────────────────────────│────────────────────────────────────┘
                                       │ import { CONCEPT_CATEGORIES }
                                       ▼
┌─ Renderer: src/components/Home/Concepts.tsx ──────────────────────────────┐
│                                                                           │
│   45 lines total                                                          │
│                                                                           │
│   CONCEPT_CATEGORIES                                                      │
│     .map(category =>                                                      │
│        <div>                                                              │
│          <header>{category.name}</header>                                 │
│          {category.concepts.map(c =>                                      │
│             <Link href={c.href}>                                          │
│                {c.thumb}                                                  │
│                <span>{c.title}</span>                                     │
│                {c.wip ? <Badge/> : <span>{c.meta}</span>}                 │
│             </Link>                                                       │
│          )}                                                               │
│        </div>                                                             │
│      )                                                                    │
│                                                                           │
│   the card layout exists in exactly one place                             │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**The data file**
**File:** `src/components/Home/conceptsData.tsx`
**Function / class:** `CONCEPT_CATEGORIES` (exported const); types `Concept` (L3–L9), `ConceptCategory` (L11–L14); 10 private thumbnail components (L22–L222)
**Line range:** L240–L345 for the `CONCEPT_CATEGORIES` array; L1–L345 for the whole file

```ts
export const CONCEPT_CATEGORIES: ConceptCategory[] = [
  {
    name: "sorting",
    concepts: [
      {
        title: "bubble sort",
        href: "/sorting/bubble-sort",
        meta: "o(n²)",
        thumb: <SortingThumb bars={[35, 55, 45, 25, 65, 40]} highlight={1} />,
      },
      // ... 5 more sort entries
    ],
  },
  { name: "graphs", concepts: [...] },
  { name: "trees", concepts: [...] },
  { name: "recursion", concepts: [...] },
];
```

**The renderer**
**File:** `src/components/Home/Concepts.tsx`
**Function / class:** `Concepts` (default export)
**Line range:** L1–L46

```ts
import { CONCEPT_CATEGORIES } from "./conceptsData";

export default function Concepts() {
  return (
    <section>
      {CONCEPT_CATEGORIES.map(category => (
        <div key={category.name}>
          <header>{category.name}</header>
          {category.concepts.map(c => (
            <Link key={c.href} href={c.href}>
              {c.thumb}
              <span>{c.title}</span>
              {c.wip ? <Badge /> : <span>{c.meta}</span>}
            </Link>
          ))}
        </div>
      ))}
    </section>
  );
}
```

**Same pattern, different file boundary**
**File:** `src/components/Home/FeaturedProjects.tsx`
**Function / class:** `projects` (private const, not exported); the `FeaturedProjects` component
**Line range:** L17–L? (data declared at module scope inside the same file as the renderer)

`FeaturedProjects` keeps its data inline because no other component consumes it. The data/renderer split is logical (the `projects` array is a separate construct from the rendering JSX), but the file split was skipped.

**Same pattern again**
**File:** `src/components/Home/conceptsData.tsx`
**Function / class:** `IMPLEMENTATIONS` (exported const), types `Implementation` (L347–L352)
**Line range:** L354–L375

Consumed by `src/components/Home/Implementations.tsx` with the same shape — import the array, map over it, render link cards.

---

## Elaborate

### Where this pattern comes from

The pattern is as old as data-driven UIs. PHP's templating systems in the 2000s separated data (from MySQL) from templates (HTML files). React adopted it natively the moment `.map()` over a props array became idiomatic. The specific shape here — typed `const` arrays in their own modules, imported by presentational components — is the React/TypeScript codification of "model-view separation" from MVC, simplified for codebases small enough to skip the C.

### The deeper principle

The deeper principle is *every redundant block in JSX is data pretending to be code.* If you have twenty JSX blocks that differ only in the values inside, the values are the data and the block is the template. Pulling the data out and looping is the refactor that makes that visible. The same logic applies at every scale — from this twenty-card grid to enterprise apps where the "data" is a JSON schema describing a whole UI.

```
inline JSX                          data-driven
──────────                          ───────────
20 card blocks                      1 data array of 20 entries
20 places to make a layout edit     1 place to make a layout edit
TypeScript can't catch field        TypeScript catches field typos
typos in JSX strings                in array entries
```

### Where this breaks down

This pattern breaks when the entries genuinely differ — when card 1 has three buttons and card 2 has one, when card 3 should open a modal and card 4 navigates. At that point the "data" becomes a discriminated union that the renderer has to switch on, and the template has to handle every variant. Past a few variants, the renderer becomes harder to read than twenty bespoke JSX blocks would have been.

The pattern also breaks when the data is dynamic (loaded from an API, computed per render). Static `const` arrays at module scope are immutable and known at build time; that's what makes them clean. The moment the catalog comes from a fetch, you're back to runtime state and the data file is now a hook or a context — different shape, different complexity.

### What to explore next

- Discriminated unions → the type-level move when entries diverge enough that one shape can't describe them all
- Headless component libraries (Radix, React Aria) → another layer of the same separation — primitives that take data, render structure, leave styling to the consumer
- JSON-driven UI → the data-driven idea taken to its limit, where the entire view is a schema interpreted at runtime (form builders, no-code platforms)
- Server components fetching the catalog → the same shape but with the data file replaced by a server-side `await fetch(...)`, used in CMS-driven Next.js sites

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌─────────────────────┬───────────────────────────┬──────────────────────────────┐
│ Cost dimension      │ Data + renderer split     │ Inline JSX                   │
│                     │ (taken)                   │                              │
├─────────────────────┼───────────────────────────┼──────────────────────────────┤
│ Add a new entry     │ append 1 object to array  │ copy-paste a JSX block,      │
│                     │                           │ edit fields                  │
│ Layout change       │ 1 edit in renderer        │ edit every card              │
│ Field typo caught   │ at compile time (typed)   │ at runtime (broken link)     │
│ File count          │ 2 files                   │ 1 file                       │
│ File length         │ data ~350 lines,          │ ~500–800 lines in one file   │
│                     │ renderer ~45 lines        │                              │
│ Marshalling cost    │ ~0 (in-memory imports)    │ ~0 (everything inline)       │
│ Variant handling    │ extra fields, optional    │ trivially each block is      │
│                     │ ones, discriminated       │ its own thing                │
│                     │ unions get hairy          │                              │
│ Reordering          │ rearrange array elements  │ cut/paste JSX blocks         │
│ Grep-ability        │ search the data file for  │ search the file, mixed       │
│                     │ titles, URLs, metadata    │ with JSX                     │
└─────────────────────┴───────────────────────────┴──────────────────────────────┘
```

### Sub-block 1 — what we gave up

The first cost is *the data file is no longer plain data*. It has JSX inside (`thumb: <SortingThumb bars={...} />`), which means it has to be a `.tsx` file, has to import React, has to be a client-compatible module. A "pure data" file would be `.ts` with no React imports, but the thumbnails *are* React components, so the data file accepts that constraint. The compromise is that "data" here is React-flavoured — typed objects with JSX values.

The second cost is *handling variants*. The `Concept` interface has optional `meta` and `wip` fields. The renderer has to branch: if `wip`, show the badge; else, show `meta`. Two variants is fine. If a future "concepts" entry needs a "preview video" instead of an SVG thumbnail, or a "this concept has a YouTube tutorial" link, the renderer's branching grows, and at some point a discriminated union per variant becomes more honest than optional fields.

The third cost is *the cognitive overhead of two files*. A new developer reading `Concepts.tsx` for the first time sees a 45-line component that doesn't show the data; they have to open `conceptsData.tsx` to see what's being rendered. For developers used to "everything in one component," this is a small but real friction. The codebase trades that friction for the layout-edit savings, which add up faster.

### Sub-block 2 — what the alternative would have cost

If the catalog had stayed inline in `Concepts.tsx`, the component would be roughly 500–800 lines (20 cards × ~20 lines of JSX + Tailwind each). Reordering the grid would mean cutting and pasting 20-line JSX blocks. Changing the card layout — say, moving the `wip` badge from right to left — would mean editing 20 places, with the inevitable miss on the cards that have edge cases.

Adding a new visualizer would mean knowing the exact className recipe to apply to a new card. That recipe lives in the existing cards as a copy-paste source, which becomes the worst kind of style coordination: implicit, scattered, drift-prone.

The alternative also gives up the catalog as a queryable artifact. With `CONCEPT_CATEGORIES` exported, a future feature like "generate a JSON sitemap of all visualizers" is `JSON.stringify(CONCEPT_CATEGORIES.flatMap(c => c.concepts.map(...)))`. Same feature against inline JSX requires writing a parser.

### Sub-block 3 — the breakpoint

The split stops being the right call when entries diverge enough that the "single shape" hurts more than it helps. Concretely: when more than ~30% of entries need a special-cased renderer branch, or when an entry needs a fundamentally different layout (modal vs link vs embedded video), the inline-JSX approach becomes the simpler call. Below that threshold, the data + renderer split saves work at every edit. The current catalog has zero such variants — every concept is a link with a title, an icon, and a meta string — so the split is unambiguously the right shape.

### Sub-block 4 — what wasn't actually a tradeoff

Loading the catalog from JSON or YAML was not a meaningfully different option. There's no team of non-developers maintaining the catalog, no CMS, no localization story; the JSX-bearing `.tsx` data file is exactly as expressive as JSON would be plus the inline thumbnails. The cost of moving the catalog to JSON would be the loss of inline component definitions for thumbnails — they'd have to move to a separate file and be looked up by string ID, which is more indirection than the codebase needs.

### Tone

The split is correct for catalogs with one consistent shape and many entries; that's exactly the situation here, and it's the call again at every revisit.

---

## Tech reference (industry pairing)

### TypeScript `interface` + module-level `const`

- **Codebase uses:** `interface Concept` (L3–L9) and `interface ConceptCategory` (L11–L14) in `src/components/Home/conceptsData.tsx`, with `const CONCEPT_CATEGORIES: ConceptCategory[]` exported at L240.
- **Why it's here:** the interface enforces that every concept entry has the same fields; the typed const exports the catalog as data the renderer can consume safely.
- **Leading today:** TypeScript — adoption-leading for typed JS apps, 2026.
- **Why it leads:** universal IDE support, structural typing matches how JS data flows, gradual-adoption friendly (mixed `.ts` and `.tsx` is fine).
- **Runner-up:** Zod schemas — innovation-leading for runtime-validated data; useful when the data crosses a trust boundary (API response, user input), overkill for in-codebase static catalogs.

### React `.map()` for list rendering

- **Codebase uses:** nested `.map()` over `CONCEPT_CATEGORIES` in `src/components/Home/Concepts.tsx` L12–L41.
- **Why it's here:** the renderer's only iteration mechanism. Every grid section, every link card, is produced by a `.map()` call over the imported array.
- **Leading today:** `.map()` with `key` prop — adoption-leading for React list rendering, 2026.
- **Why it leads:** built into JavaScript, no library needed, integrates with React's reconciliation via the `key` prop. Every React developer knows it.
- **Runner-up:** virtualised list libraries (`react-window`, `react-virtual`) — innovation-leading when list length exceeds ~100 items and only a subset is on screen. Not needed at this catalog size.

### Module imports as the catalog plumbing

- **Codebase uses:** `import { CONCEPT_CATEGORIES } from "./conceptsData"` at L2 of `src/components/Home/Concepts.tsx`. No bundler-specific magic — plain ES modules.
- **Why it's here:** zero-cost connection between the data and the renderer. The bundler inlines the array reference at build time; runtime cost is the same as if the data lived inline.
- **Leading today:** ES modules with named exports — adoption-leading across all modern JS, 2026.
- **Why it leads:** native to every modern runtime, tree-shakeable, statically analysable by bundlers.
- **Runner-up:** Context providers (React's `createContext`) — innovation-leading for data that needs to vary per route or per user; overkill for static module-level constants.

---

## Summary

### Part 1 — concept recap

Data and renderer separation is the pattern of pulling a hard-coded catalog out of JSX into a typed exported array, leaving the renderer as one `.map()`. In this codebase, `src/components/Home/conceptsData.tsx` holds the `CONCEPT_CATEGORIES` array of 17 visualizer entries across 4 categories, each entry typed as `Concept` with `title`, `href`, `meta`, optional `wip`, and a `thumb` ReactNode; `src/components/Home/Concepts.tsx` is 45 lines that import the array and render the grid. The constraint that made it the right call is the uniform shape of entries — every concept is a link with a title, an icon, and a meta string — combined with the layout being identical across all of them. The cost is the file-boundary indirection (two files instead of one) and the field-name typing only catching structural typos, not value typos like a broken `href` string.

### Part 2 — key points to remember

- This pattern lives in checklist step 1 (**Data model** — `CONCEPT_CATEGORIES` is the static catalog, the closest thing this codebase has to a database table).
- The data file is `.tsx` rather than `.ts` because each concept's thumbnail is a React component embedded in the object literal.
- The renderer holds the card layout in exactly one place — change the card and every card changes.
- `Concept` and `ConceptCategory` interfaces make TypeScript catch missing fields or wrong types at compile time.
- Same pattern repeats for `IMPLEMENTATIONS` in the same file and for the projects in `FeaturedProjects.tsx` (kept inline because nothing else consumes it).
- The breakpoint is variant divergence — once entries genuinely have different shapes, the split becomes a discriminated union that's harder to read than 20 inline blocks would be.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks why you split the catalog from the renderer, they're checking whether you can name the tradeoff. The shallow answer is "DRY." The answer they want is: you traded a small amount of indirection for layout edits that scale linearly with cards instead of constantly, and you can name the regime where the split stops paying off.

### Likely questions

[mid] Q: Why is `conceptsData.tsx` a separate file from `Concepts.tsx`?

A: Because the catalog is data and the grid is layout, and they change for different reasons. Adding a visualizer is a data edit — append one object to the `CONCEPT_CATEGORIES` array. Changing how a card looks is a layout edit — one JSX block in `Concepts.tsx`. Keeping them in separate files makes the kind-of-edit you're making obvious, and the typed `Concept` interface means TypeScript catches missing fields. With 17 entries today and a stable layout, the split pays for itself on every new visualizer added.

Diagram:
```
What lives where

┌─ conceptsData.tsx ─────────┐    ┌─ Concepts.tsx ──────────────┐
│  what cards exist          │    │  how cards look             │
│                            │    │                             │
│  CONCEPT_CATEGORIES = [    │    │  CONCEPT_CATEGORIES.map(    │
│    {                       │ ─▶ │    category => (...))       │
│      name: "sorting",      │    │                             │
│      concepts: [...]       │    │  card JSX: 1 place          │
│    },                      │    │                             │
│    ...                     │    │                             │
│  ]                         │    │                             │
└────────────────────────────┘    └─────────────────────────────┘
   change for: catalog edits          change for: layout edits
```

[senior] Q: Why does `conceptsData.tsx` have React components inside it? That seems like data + view mixed together.

A: It is, and the boundary was a deliberate compromise. Each concept needs a unique SVG thumbnail — bubble sort shows bars, BST shows a tree, the river puzzle shows the river. Those are React components by nature. The choices were (a) put the thumbnail JSX in the data file (`.tsx`), (b) keep a separate `thumbnails.tsx` file and reference each by string ID, or (c) embed the SVG as a string and `dangerouslySetInnerHTML`. I picked (a) because the thumbnails are *only* used inside the catalog — nothing else consumes them — and option (b) is the same problem with more indirection. The cost is the data file becomes a React-flavoured module, not portable JSON. If the catalog later needed to be loaded from a CMS or shared with a different runtime, this would be the first thing to refactor.

Diagram:
```
Options for the thumbnails

┌──────────────────────┬──────────────────────────────────────────┐
│ option               │ tradeoff                                 │
├──────────────────────┼──────────────────────────────────────────┤
│ (a) JSX in data file │ chosen — co-located, typed, self-       │
│                      │ contained; data file isn't portable JSON │
│ (b) separate file +  │ same code, more indirection — string ID  │
│     ID lookup        │ → component lookup table                 │
│ (c) SVG string +     │ untyped, no JSX features, security risk  │
│     dangerouslySet…  │                                          │
│ (d) Image URLs       │ tooling complexity, build-time           │
│                      │ generation needed                        │
└──────────────────────┴──────────────────────────────────────────┘
```

[arch] Q: If this site grew to 200 visualizers and you wanted non-developer maintainers to add new ones via a web form, what breaks first?

A: The TSX data file is the first thing that breaks, because non-developers can't edit React code. The fix is to move the catalog to a real data store — Sanity, Contentful, a JSON file edited via PR, or a database — and load it at build time. The renderer almost doesn't change: it still receives an array of `Concept` and maps it. What goes is the inline JSX thumbnails — those would have to become image URLs or be generated from a schema. The second thing to break is per-page layout knowledge — at 200 visualizers, the home page grid would need pagination or categorization beyond the four current sections. Both fixes preserve the data-renderer split, just move the data source.

Diagram:
```
What scales, what breaks

┌─ data source ────────────────────────────────────────────────────┐
│  .tsx file in repo   ◀── BREAKS at non-dev maintainers           │
│  JSON in repo                                                    │
│  CMS (Sanity, etc.)  ◀── right for non-dev maintainers           │
│  database + admin UI                                             │
└──────────────────────────────────────────────────────────────────┘
┌─ thumbnails ─────────────────────────────────────────────────────┐
│  inline React SVG    ◀── BREAKS at non-dev maintainers           │
│  remote image URLs                                               │
│  schema → generator  ◀── thumbnails generated from props         │
└──────────────────────────────────────────────────────────────────┘
┌─ renderer ───────────────────────────────────────────────────────┐
│  one .map() over array   ◀── unchanged at every scale            │
└──────────────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

Q: The `FeaturedProjects.tsx` file keeps its data array *inside* the same file as the renderer. Why is that inconsistent with the concepts pattern?

A: It is inconsistent and the answer is honest: the projects array is only consumed by one renderer and isn't worth a second file. The concepts catalog is split because the data and renderer have meaningfully different reasons to change — new visualizers land every few weeks, layout changes rarely — and because both renderers (the grid on home, and maybe a future sitemap) might consume it. Projects don't have that pressure: five entries, one consumer, and the entries change at the same cadence as the renderer (a new project means new copy, which often means a new card layout anyway). The split-vs-no-split decision is per-array, not codebase-wide, and "do I expect this to be consumed by two renderers?" is the test. For concepts: yes; for projects: no.

Diagram:
```
When to split, when to inline

┌──────────────────────────┬──────────────────────────┬─────────────────┐
│ array                    │ split into own file?     │ rationale       │
├──────────────────────────┼──────────────────────────┼─────────────────┤
│ CONCEPT_CATEGORIES       │ yes                      │ many entries,   │
│   (17 entries, grows)    │                          │ may be reused   │
│ IMPLEMENTATIONS          │ yes (same file as        │ shares thumb-   │
│   (4 entries)            │ concepts)                │ nail context    │
│ projects                 │ no — inline in           │ 5 entries, one  │
│   (5 entries, stable)    │ FeaturedProjects.tsx     │ consumer only   │
└──────────────────────────┴──────────────────────────┴─────────────────┘
```

### One-line anchors

- "The catalog is data, the grid is layout — they live in different files because they change for different reasons."
- "TypeScript's `Concept` interface is what keeps the data shape honest as the catalog grows."
- "The thumbnails are React components inside the data file because they're only used inside the data file — co-location wins."
- "Same pattern, different boundary: `FeaturedProjects` keeps data inline because no second consumer earns the file split."
- "Breaks when entries diverge enough that one shape doesn't describe them all; below that, the split saves work."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw two boxes: the data file and the renderer file. Inside each, list what lives there (types, exports, components, JSX). Draw the arrow from data to renderer. Label what travels along the arrow.

Open the file and compare against the *Data and renderer separation — diagram* section.

- Pass: you showed the type definitions, the `CONCEPT_CATEGORIES` array, and the renderer's `.map()` with the card JSX
- Fail: re-read Move 2 and try again

### Level 2 — Explain it out loud

Explain why `conceptsData.tsx` and `Concepts.tsx` are two files. Talk to a colleague who would have inlined everything. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the `Concept` interface and the `.map()` in the renderer?
- Reference the actual file paths (`src/components/Home/conceptsData.tsx`, `src/components/Home/Concepts.tsx`)?
- Name the tradeoff in one sentence (cognitive overhead of two files in exchange for layout-edits-scale-with-1-not-N)?

### Level 3 — Apply it to a new scenario

You're asked to add a new category "string" with two algorithms: KMP and Rabin-Karp. Walk through what files you touch, what objects you add, and what you don't change.

Write your answer (3–5 sentences), then open `src/components/Home/conceptsData.tsx` L240–L345 and verify your plan against the existing category structure.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: *the data file holds React components (the thumbnails), so it's not portable JSON*. Answer in writing:

"If you were starting today and expected the catalog to eventually move to a CMS like Sanity, would you still put `<SortingThumb>` inside the data file? What would change about how thumbnails are referenced?"

Reference `src/components/Home/conceptsData.tsx` L22–L222 (thumbnail definitions) and L240–L345 (catalog usage) to support your answer.

### Quick check — code reference test

Without opening any files, answer:
- What's the name of the exported array in `conceptsData.tsx`?
- What's the name of the TypeScript interface that defines a single tile in the catalog?
- About how many lines is `Concepts.tsx`?

Then open the files and verify.

---
Updated: 2026-05-24 — IMPLEMENTATIONS shrank from 5 to 4 entries (relational-store wip dropped); FeaturedProjects grew from 4 to 5 entries (dryrun added, loopd → buffr renamed); line range refreshed.
