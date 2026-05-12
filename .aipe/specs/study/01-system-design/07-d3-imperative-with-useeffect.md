# d3 imperative DOM mutation inside useEffect

**Industry name(s):** Escape-hatch rendering, imperative DOM in React, d3-managed subtree
**Type:** Industry standard (composition of React's `useEffect` + d3's selection API)

> The Network diagram uses d3-force to compute layout and mutate SVG nodes imperatively inside a single `useEffect` — React holds the outer `<svg>` but doesn't manage its children.

**See also:** → [03-client-component-islands](./03-client-component-islands.md) · → [05-animation-loop-pattern](./05-animation-loop-pattern.md)

---

## Why care

You've tried rendering 500 nodes of a force-directed graph in pure React and watched the frame rate collapse. Every node position update re-rendered every component; reconciliation traced thousands of elements. Then you let d3 manage the DOM directly inside a single `useEffect` and the same 500 nodes ran at 60fps.

This is the **escape hatch** — the moment a React app *deliberately* hands a subtree to a non-React library. The pattern shows up wherever React's reconciler is the wrong tool: WebGL canvases (three.js, regl), maps (Leaflet, MapLibre), rich-text editors (TipTap, Lexical), and d3-style visualisations. The win is performance + access to the library's idioms; the cost is that the escape-hatch subtree no longer follows React's rules. Here's how that boundary sits in this codebase.

---

## How it works

Imagine a museum exhibit room where the curator says: "React, you own the outer walls and the door, but the exhibit inside is mine — d3-force will arrange the pieces." React doesn't touch the exhibit; d3 doesn't touch the walls. The contract is clear: where React stops and where d3 starts.

### The shell that stays React's

```
// src/components/NetworkDiagram/NetworkDiagram.tsx (excerpt)
"use client";
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';

export const NetworkDiagram = ({ width, height, data, highlightNodes = [] }: NetworkDiagramProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.attr('width', width).attr('height', height);

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).distance(90).id(d => d.id))
      .force('collide', d3.forceCollide().radius(30))
      .force('charge', d3.forceManyBody())
      .force('center', d3.forceCenter(width / 2, height / 2));

    simulation.on('tick', () => {
      // d3 mutates svg children directly here
    });
  }, [data]);

  return (
    <div>
      <svg ref={svgRef} />
    </div>
  );
};
```

**If you're coming from frontend, you're used to React owning the entire DOM subtree under a component — here it's different**: React owns the outer `<svg>` (because it's in JSX), but everything *inside* the `<svg>` (the `<circle>` nodes, `<line>` edges, `<text>` labels) is created and updated by d3 imperatively.

The practical consequence: React's diffing never sees the circles. When d3 calls `simulation.on('tick', ...)` 60 times a second, each tick reads the new node positions from the force simulation and writes them directly to SVG attributes (`cx`, `cy`, `x1`, `y1`, etc.). React knows nothing about it. No re-render, no reconciliation, no overhead. The forcefield-style animation runs at native SVG performance.

### The `useRef` as the handoff

```
const svgRef = useRef<SVGSVGElement>(null);
// ...
<svg ref={svgRef} />
```

**This is like a vanilla DOM `getElementById` — except React gives you the reference at the right lifecycle moment.** `useRef` here doesn't hold "state" in the React sense; it holds a pointer to the rendered DOM node. After the component mounts, `svgRef.current` is the `<svg>` element, and that's what `d3.select(...)` walks into.

The boundary condition: if the parent re-renders the `<svg>` (e.g., with a new `key` prop), `svgRef.current` points to a *new* DOM node, but the `useEffect`'s dependency array only refires on `[data]` change. There's a real risk of leaking the old simulation; in this codebase the pattern is safe because the dependency on `data` covers the only path that'd require recreation.

### The d3 entry pattern

Inside the tick callback, d3 uses its selection API to add/update/remove SVG children:

```
simulation.on('tick', () => {
  // Update lines (edges)
  const links = svg
    .selectAll('.link')
    .data(data.links)
    .join('line')
    .attr('class', 'link')
    .style('stroke', '#999');

  // Update circles (nodes)
  const nodes = svg.selectAll('.node').data(data.nodes);
  nodes.exit().remove();

  const group = nodes.enter().append('g');
  group.append('circle')
    .attr('id', item => item.id)
    .attr('class', 'node')
    .attr('r', 15)
    .style('fill', 'gray')
    .on('click', event => { /* ... */ });

  group.append('text')
    .style('fill', '#fff')
    .attr('class', 'text')
    .attr('text-anchor', 'middle')
    .text(d => d.id);

  // Position from force simulation
  links
    .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x).attr('y2', d => d.target.y);

  nodes.attr('cx', d => d.x).attr('cy', d => d.y);
});
```

**This is like jQuery, but typed and with force-physics built in** — `selectAll().data().join()` is d3's "enter/update/exit" pattern that handles "for each datum, ensure there's exactly one DOM element bound to it." The first tick creates everything; subsequent ticks just update positions.

### The traversal animation hand-back to React state

After the force simulation settles, the component plays a BFS traversal by walking the highlight list and turning circles red:

```
.on('end', () => {
  d3.selectAll('.node').style('fill', 'gray');  // reset

  const traverseNodes = async (highlightNodes) => {
    for (let i = 0; i < highlightNodes.length; i++) {
      const query = d3.select(`[id='${highlightNodes[i]}']`);
      query.style('fill', 'red');
      await delayLoop(1000);
    }
  };
  traverseNodes(highlightNodes);
});
```

**This is the same `await delayLoop` pattern from `05-animation-loop-pattern.md`, but the mutation is on d3-managed DOM, not React state.** Yet again React doesn't see the colour change; d3 sets `style.fill` directly. The cost: the highlight state isn't introspectable by React DevTools.

### The principle

This is what people mean by "use the right tool for the subtree." React is excellent at declarative UI with stable trees; it's wasteful for force-directed simulations where every node mutates every frame. By giving d3 the inside of one `<svg>`, the rest of the React app continues with its strengths intact — server components, the App Router, the `delayLoop` algorithm pattern — and only the visualization pays the d3 imperative tax where it actually earns it.

The full picture is below.

---

## d3 + useEffect — diagram

