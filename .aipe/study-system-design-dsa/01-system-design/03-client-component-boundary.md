# Client component boundary

**Industry name(s):** `"use client"` directive, client/server component split, RSC boundary
**Type:** Industry standard (React 18+ / Next.js App Router)

> Every visualizer page declares `"use client"` at the top, opting out of React Server Components so the page can hold state, run effects, and animate in the browser.

**See also:** → [01-static-export-architecture.md](./01-static-export-architecture.md) · → [04-state-driven-animation-with-delayloop.md](./04-state-driven-animation-with-delayloop.md) · → [06-page-local-state-ownership.md](./06-page-local-state-ownership.md)

---

## Why care

#### Move 1 — The grounded scenario

You open `src/app/sorting/bubble-sort/page.tsx` and the very first line is:

```ts
"use client";

import React, { useState, useEffect } from "react";
```

Two things to notice. First, the literal string `"use client"` as the first statement in the file. Second, immediately below it: `useState` and `useEffect`. The directive is there because the imports below need it. Try removing the directive, run `next build`, and the build breaks with an error about using hooks outside a client component.

The directive looks like a comment, but it's a signal to the bundler about *where this component runs.*

#### Move 2 — Name the question (or job) the pattern answers

The App Router in Next.js 13+ splits every component into two universes: server components (the default) and client components (opt-in via `"use client"`). The question is *which side of the boundary does this component live on?* The `"use client"` directive is how a file declares "I run in the browser." Without it, the file runs only on the server — it can't use `useState`, `useEffect`, `onClick` handlers, or browser APIs.

This codebase puts the directive on every visualizer page. Not because the directive is harmless to add — because the page genuinely needs to run in the browser. The whole visualizer is a state-driven animation. State means hooks. Hooks mean client.

#### Move 3 — Why answering that question matters

**What depends on the answer:** every interactive primitive a visualizer needs. `useState` to hold the array of bars. `useEffect` to kick off the animation on mount. `setBars([...bars])` to trigger a re-render. The dropdown's `onSelect` handler. Without `"use client"`, none of those work — the file is treated as a server component that runs once at build time and renders to static HTML, with no event handlers and no reactive state.

The second thing depending on this: *what gets shipped to the browser.* Server components are not sent to the browser as JavaScript — they render to HTML on the server (or at build time, here) and the HTML is what arrives. Client components are sent as JavaScript that hydrates and runs. The boundary decides what's in the bundle.

In this codebase, the boundary is drawn at the *page* level. Every `page.tsx` is a client component, so every visualizer plus every component it transitively imports ends up in the JS bundle. There are no server components doing real work — even though App Router defaults to them.

#### Move 4 — Concrete before/after

Without `"use client"`, with App Router's defaults:

- `page.tsx` is a server component
- `useState`, `useEffect`, `useRef`, `onClick` — all forbidden, build errors
- Component renders to static HTML at build time, ships zero JS for the page
- Cannot animate, cannot respond to clicks, cannot hold state

With `"use client"`:

- The file becomes a client component
- All hooks and browser APIs are available
- React ships the bundled JS to the browser; on load, React hydrates and the component becomes interactive
- The component is now a normal React component — same as you'd write in CRA, Vite, or anywhere else

#### Move 5 — The one-line summary

`"use client"` is the per-file opt-out from React Server Components — the line that says "this component needs the browser to run."

---

## How it works

### Move 1 — The mental model

The mental model is a directive at the top of a file that flips the file from "renders on the server, ships zero JS" to "renders in the browser, ships JS." Everything in the file and everything it imports ends up on the chosen side.

```
src/app/sorting/bubble-sort/page.tsx
─────────────────────────────────────
"use client";                ◀── opt out of RSC
import { useState } from "react";
import { ArrayVisualizer } from "@/components";
...

         │
         │ next build
         ▼
┌────────────────────────────────────────────────┐
│ Server (build-time, runs once)                 │
│   render shell HTML, emit empty mount point    │
└────────────────────────────────────────────────┘
┌────────────────────────────────────────────────┐
│ Client (browser, runs every time)              │
│   download JS bundle for BubbleSort            │
│   React hydrates                                │
│   useState, useEffect, onClick all live         │
└────────────────────────────────────────────────┘
```

