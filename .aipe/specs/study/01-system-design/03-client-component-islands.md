# Client component islands

**Industry name(s):** Islands architecture, "use client" boundary, React Server Components + client components
**Type:** Industry standard

> The home page is server-rendered React (no JS needed to read it); each visualizer page declares `"use client"` at the top because it needs `useState`, `useEffect`, and event handlers.

**See also:** → [01-static-export-spa](./01-static-export-spa.md) · → [02-app-router-routing](./02-app-router-routing.md) · → [05-animation-loop-pattern](./05-animation-loop-pattern.md)

---

## Why care

You've seen a "View Source" on a React app and watched it return a near-empty `<div id="root"></div>`. The page was all JavaScript. Now imagine the opposite — open View Source and the whole article is already there as text and HTML; only the comment box at the bottom shows up as a script. The article is static; the comment box is an *island* of interactivity in a sea of pre-rendered content.

That's the **islands architecture**: pre-render whatever doesn't need interaction, ship JS only for the bits that do. Same idea behind Astro's `client:load`, Marko's progressive enhancement, and Next.js' RSC + `"use client"` boundary. The win is less JS to download and parse. Here's how that boundary actually sits in this codebase.

---

## How it works

Picture a museum with two kinds of rooms: photo galleries you walk through silently, and an interactive exhibit where you press buttons. The galleries are pre-built before opening; the exhibit needs running electronics. Both rooms are in the same museum, but they have different "shipping costs" — the gallery is just walls and prints, the exhibit needs power and a maintenance contract.

### Server components by default

In the App Router, every component is a Server Component unless it opts out. **If you're coming from frontend with classic React, you're used to every component being a Client Component — they all run in the browser. Here it's different**: components without `"use client"` at the top run *only at build time* (or at request time in server-mode Next), and what reaches the browser is the HTML they produced, plus a small RSC payload describing the tree.

The home page demonstrates this:

```
// src/app/page.tsx — no "use client" directive
import Hero from "@/components/Home/Hero";
import FeaturedProjects from "@/components/Home/FeaturedProjects";
import Concepts from "@/components/Home/Concepts";
import Footer from "@/components/Home/Footer";

export default function Home() {
  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-6 text-left">
      <Hero />
      <FeaturedProjects />
      <Concepts />
      <Footer />
    </div>
  );
}
```

The practical consequence: this code never runs in the browser. At build time, `next build` invokes it, produces HTML, and that HTML lands in `out/index.html`. The four children (`Hero`, `FeaturedProjects`, `Concepts`, `Footer`) are also server components (none of them declares `"use client"`), so they also run server-side. The home page ships *no React JS* for its own logic — only the React runtime that any embedded client island would need.

### The `"use client"` directive as a boundary marker

A visualizer page can't be server-only — it needs `useState` to hold the bars array, `useEffect` to kick off the animation, and event handlers on Run/Reset buttons. **This is like React's "this component needs hooks" — except now the framework needs you to declare it explicitly so it can decide what to ship.**

```
// src/app/sorting/bubble-sort/page.tsx:1
"use client";

import React, { useState, useEffect } from "react";
...
```

That one line at the top changes everything downstream: this file and every component it imports become part of the client bundle. The build emits the page's HTML *and* the JS needed to hydrate it.

The boundary condition: `"use client"` propagates *down* (imports become client too) but not *up* (parents can stay server). Mixing is allowed in one direction only — a server component can render a client component, but a client component can only render other client components (or pass through `children` from a server parent).

```
Allowed:                              Not allowed:

ServerLayout                          ClientPage
  └─ ClientPage                         └─ ServerComponent   ✗
      └─ ClientComponent                    
                                        (server can't run in browser)
```

### What lives where in this codebase

Look at the boundary in practice:

```
Server (pre-rendered, no JS for own logic):
  src/app/layout.tsx              ← header, nav, footer wrapper
  src/app/page.tsx                ← home page
  src/components/Home/Hero.tsx
  src/components/Home/FeaturedProjects.tsx
  src/components/Home/Concepts.tsx
  src/components/Home/conceptsData.tsx
  src/components/Home/Footer.tsx

Client ("use client" — ships JS):
  src/app/sorting/*/page.tsx      ← every visualizer page
  src/app/trees/*/page.tsx
  src/app/graphs/*/page.tsx
  src/app/recursions/*/page.tsx
  src/components/ArrayVisualizer/ArrayVisualizer.tsx
  src/components/GridVisualizer/GridVisualizer.tsx
  src/components/NetworkDiagram/NetworkDiagram.tsx
  src/components/CallstackVisualizer/CallstackVisualizer.tsx
```

The home page is fully static markup at the binary level — even with JS disabled, you can read it and click through to any visualizer. The visualizers themselves require JS (no JS = no animation, no buttons), which is correct because the *whole point* of those pages is interactivity.