```
React's domain
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  <div>                                                      │
│    <svg ref={svgRef} />   ← React renders this              │
│  </div>                                                     │
│                                                             │
│  ┌─ React boundary ────────────────────────────────────┐    │
│  │  • outer structure, props, lifecycle              │    │
│  │  • mount → useEffect runs                         │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼  hand-off via svgRef.current
                       │
d3's domain
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  d3.select(svgRef.current)                                  │
│    │                                                        │
│    ├─ forceSimulation(nodes, links)                         │
│    │   .force('link', ...).force('charge', ...) ...         │
│    │                                                        │
│    └─ on('tick', () => {                                    │
│         selectAll('.node').data(...).join('circle')         │
│         selectAll('.link').data(...).join('line')           │
│         circle.attr('cx', d.x).attr('cy', d.y)              │
│         line.attr('x1', ...).attr('y1', ...) ...            │
│       })                                                    │
│                                                             │
│  ┌─ Performance ───────────────────────────────────────┐    │
│  │  60fps; SVG attributes mutated directly             │    │
│  │  React's reconciler never traces these children    │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Hand-off point:** `src/components/NetworkDiagram/NetworkDiagram.tsx` L34–L46 — `useRef<SVGSVGElement>` + `<svg ref={svgRef} />`.
**d3 simulation:** L62–L72 — `d3.forceSimulation` configuration.
**Tick handler:** L80–L172 — the per-frame mutation block.
**Traversal animation:** L174–L189 — `await delayLoop` + `style('fill', 'red')`.

GitHub: `[NetworkDiagram.tsx](https://github.com/rlynjb/reincodes/blob/main/src/components/NetworkDiagram/NetworkDiagram.tsx)`.

---

## Elaborate

### Where this pattern comes from
d3 (2011) predates React by two years; early React + d3 attempts tried to fully reconcile d3-managed SVG, which fought both libraries. The "React owns the shell, d3 owns the children" pattern emerged in community blog posts ~2016 and became canonical (Amelia Wattenberger's writing is a good reference). The broader pattern — "library X owns this DOM subtree, React owns the rest" — applies to three.js (canvas), Leaflet (map tiles), and rich-text editors.

### The deeper principle
*Reconciliation has a cost; declarativeness has limits.* For trees with thousands of frequently-mutating nodes (force layouts, particle systems, canvas-based vizzes), imperative mutation is orders of magnitude cheaper than declarative re-render. The pattern is "use React where it's strong; escape where it's weak."

### Where this breaks down
- Sharing state between the d3 subtree and React state. The traversal animation in this codebase reads `highlightNodes` from React props but writes back to the DOM, not to React state — making "current colour" un-introspectable from React.
- Strict-mode double-invocation. React 18 strict mode runs effects twice in dev; if the d3 setup creates a simulation, the second run might create a second simulation racing the first. Mitigation: return a cleanup function from `useEffect` (this codebase doesn't, which is technically a latent bug).
- SSR. The pattern requires a real DOM. d3-managed subtrees can't be server-rendered.

### What to explore next
- [03-client-component-islands](./03-client-component-islands.md) — why `NetworkDiagram` *must* be a client component.
- [05-animation-loop-pattern](./05-animation-loop-pattern.md) — the traversal animation reuses the same `delayLoop` pattern.
- [02-dsa/11-graph-adjacency-list](../02-dsa/11-graph-adjacency-list.md) — the graph data model `NetworkDiagram` consumes.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ d3 imperative (picked)   │ Pure-React render        │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Frame rate       │ 60fps (SVG attr mutate)  │ Falls off at ~100 nodes  │
│ Code shape       │ One useEffect + d3 idiom │ N components, each typed │
│ React DevTools   │ Children invisible       │ Full tree visible        │
│ State sharing    │ Manual (ref + effect)    │ Native (props/context)   │
│ SSR              │ Impossible               │ Possible (mostly)        │
│ Library size     │ d3 + d3-force (~70KB)    │ Zero extra               │
│ Learn curve      │ d3 selection idiom       │ React idiom only         │
│ Cleanup          │ Manual (effect return)   │ Automatic                │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

React-visible tree. `NetworkDiagram`'s `<svg>` shows up in React DevTools as a single empty element — the circles, lines, and text inside are d3's, invisible to React. That means: you can't write a unit test that asserts "the node with id=3 has fill=red" using React testing utilities; you'd have to use d3 selectors or DOM queries. For this codebase that's tolerable (no tests), but it's a real downside in test-heavy environments.

Strict-mode safety. React 18 strict mode invokes effects twice in development to catch bugs. The current `useEffect` doesn't return a cleanup function; the second run creates a second `forceSimulation` on top of the first. In dev this is harmless cosmetic glitch; in prod the effect only runs once per dependency change. Still: the right shape is to return a cleanup that calls `simulation.stop()` and removes the d3-managed children.

Cleanup ergonomics. If `data` changes, the effect re-runs, but the old simulation isn't stopped and the old DOM children aren't removed — leading to potential accumulation. This codebase doesn't hit it (the `data` prop doesn't change after mount), but the pattern is fragile.

### What the alternative would have cost

A pure-React force-graph would mean: each node a `<circle>` component, each edge a `<line>` component, plus a `useState` (or `useReducer`) holding all positions, plus a `useEffect` running the force loop and `setState`-ing positions on every tick. At 60fps with ~10 nodes that *would* work; at 100 nodes it'd stutter; at 1000 nodes it'd be unusable. The force-graph in this codebase is small, but the *pattern* is wrong even at small sizes — reconciling 30 components 60 times per second is wasteful.

There are React-idiomatic graph libraries (react-flow, visx) — those use the same escape-hatch pattern internally; they just hide it from you.

### The breakpoint

Fine until strict-mode bugs surface in dev or until `data` changes after mount (which would leak old simulations). If reincodes added interactive graph editing (drag a node, add an edge), the effect would need proper cleanup and dependency tracking — at which point the file would grow significantly.

### What wasn't actually a tradeoff

Canvas vs SVG. Both work for force-directed graphs; SVG is easier for click handlers and accessibility, canvas is faster at thousands of nodes. For ~15-node test data, SVG is the right choice — the d3 ergonomics with selection/enter/update/exit work cleanly on SVG.

---

## Tech reference (industry pairing)

### d3 v7 + d3-force

- **Codebase uses:** `d3` 7.9.0 + `d3-force` 3.0.0 for force simulation, selection, attribute setting.
- **Why it's here:** the force-physics simulation that lays out the network nodes and the selection API that mutates SVG.
- **Leading today:** d3 — `adoption-leading` for custom data visualization, 2026. Plain d3 is still the lingua franca for "I need to render something the chart libraries don't have."
- **Why it leads:** the most expressive data-binding API in the JS visualization space; every other library either wraps d3 or is judged against it.
- **Runner-up:** Visx — `innovation-leading` React wrappers around d3 primitives; loses some d3 idioms but composes naturally with React. Choose if the chart is mostly standard (line, bar) and React state needs deep integration.

### Imperative escape from React

- **Codebase uses:** `useRef<SVGSVGElement>` + `useEffect` + `d3.select`.
- **Why it's here:** the canonical pattern for "give me the DOM node, I'll handle it from here."
- **Leading today:** `useRef` + `useEffect` — `adoption-leading` for React DOM escape hatches, 2026.
- **Why it leads:** baked into React since hooks (2018); the only way to integrate non-React DOM libraries cleanly.

---

## Summary

### Part 1 — concept recap

The pattern is to let d3 manage the DOM inside one `<svg>` while React manages everything around it, using `useRef` to hand the SVG node to `d3.select` inside `useEffect`. reincodes uses this in `NetworkDiagram.tsx`: React renders the outer `<svg>`, d3's force simulation lays out nodes on every tick and mutates SVG attributes directly, and the BFS traversal animation runs as `await delayLoop` + d3 `style` calls. The constraint that forces the choice is "force-physics at 60fps with React reconciliation is wasteful," and the cost paid is that the d3-managed subtree is invisible to React DevTools and strict-mode-unsafe without explicit cleanup.

### Part 2 — key points to remember

- React owns the shell (the outer `<svg>`); d3 owns the children (`<circle>`, `<line>`, `<text>`).
- `useRef` is the hand-off — it holds the DOM node, not React state.
- d3's tick handler mutates SVG attributes 60 times per second; React never sees those mutations.
- Lives in step 2 (Request/response flow — the "request" here is per-tick layout) and step 4 (State ownership — the rendered positions live in d3-internal state, not React) of the system-design checklist.
- The cost is real: no React DevTools visibility, no automatic cleanup, no strict-mode safety unless you return a cleanup function.

---

## Interview defense

### What an interviewer is really asking

When someone asks why you mixed d3 with React, they want to know whether you understand the *reconciler cost* — that React's diff is real overhead, and for fast-mutating trees it's the wrong abstraction. The honest answer names: d3 mutates attributes directly; React would reconcile thousands of components per frame.

### Likely questions

**Q [mid]: What does `useRef` do here that `useState` couldn't?**

A: `useRef` gives me a stable reference to a DOM node without triggering re-renders when the ref is set. `useState` would re-render on every set, and the `<svg>` ref doesn't change after mount anyway — there's nothing to re-render. The contract: `svgRef.current` is `null` before mount, a DOM node after mount, stable across re-renders until unmount.

```
useState: set → re-render → next render gets new value
useRef:   set → no render → next render gets same ref object
                            (with .current pointing wherever it does now)
```

**Q [senior]: Why didn't you make each circle a React component?**

A: At 15 nodes I could — at 60fps with force-physics, 15 components × position-update = 900 re-renders per second, which is enough to feel laggy. At 100 nodes it's 6000/sec and unusable. The d3 pattern mutates SVG `cx`/`cy` attributes directly, which the browser handles natively — no React reconciliation, no diffing, no commit phase. The cost is that the children are invisible to React DevTools. For this codebase that's tolerable; for a codebase with serious component testing, I'd reach for a wrapper like visx that hides the escape hatch.

```
┌── d3 imperative (picked) ─┐    ┌── React components ───────┐
│  60fps at 100+ nodes      │    │  ~10fps at 100 nodes      │
│  SVG attr mutation        │    │  Reconcile + commit/frame │
│  Invisible to DevTools    │    │  Visible to DevTools      │
│  Manual cleanup           │    │  Auto cleanup             │
│  d3 selection idiom       │    │  React idiom              │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: What if `data` changes after mount — say the user adds a node?**

A: Today, that's not handled cleanly. The `useEffect` has `[data]` in its deps, so it re-runs — but it doesn't return a cleanup function, so the old `forceSimulation` keeps running, and the old DOM children stay. d3's selection idiom would partly handle the children (the `data().join()` calls reconcile based on id), but the old simulation is a leak. The fix: the effect returns `() => simulation.stop(); svg.selectAll('*').remove();`. Today, this works because `data` is fixed at mount time; the breakpoint is "data starts being mutable after mount."

```
At 10× interaction rate (frequent data changes):
┌─ Force simulation ──────┐
│  ⚠ leaks on every change│  ← breaks first
│  fix: cleanup function   │
└─────────────────────────┘
┌─ DOM children ──────────┐
│  ⚠ accumulate stale     │
│  fix: explicit remove   │
└─────────────────────────┘
```

### The question candidates always dodge

**Q: This is a frontend pattern. How does it help your AI/full-stack pivot?**

A: It demonstrates the same skill you need in AI app engineering: knowing when *not* to use the framework's default. In AI engineering this shows up as "use streaming where the SDK's `await` blocks the UX," "use raw HTTP instead of the SDK when you need batch retries," "drop down to embeddings-as-vectors when the framework's wrapper hides the math." Different domain, same skill — recognise when the abstraction is fighting you and reach for the layer underneath. The cost of going imperative in either domain is the same: you lose the framework's safety net and own more lifecycle yourself. The win is the same: performance and access to idioms the wrapper doesn't expose.

```
┌── React frontend ─────────┐    ┌── AI engineering ─────────┐
│  Reconciler overhead at   │    │  Framework wrappers hide  │
│    high-fps mutation      │    │    streaming, retries     │
│  Drop to d3 imperative    │    │  Drop to raw HTTP / SDK   │
│    inside ref-managed svg │    │    primitives             │
│  Win: 60fps performance   │    │  Win: latency + control   │
│  Cost: own lifecycle      │    │  Cost: own retries        │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "React owns the shell; d3 owns the inside."
- "`useRef` is the hand-off — it's a DOM pointer, not state."
- "Reconciliation has a cost; sometimes imperative is correct."
- "Always return a cleanup function from `useEffect` when you've escaped React."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Draw the boundary: React's domain on top (the `<svg>` outer element), d3's domain below (the simulation + tick mutations). Show the `svgRef` as the link.

### Level 2 — Explain it out loud

Explain: "Why doesn't `NetworkDiagram` use React's state for node positions?" Under 90 seconds.

Checkpoints:
- Name the file? → `src/components/NetworkDiagram/NetworkDiagram.tsx`.
- Say why d3 mutates directly? → reconciliation overhead at 60fps.
- Name the tradeoff? → React DevTools invisibility, manual cleanup needed.

### Level 3 — Apply it to a new scenario

Without looking: "I want to add interactivity — drag a node, edge gets pulled. Where do I add the drag handler, and what does it touch?"

Write your answer. Then look at `NetworkDiagram.tsx` to see where the existing click handler lives.

### Level 4 — Defend the decision you'd change

"If you were rebuilding this today, would you use plain d3 or react-flow (a React-first graph library)?"

### Quick check — code reference test

- Which file uses d3?
- Which ref hands off to d3?
- Which lifecycle hook holds the simulation?

✓ Pass: `NetworkDiagram.tsx`, `svgRef`, `useEffect`.