The strategy: *the boundary is per file*, marked by a top-level string literal. Without the marker the file lives on the server side; with it, the file (and all its descendants in the import tree) live on the client side.

### Move 2 — The layered walkthrough

**The directive itself**

`"use client"` is a literal string, the very first statement in the file. Not a comment. Not an import. A statement. The Next.js bundler scans for this directive and uses it to decide which side of the RSC boundary the module belongs to.

If you're coming from React 17 or earlier, this looks like the `"use strict"` directive that toggles strict mode. Same idea: a magic string at the top of a file that changes how the surrounding code is treated by the compiler.

```
file header                                what the bundler does
───────────                                ─────────────────────
no directive          ──────▶            treat as server component
"use client";         ──────▶            treat as client component
"use server";         ──────▶            treat as server action module
```

The practical consequence: the boundary is decided at the file level, not the component level. You can't have one component in a file be server and another be client. The whole file picks a side.

**What being a client component actually means**

A client component is a React component that runs in the browser. Same as every component in a Create React App project. The hooks work; the event handlers work; `window` and `document` are reachable from `useEffect`.

If you're coming from frontend with a CRA or Vite background, you've only ever written client components — every component ran in the browser by default. The `"use client"` directive is what restores that default behaviour inside an App Router project, which normally defaults to *server* components.

```
plain React (CRA, Vite, RN)              Next.js App Router
─────────────────────                    ──────────────────
default: client component                default: server component
useState works everywhere                useState only inside "use client"
useEffect works everywhere               useEffect only inside "use client"
```

The practical consequence: a CRA mental model fits a "use client" file unchanged. The visualizer pages are written like CRA pages.

**Why every visualizer page needs the directive**

Open `src/app/sorting/bubble-sort/page.tsx`. The component uses:

- `useState` to hold `inputSize`, `speed`, `bars`, `highlightIndices`, `scanIndices` (L17, L18, L39, L51, L52)
- `useEffect` to kick off the algorithm and reset state on dropdown change (L29, L40, L78)
- `setBars`, `setHighlightIndices` etc. — state setters that cause re-renders
- An `onClick` on the Run button (L109) and Reset button (L113)
- An `async` algorithm function that calls `await delayLoop(speed)` to pace the animation (L54–L76)

Every single one of those requires a client runtime. There is no version of this file that works as a server component. Without `"use client"`, the build fails before it produces output.

```
What the page does                     What that needs
──────────────────                     ───────────────
hold an animating array of bars   ──▶  useState (client)
fire the algorithm on mount       ──▶  useEffect (client)
update bars 200x during sort      ──▶  setBars + re-render (client)
respond to Run/Reset clicks       ──▶  onClick (client)
await delayLoop between steps     ──▶  browser setTimeout (client)
```

The directive is not optional decoration. It's a contractual statement that this file requires a browser runtime, and removing it breaks the build.

**The boundary propagates down the import tree**

Once a file is marked `"use client"`, every component it imports — and every component *those* import — becomes a client component too. The boundary isn't only the page file; it's the whole subtree rooted at that file.

```
src/app/sorting/bubble-sort/page.tsx           "use client"
       │ imports
       ▼
   ArrayVisualizer                              ◀── implicitly client
       │ imports
       ▼
   (any helper components)                      ◀── implicitly client
```

In this codebase, the visualizer components (`ArrayVisualizer`, `BinaryVisualizer`, `GridVisualizer`, etc.) don't need their own `"use client"` directive in *this* tree — they inherit it from the page that imports them. Some carry the directive anyway, because they use hooks directly and the explicit marker makes the file safe to import from a server component too (it forms its own boundary).

The practical consequence: deciding which file gets the directive is an architectural choice. Drawing the boundary high (at the page) means the whole page subtree is client. Drawing it low (at a single interactive widget) means the surrounding shell can be server. This codebase draws it high — the page is the boundary — because every meaningful interactivity happens inside the page.

**Under static export, "server component" means "rendered at build time"**

Normally a server component renders on the server *at request time*. Under `output: "export"`, there is no request-time server — so server components render *at build time* instead, and their output is baked into the static HTML. Client components also render to HTML at build time (the initial pre-render), but they also ship JavaScript that re-runs in the browser to hydrate.