### The principle

This is what people mean when they say "ship less JavaScript." The principle isn't "avoid React" — React is fine. The principle is that *static content is cheaper than dynamic content*, and the framework should let you mark which is which. Most modern frameworks (Next, Astro, Remix, Qwik) have some version of this boundary. The interesting part is what default they pick: Next defaults to *server* (opt into client), Astro defaults to *static* (opt into hydration), classic React defaults to *client* (everything is JS).

The full picture is below.

---

## Client component islands — diagram

```
┌─ Build time ─────────────────────────────────────────────────────────┐
│                                                                      │
│  src/app/                                                            │
│  ├─ page.tsx              [SERVER]   →   pre-rendered HTML           │
│  │  ├─ Hero               [SERVER]   →   inlined                     │
│  │  ├─ FeaturedProjects   [SERVER]   →   inlined                     │
│  │  ├─ Concepts           [SERVER]   →   inlined                     │
│  │  └─ Footer             [SERVER]   →   inlined                     │
│  │                                                                   │
│  └─ sorting/bubble-sort/page.tsx     "use client"                    │
│     ├─ React            [CLIENT]     →   bundled to _next/static/    │
│     ├─ ArrayVisualizer  [CLIENT]     →   bundled                     │
│     └─ delayLoop        [CLIENT]     →   bundled                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  ship to CDN
┌─ Browser (request /sorting/bubble-sort) ─────────────────────────────┐
│                                                                      │
│  1. Receive out/sorting/bubble-sort/index.html (already-rendered)    │
│     ┌─ Server-rendered shell (from RootLayout) ──────────────┐       │
│     │   <header>github · linkedin · email</header>           │       │
│     └────────────────────────────────────────────────────────┘       │
│     ┌─ Client island (BubbleSort page + ArrayVisualizer) ────┐       │
│     │   <ul>...</ul> <div>...bars...</div>  ← static markup  │       │
│     └────────────────────────────────────────────────────────┘       │
│                                                                      │
│  2. Download _next/static/<hash>/bubble-sort-<hash>.js                │
│  3. React hydrates the island → useState/useEffect mount → animate   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Server boundary anchor:** `src/app/page.tsx` L1–L15 (no `"use client"`).
**Client boundary anchor:** `src/app/sorting/bubble-sort/page.tsx` L1 (`"use client"`); same shape on every other visualizer page.
**Mixed layout:** `src/app/layout.tsx` L1–L65 — server component, but renders `{children}` which is whichever page (server or client) the route resolves to.

GitHub: `[src/app/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/page.tsx)` (server) vs `[src/app/sorting/bubble-sort/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/sorting/bubble-sort/page.tsx#L1)` (client).

---

## Elaborate

### Where this pattern comes from
The term "islands architecture" was coined by Katie Sylor-Miller (Etsy) and popularized by Jason Miller (Preact) in 2020 to describe the pattern Astro had baked in from launch. The underlying observation — "interactive widgets are a small fraction of most pages" — predates the term; Marko did it in 2014; even the classic web of `<script>` tags inside otherwise-static pages is the same idea. React Server Components (2020 RFC, shipped in Next 13's App Router) brought the pattern into the React mainstream.

### The deeper principle
*Defaults shape behaviour at scale.* A framework that defaults to client-side rendering accumulates JS over time because every component might be the one that needs interactivity, so you might as well make it client. A framework that defaults to server-side flips the gravity — you only ship JS when you actively need it. For a long-lived codebase, this compounds.

### Where this breaks down
- Pages where *everything* is interactive (a SPA dashboard) — server components add ceremony with no benefit.
- Components that need server data *and* client interactivity in the same place — you have to split the component or pass data through props.
- Libraries authored before RSC — many force `"use client"` because they use hooks internally. This means dependency choices leak into your boundary placement.

### What to explore next
- [04-component-composition](./04-component-composition.md) — how server and client components compose.
- [07-d3-imperative-with-useeffect](./07-d3-imperative-with-useeffect.md) — a place where client-only behaviour is unavoidable.
- [05-animation-loop-pattern](./05-animation-loop-pattern.md) — why every visualizer must be a client component.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬────────────────────────┬────────────────────────┐
│ Cost dimension   │ Server-by-default      │ Client-by-default      │
├──────────────────┼────────────────────────┼────────────────────────┤
│ JS bundle size   │ Smaller (only islands) │ Larger (all React)     │
│ Time to interact │ Same on islands;       │ Slower — hydrate all   │
│                  │ instant on static      │                        │
│ Dev velocity     │ Slower — boundary mgmt │ Faster — no rules      │
│ Onboarding       │ "What's a client comp"?│ Familiar React         │
│ Static export    │ Works natively         │ Needs careful checks   │
│ Lib compat       │ Some libs force client │ All libs work          │
│ Mental model     │ Two runtimes           │ One runtime            │
└──────────────────┴────────────────────────┴────────────────────────┘
```

### What we gave up

Mental simplicity. New contributors to a Next.js App Router project need to learn the boundary rules: which file needs `"use client"`, what happens when a server component imports a client component, why a client component can't pass a function prop *up*. That's a real cost — maybe 1–2 hours of confusion the first time, and occasional "wait, can I import this here?" friction afterward.

Library friction. A React component library that uses hooks internally (which is nearly all of them) ships with `"use client"` baked in. Importing it from a server component is fine — it just becomes a client boundary at that point — but it means you can't *force* a piece of UI to stay server just by avoiding client features yourself.

### What the alternative would have cost

If the whole app were "use client" everywhere, the home page would ship the React runtime + every component's code, even though none of it actually does anything interactive on the home page. For this site that's a small absolute number — the home page is small — but the principle is wrong. Every page should ship the minimum needed to render itself; the home page needing zero JS for its own logic is the right shape, even if the absolute savings are tiny.

The build pipeline would also be less helpful. With the boundary, Next can statically analyse which components reach which routes and emit a per-route bundle. Without the boundary, every route would tend toward a single shared bundle, and tree-shaking would have to work harder.

### The breakpoint

Fine until the site grows interactive features in places that are currently static. The day the home page gets a "live project status" widget that fetches data, that widget becomes a `"use client"` island — and that's correct: the rest of the home page stays server, only the widget pays for JS.

### What wasn't actually a tradeoff

A purely-static-HTML approach (no React at all, just hand-written HTML). That's not on the table because the visualizers fundamentally need React's state model — there's no clean way to do `useState`-driven animation with vanilla JS in a way that's easier to maintain than what's here. The React server/client split is *the right shape*, not a compromise.

---

## Tech reference (industry pairing)

### React Server Components (RSC)

- **Codebase uses:** RSC for every component in `src/app/` and `src/components/Home/` that doesn't carry `"use client"`. Default behaviour in Next 15 App Router.
- **Why it's here:** the mechanism that lets the home page ship as pure HTML with no JS for its own logic.
- **Leading today:** RSC + Next.js App Router — `adoption-leading` for full-stack React, 2026.
- **Why it leads:** the only RSC implementation that's gone through a major framework's stability cycle; the rest of the ecosystem follows Next's lead on this.
- **Runner-up:** Astro islands — `innovation-leading` for content-first sites. Different model (multi-framework islands, smaller default JS) but solves the same problem.

### The "use client" directive

- **Codebase uses:** `"use client"` at the top of every visualizer page + visualizer component. It's not an import, it's a literal string-as-statement.
- **Why it's here:** the bundler reads it to decide whether to compile this file as a server or client module.
- **Leading today:** the directive shape — `adoption-leading` for RSC-aware bundlers, 2026.
- **Why it leads:** standardised by the React core team; Next.js, Remix's RSC work, and others all honor the same string.

---

## Summary

### Part 1 — concept recap

Client component islands is the technique where pages are server-rendered by default and only the interactive parts opt into client-side React via `"use client"`. reincodes uses this to keep the home page (`src/app/page.tsx` and its children) shipping as pure HTML, while every visualizer page (`src/app/<category>/<algo>/page.tsx`) declares `"use client"` because it needs `useState` + `useEffect` + event handlers. The constraint that forces the choice is "we want the home page to be readable with zero JS but the visualizers must run JS," and the cost paid is the mental overhead of remembering which side of the boundary each file lives on.

### Part 2 — key points to remember

- Server is the default in App Router; `"use client"` opts in for hooks and event handlers.
- The boundary propagates *down* — once a file is client, everything it imports is too — but server-to-client renders are fine via `children`.
- The home page ships zero JS for its own logic; visualizer pages ship the React bundle they need.
- Lives in step 2 (Request/response flow) and step 4 (State ownership) of the system-design checklist — the boundary decides where state can live (only on the client side) and what the browser receives (HTML + minimal JS).
- The cost is mental: contributors must understand the boundary rules, and library imports can leak `"use client"` into places you didn't choose.

---

## Interview defense

### What an interviewer is really asking

When someone asks about RSC, they want to know whether you understand *what gets shipped to the browser* in each case — not the buzzword, the bytes. The honest answer here is: server components never reach the browser as code, only as the HTML they rendered; client components ship as JS bundles that hydrate.

### Likely questions

**Q [mid]: How do I know if a component should be client or server?**

A: Two questions. Does it use `useState`, `useEffect`, `useReducer`, `useContext`, or any other hook? Does it attach event handlers (`onClick`, `onChange`, etc.)? If yes to either, it must be a client component — add `"use client"` at the top. If no, leave it server by default. In this codebase, the home page never needs either (it just renders static data), so it stays server; every visualizer needs both, so they're client.

```
       Does it need state or events?
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
       yes                 no
        │                   │
        ▼                   ▼
"use client"          stay server
```

**Q [senior]: A new contributor adds `"use client"` to `Concepts.tsx` because they want to add hover analytics. What's the downstream impact?**

A: `Concepts.tsx` becomes a client component, which means its code now ships to the browser. Worse, anything `Concepts.tsx` imports also becomes client by reachability — including `conceptsData.tsx` which has inline SVG components. The hover-analytics use case probably doesn't need the entire concepts grid to ship as JS; the right fix is to extract just the hoverable bits into a small client component and keep `Concepts.tsx` as a server component that renders that client child. The tradeoff: more files, but the bundle stays minimal.

```
┌── New contributor's path ─┐    ┌── Better path ────────────┐
│  "use client" on Concepts │    │  Keep Concepts server     │
│  Whole grid ships as JS   │    │  Extract <HoverTracker/>  │
│  ~30KB extra              │    │  ~1KB extra               │
│  All children become client│    │  Surgical boundary        │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: What happens at scale — say 200 visualizers each with their own client bundle?**

A: Next.js shares a common chunk across pages, so React itself ships once. Each per-page bundle holds only that page's unique code. At 200 pages the build time grows linearly (each route needs to render + emit), and the JS bundle per visualizer stays ~constant (10–30KB). What breaks first is build duration, not browser performance — at thousands of routes you'd want incremental builds (`output: "export"` doesn't do this; you'd need to move to ISR or similar). The browser doesn't care if there are 200 routes or 20; it loads one route at a time.

```
At 200× routes:
┌─ Per-route bundle ─────┐
│  ✓ stays small (10K)   │  ← no change
└────────────────────────┘
┌─ Shared chunk ─────────┐
│  ✓ stays small         │  ← no change
└────────────────────────┘
┌─ Build duration ───────┐
│  ⚠ grows linearly       │  ← breaks first
│  fix: ISR or partial   │
│       static builds    │
└────────────────────────┘
```

### The question candidates always dodge

**Q: You said the home page ships zero JS for its own logic. But the browser still downloads the React runtime to hydrate any client children that get clicked. Isn't "zero JS" misleading?**

A: Fair pushback. To be precise: the home page itself contributes zero JS to the bundle. The React runtime ships because *any* page on the site that has a client island needs it, and Next ships it as a shared chunk used across all routes. So when a user lands on the home page, they do download the shared chunk — but they'd have downloaded it on the very next click anyway when they navigated to a visualizer. The "savings" are real for the home-page-only visitor (who reads, doesn't click); marginal for the typical visitor (who clicks through). The right framing is "per-page incremental JS is zero on the home page" — not "zero JS, full stop."

```
┌── What we picked ─────────┐    ┌── What I implied ─────────┐
│  Server home page         │    │  "Zero JS on home"        │
│  Page-specific JS: 0      │    │  Reality: shared React    │
│  Shared React: ~50KB      │    │  bundle still ships       │
│  (downloads on first      │    │                           │
│   client interaction)     │    │                           │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Server by default; `"use client"` opts in."
- "The boundary propagates *down* but not *up*."
- "Server components never reach the browser as code — only as the HTML they rendered."
- "RSC is the bet that defaults matter at scale."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Draw the boundary: left side, the home-page tree (all server); right side, a visualizer page tree (all client). Mark the transition point.

### Level 2 — Explain it out loud

Explain to a colleague: "Why doesn't `Hero.tsx` need `"use client"` but `BubbleSort/page.tsx` does?" Under 90 seconds.

Checkpoints:
- Name the specific test? → "does it use hooks or event handlers?"
- Say what shipping cost server vs client carries? → server = zero JS for its own logic; client = bundled into JS.
- Name the propagation rule? → `"use client"` flows down through imports.

### Level 3 — Apply it to a new scenario

Without looking: "I want to add a search input at the top of the home page that filters featured projects as I type. What changes — does the home page become a client component, or just the input?"

Write 3–5 sentences. Then open `src/app/page.tsx` and confirm what would need editing.

### Level 4 — Defend the decision you'd change

"If you could use only one — pure server-rendered HTML or pure client SPA — which would you pick for this site and why?"

### Quick check — code reference test

- Which directive marks a client component?
- Which file demonstrates the server default?
- Which file demonstrates the client boundary?

✓ Pass: `"use client"`, `src/app/page.tsx`, any `src/app/<route>/page.tsx` with the directive at the top.