```
                build time                   runtime
                ──────────                   ────────
server          render → HTML (final)        not run
component       no JS sent to browser

client          render → HTML (initial)      hydrate
component       AND send JS bundle           re-run, become interactive
```

The practical consequence in this codebase: every page is a client component, so every page ships JS *and* a pre-rendered initial HTML state. The pre-rendered HTML for `/sorting/bubble-sort` shows the empty initial state (empty bars array, default dropdown values); the browser then runs the JS, which fires `useEffect`, generates random bars, and starts the animation.

### Move 3 — The principle

The principle this exemplifies is *make the runtime explicit at the boundary, not implicit at the call site.* Server components and client components look identical from the outside, but they run in different environments with different capabilities. Without the directive, you'd have to read the imports to know what's allowed. With it, the very first line of the file declares the runtime, so a reader knows what they're looking at before they read a single import.

The deeper consequence in this codebase: drawing the boundary at the page means every visualizer is, effectively, a self-contained mini-SPA. The static-export shell hands off to a client component, and from that point on, the App Router defaults are gone — what runs is normal React.

The full picture is below.

---

## Client component boundary — diagram

```
┌─ Build time ──────────────────────────────────────────────────────────────┐
│                                                                           │
│   next build walks src/app/                                               │
│                                                                           │
│   src/app/layout.tsx        ◀── server component (no directive)           │
│     │  renders <html>, <body>, header, fonts                              │
│     │  builds the page shell                                              │
│     │                                                                     │
│     ▼                                                                     │
│   src/app/sorting/bubble-sort/page.tsx                                    │
│     "use client";                ◀── client boundary starts here          │
│     │                                                                     │
│     │ everything below is a client component                              │
│     ▼                                                                     │
│   imports ArrayVisualizer, BSelect, delayLoop, ...                        │
│     │ inherit client status from the parent boundary                      │
│     ▼                                                                     │
│   pre-render to initial HTML (empty bars, default dropdowns)              │
│                                                                           │
└─────────────────────────────────────────│─────────────────────────────────┘
                                          │
                                          ▼
┌─ Browser (after first paint) ─────────────────────────────────────────────┐
│                                                                           │
│   download page bundle (React + page code + components)                   │
│      │                                                                    │
│      ▼                                                                    │
│   React hydrates the pre-rendered HTML                                    │
│      │                                                                    │
│      ▼                                                                    │
│   useEffect fires:                                                        │
│      generateArrayOfRandomNumbers(inputSize) → setBars(...)               │
│      bubbleSort() starts                                                  │
│      │                                                                    │
│      ▼                                                                    │
│   onClick handlers wired                                                  │
│   state updates trigger re-renders                                        │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `src/app/sorting/bubble-sort/page.tsx`
**Function / class:** module top (directive); `BubbleSort` (default export)
**Line range:** L1 (the directive), L1–L129 (the entire client-component file)

```ts
"use client";

import React, { useState, useEffect } from "react";
import { generateArrayOfRandomNumbers, delayLoop } from "@/utils";
import { ArrayVisualizer, BSelect } from "@/components";

export default function BubbleSort() {
  const [inputSize, setInputSize] = useState(defaultInputSize);
  // ... hooks, effects, async sort function, JSX
}
```

The same pattern repeats across every visualizer route — `src/app/sorting/insertion-sort/page.tsx`, `src/app/trees/binary-search-tree/page.tsx`, `src/app/graphs/finding-shortest-path/page.tsx`, and so on. All start with `"use client"` because all use `useState` + `useEffect` to drive an animation.

**The server boundary:**
**File:** `src/app/layout.tsx`
**Function / class:** `RootLayout` (default export)
**Line range:** L21–L65

No `"use client"` directive — this is a server component. It renders the `<html>` shell, `<body>`, the header, the fonts, the main wrapper. At build time it produces static HTML; at runtime it does not exist. Every page renders inside this shell.

---

## Elaborate

### Where this pattern comes from

React Server Components landed as an experimental feature in React 18 (2022) and became the default in Next.js App Router (Next.js 13, also 2022). The motivation was bundle size and data fetching ergonomics: most components in a typical web app don't need interactivity — they render once and stay static. Shipping JavaScript for those components is wasted bandwidth. RSCs let the framework render them on the server and ship only the HTML; client components are the explicit opt-in for the components that *do* need interactivity. The `"use client"` directive is the visible boundary marker.

### The deeper principle

The deeper principle is *every component has a runtime cost, and the right runtime depends on what the component does.* A component that just renders content doesn't need to hydrate; a component with state does. The boundary makes that distinction visible.

```
Component does what?            Right side of the boundary
────────────────────            ─────────────────────────
renders static markup           server (no JS shipped)
fetches data, renders           server (data fetched on server)
has state, hooks, events        client (JS shipped, hydrates)
needs browser APIs              client (must run in browser)
```

For this codebase the boundary is drawn at every page because every page has state. There is no in-between.

### Where this breaks down

The boundary breaks down when a component sits halfway between server and client — for example, a page that has a small interactive widget at the bottom but is otherwise static. The choices are (1) make the whole page client (cheap but ships JS for the whole page), or (2) keep the page server and isolate the widget in its own `"use client"` file (saves JS but requires splitting the file). For richer apps with mostly-static content + sprinkles of interactivity, the latter is the right call. For this codebase, where every page is a state-driven animation, the boundary at the page is correct.

The boundary also breaks down when shared utilities are used from both sides. A pure function (`delayLoop`, `generateArrayOfRandomNumbers`) works in either world. A function that touches `window` or `document` only works on the client. If you accidentally import a client-only utility into a server component, the build fails.

### What to explore next

- React Server Components → the broader framework concept, of which `"use client"` is the per-file opt-out
- Server Actions (`"use server"`) → the inverse directive; functions marked `"use server"` can be called from client components and run on the server
- Streaming and Suspense boundaries → how App Router renders parts of a server component progressively
- The third-party-component problem → most React libraries written before RSC don't carry `"use client"`; you often have to wrap them in your own `"use client"` re-export

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌─────────────────────┬───────────────────────────┬──────────────────────────────┐
│ Cost dimension      │ Page-level "use client"   │ Component-level "use client" │
│                     │ (taken)                   │ (the alternative)            │
├─────────────────────┼───────────────────────────┼──────────────────────────────┤
│ JS bundle size      │ entire page + imports     │ only the interactive widgets │
│ Per-page            │ trivial — one directive   │ requires identifying which   │
│ implementation      │ at the top of page.tsx    │ children need it             │
│ Reasoning load      │ "the page runs in the     │ "this subtree runs in the    │
│                     │ browser, period"          │ browser, the rest runs on    │
│                     │                           │ the server / at build time"  │
│ Static export       │ all pages pre-render to   │ servable, but split-renders  │
│ compat              │ initial HTML + hydrate    │ at build time get hairier    │
│ Future flexibility  │ can downgrade individual  │ already optimised; harder    │
│                     │ subtrees to server later  │ to expand interactivity      │
│ Initial paint speed │ same — pre-render carries │ marginally faster — less JS  │
│                     │ HTML; only JS download    │ to parse                     │
│                     │ varies                    │                              │
└─────────────────────┴───────────────────────────┴──────────────────────────────┘
```

### Sub-block 1 — what we gave up

The first cost is *bundle weight*. Every page ships the JS for the entire page subtree, including parts that don't need interactivity (the static text at the top of a visualizer page, for example). For a visualizer with a single interactive grid and a paragraph of explanation, the paragraph still ships as JS. At the scale of this site — 15 routes, mostly all interactive — the cost is marginal; the JS bundle is dominated by React itself plus the algorithm logic.

The second cost is *the loss of automatic data-fetching ergonomics*. Server components in App Router can call `await fetch(...)` in their body and have the result be part of the rendered HTML. Client components can't — they have to use `useEffect` + `useState` (or a library like React Query). For this codebase there is no data to fetch, so the cost is zero. For a codebase that grew to load remote content, the page-level client boundary would force every fetch to be a `useEffect`, which is the worse pattern.

The third cost is *no server components for shared layout chrome*. The root layout is server, but the page is fully client. If a future feature wanted "show a server-rendered breadcrumb in the page header that names the current algorithm," it would have to be threaded through a server component above the page — not added inside the page itself.

### Sub-block 2 — what the alternative would have cost

If the page had stayed a server component and the interactivity had been isolated in a child `"use client"` widget, the file split would have looked like:

```
src/app/sorting/bubble-sort/
├── page.tsx              ← server, renders shell, imports the widget
└── BubbleSortWidget.tsx  ← "use client", holds state, animates
```

The cost would have been *one extra file per visualizer*. With 15 visualizers, that's 15 extra files plus the discipline to keep the split correct (every new piece of interactivity has to land in the widget, not the page). The savings would have been the static-only parts of each page (a heading, a description) shipping as HTML instead of JS — bytes the page is already not paying for, because there's not much static markup to begin with.

The alternative also costs *cognitive load*: a developer reading `src/app/sorting/bubble-sort/page.tsx` would have to know to navigate one folder up or one file over to find the interactive part. The current layout has one file per route — the obvious place to look.

### Sub-block 3 — the breakpoint

The current "page is the boundary" call stops being right when a visualizer page gains substantial static content — say a 2000-word writeup of the algorithm above the interactive grid. At that point the static markup is large enough that shipping it as JS becomes wasteful, and the split into `page.tsx` (server, holds the writeup) + `Widget.tsx` (client, holds the animation) becomes the right shape. Below that threshold, the page-level boundary is simpler and the bundle cost is invisible.

### Sub-block 4 — what wasn't actually a tradeoff

Pages Router was technically the option that would have made all of this moot — Pages Router predates RSC and every page is implicitly a client component. Not picking Pages Router was a forward-looking choice; the App Router is what the next ten years of Next.js will be built on, and learning the boundary now means the codebase is shaped right for any future migration off static export.

### Tone

Page-level `"use client"` is the right call when every page is interactive. This codebase is, so it is.

---

## Tech reference (industry pairing)

### React Server Components + `"use client"` directive

- **Codebase uses:** `"use client"` at the top of every visualizer `page.tsx` — see L1 of `src/app/sorting/bubble-sort/page.tsx`. The root layout (`src/app/layout.tsx`) has no directive and stays a server component.
- **Why it's here:** marks the boundary between the static-export server shell (built once) and the interactive client code (runs in the browser). Without the directive, every hook in every visualizer page would fail the build.
- **Leading today:** React Server Components — innovation-leading for full-stack React, 2026.
- **Why it leads:** server components ship zero JS for their own rendering, which collapses bundle size on data-heavy pages; the `"use client"` opt-out makes the runtime explicit per file.
- **Runner-up:** Remix loaders + React Router — adoption-leading among teams that want server-rendered data without committing to the RSC mental model; uses route loaders instead of in-component `await fetch`.

### React 19 hooks (`useState`, `useEffect`)

- **Codebase uses:** `useState` and `useEffect` imports at L3 of `src/app/sorting/bubble-sort/page.tsx`. Every visualizer page uses both.
- **Why it's here:** state is the entire mechanism that drives the animation. The page owns the array of bars, the highlight index, the speed; the animation loop is `setState` → `delayLoop` → `setState`. Without hooks, no interactivity.
- **Leading today:** React hooks — adoption-leading for component-local state across the entire React ecosystem, 2026.
- **Why it leads:** hooks replaced class components in 2019 and have been the universal model since; every modern React tutorial, library, and codebase uses them.
- **Runner-up:** Solid.js signals — innovation-leading for fine-grained reactivity; updates only the DOM nodes that depend on the changed value instead of re-rendering the whole component. Faster, but a different mental model.

### Hydration

- **Codebase uses:** every visualizer page renders to initial HTML at build time, then hydrates in the browser when the JS bundle arrives. Hydration is implicit — set up by Next.js, no codebase-level call to `hydrateRoot`.
- **Why it's here:** the static export needs to ship *something* as initial HTML so the page isn't blank before the JS loads. Hydration attaches React to the existing DOM rather than blowing it away.
- **Leading today:** React 18+ concurrent hydration — adoption-leading inside React's own runtime, 2026.
- **Why it leads:** selective hydration lets React prioritise the parts of the page the user is interacting with first; replaced the all-or-nothing hydration of React 17.
- **Runner-up:** Qwik's resumability — innovation-leading approach that skips hydration entirely by serializing reactivity state into the HTML. Drastically smaller JS payloads but a much smaller ecosystem.

---

## Summary

### Part 1 — concept recap

The client component boundary is the line between code that runs on the server (or at build time) and code that runs in the browser, marked by the `"use client"` directive at the top of a file. In this codebase, every visualizer page declares the directive on line 1 because every page uses `useState`, `useEffect`, and event handlers — all client-only primitives. The constraint that made it the right call is the data shape: every page is a state-driven animation, so every page genuinely needs the browser runtime. The cost is that the page subtree ships as JS instead of being half-rendered to static HTML, but in this codebase the static portion of each page is small enough that the cost is negligible.

### Part 2 — key points to remember

- This pattern lives in checklist step 2 (**Request / response flow** — every page hits the client runtime after the initial HTML lands) and step 4 (**State ownership** — only client components can own React state).
- `"use client"` is a literal string at the top of the file; it's a directive, not a comment, and removing it breaks the build for any file using hooks.
- The boundary propagates *down* the import tree — components imported from a `"use client"` file inherit client-component status.
- The root layout (`src/app/layout.tsx`) has no directive and stays a server component; it renders to HTML at build time and ships zero JS for its own rendering.
- Under static export, "server component" effectively means "rendered once at build time" — there is no server-at-request-time in this codebase.
- The boundary is drawn at the *page* in this codebase because every page is fully interactive; a page-with-mostly-static-content app would draw it lower, at the interactive widget.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about client component boundaries, they're checking whether you understand the React Server Components mental model — specifically, that the default in App Router is *server* and `"use client"` is the opt-out. The naive answer is "I add it because the docs say to." The answer they want is a decision: where you draw the boundary, why you draw it there, and what shipping more or less JavaScript would cost.

### Likely questions

[mid] Q: What does `"use client"` do?

A: It's a directive that marks the file as a client component — code that runs in the browser, can use `useState` and `useEffect`, and gets shipped as JavaScript instead of being rendered server-side. Without the directive, App Router treats the file as a server component, which can't use hooks or event handlers. In this codebase every visualizer page starts with `"use client"` because every page is a state-driven animation built on `useState`.

Diagram:
```
file header                  what the file is
───────────                  ─────────────────
(none)                ──▶    server component
                             - renders on server / at build time
                             - no hooks, no events
                             - zero JS shipped for the component
"use client";         ──▶    client component
                             - renders in the browser
                             - all hooks available
                             - JS bundle shipped + hydrated
```

[senior] Q: Why is every page in this codebase a client component? Couldn't some be server components?

A: Every page is state-driven — there's an array of bars, a speed setting, an animation loop calling `setState` after each step. Server components can't hold state, so the page itself has to be client. I considered pushing the directive lower — keep `page.tsx` as a server component and isolate the interactive part in a child widget — but the static markup on each page is two or three lines, not a writeup. The savings would have been negligible, and the split would have meant two files per visualizer instead of one. At this size, the page-level boundary is simpler and the bundle cost is invisible.

Diagram:
```
What we picked (page-level)        Alternative (widget-level)
─────────────────────────          ─────────────────────────
src/app/sorting/bubble-sort/       src/app/sorting/bubble-sort/
  page.tsx ◀── "use client"          page.tsx ◀── server
                                     Widget.tsx ◀── "use client"
one file per route                  two files per route
whole page in JS bundle             only widget in JS bundle
                                    + small server-rendered shell
```

[arch] Q: If you needed to add a long-form writeup above every visualizer — say a thousand words explaining the algorithm — where would the boundary move?

A: That's the trigger. A thousand words of static markup is real bytes; shipping it as JS would waste them. I'd split each page into `page.tsx` (server, renders the writeup) and `Widget.tsx` (`"use client"`, holds the visualizer state and animation). The page becomes a server component that imports the widget; the writeup ships as HTML, only the widget ships as JS. The migration is mechanical — pull the JSX with hooks into a new file and add `"use client"` to it. The current codebase doesn't earn that split, but the breakpoint is well-defined.

Diagram:
```
Where the boundary lives depends on the static/dynamic ratio

         ┌─ small static, all dynamic ─┐
         │  current state              │
         │                             │
         │  page.tsx  "use client"     │  ◀── one file
         │    state + animation         │     boundary at the page
         │    + a heading              │
         └─────────────────────────────┘

         ┌─ large static, small dynamic ─┐
         │  future state                 │
         │                               │
         │  page.tsx     ◀── server      │  ◀── boundary lowered to
         │    writeup (1000 words)       │     the interactive widget
         │    └── <Widget />             │
         │  Widget.tsx  "use client"     │
         │    state + animation          │
         └───────────────────────────────┘
```

### The question candidates always dodge

Q: Doesn't `"use client"` defeat the whole point of using App Router? Why not just use Pages Router or CRA?

A: Honestly, for a static-export single-runtime app where every page is interactive, the practical difference between App Router with `"use client"` everywhere and Pages Router is small. I picked App Router because that's the direction Next.js is going — Pages Router is deprecated, and any future maintenance happens on App Router. But the question is asking the right thing. *On this site specifically*, I'm not using server components in any meaningful way. The root layout is server, every page is client, and there are no data-fetching benefits because there's no data to fetch. So the boundary is mostly invisible — `"use client"` is six characters at the top of every page and the rest is normal React. The honest answer is: I'm getting almost nothing out of RSC in this codebase, but App Router was the right choice for forward compatibility, not for current functionality.

Diagram:
```
What App Router actually buys here vs an SPA

┌──────────────────────────┬──────────────────────────┬─────────────────────┐
│ Capability               │ Used in this codebase?   │ Worth the migration?│
├──────────────────────────┼──────────────────────────┼─────────────────────┤
│ Server components        │ only root layout         │ marginal            │
│ Data fetching in body    │ no — no remote data      │ no                  │
│ Streaming                │ no — static export       │ no                  │
│ Server actions           │ no — no server           │ no                  │
│ File-based routing       │ yes — every page         │ yes                 │
│ Future SSR migration     │ yes — bend-not-break     │ yes                 │
└──────────────────────────┴──────────────────────────┴─────────────────────┘

→ The win is the future-proofing, not the immediate features.
```

### One-line anchors

- "App Router defaults to server components; `"use client"` is the opt-out, and every interactive page needs it."
- "I draw the boundary at the page in this codebase because every page is state-driven — there's no meaningful static subtree to keep on the server."
- "Server components under static export are rendered once at build time; client components are rendered at build time *and* hydrated in the browser."
- "The breakpoint is large static content per page — when that arrives, the boundary drops to the interactive widget and the page becomes a server component."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On paper, draw the boundary between server and client in a visualizer route. Show what runs at build time, what runs in the browser, and what crosses the boundary. Label the directive that marks the boundary.

Open the file and compare against the *Client component boundary — diagram* section.

- Pass: you showed `src/app/layout.tsx` on the server side, `src/app/sorting/bubble-sort/page.tsx` on the client side, and named `"use client"` as the marker
- Fail: re-read Move 2 and try again

### Level 2 — Explain it out loud

Explain the `"use client"` directive to a colleague who's only worked with CRA or Vite. No notes. Under 90 seconds.

Checkpoints — did you:
- Name the specific file (`src/app/sorting/bubble-sort/page.tsx` L1)?
- Say why this approach was chosen over keeping pages as server components?
- Name the tradeoff in one sentence (the page subtree ships as JS instead of partly as HTML)?

### Level 3 — Apply it to a new scenario

You're asked to add a "tip of the day" card to every visualizer route that renders some static markdown content fetched at build time. Where does the markdown rendering go — inside `page.tsx`, or in a sibling component? What changes about the boundary?

Write your answer (3–5 sentences), then open `src/app/sorting/bubble-sort/page.tsx` and reason through what would happen if you tried to call `await readMarkdown()` inside `BubbleSort`.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: *page-level boundary ships more JS than a widget-level boundary would*. Answer in writing:

"If you were starting this project today and expected the visualizer pages to grow long-form algorithm explanations alongside the interactive widgets, would you still put `"use client"` at the page level? What would the file split look like instead?"

Reference `src/app/sorting/bubble-sort/page.tsx` and `src/app/layout.tsx` to support your answer.

### Quick check — code reference test

Without opening any files, answer:
- What's the exact text of the directive at the top of `src/app/sorting/bubble-sort/page.tsx`?
- Does `src/app/layout.tsx` have a `"use client"` directive?
- Roughly where in the page file (top? bottom? before/after imports?) does the directive live?

Then open the files and verify.
