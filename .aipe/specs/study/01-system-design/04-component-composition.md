# Component composition

**Industry name(s):** Component composition, composition over inheritance, container/presentational split
**Type:** Industry standard · Language-agnostic

> The home page is a four-component stack and each visualizer page is a controls-shell wrapping a visualizer component — there is no inheritance, no HOCs, no render props, just nested composition.

**See also:** → [03-client-component-islands](./03-client-component-islands.md) · → [06-static-data-as-source](./06-static-data-as-source.md)

---

## Why care

You've built a React component that grew into a 500-line file with five different `if` branches for "kinds" of the same thing. Every new requirement made it longer. Then someone showed you the same UI written as five small components composed together, and the diff was net-negative lines plus easier to read. The first version was *configuring* a generic component; the second was *composing* specific ones.

This is **composition over configuration** — the idea that small, focused components plus a way to nest them beats one big component with a wide prop surface. It's the underlying pattern behind React's children prop, web components' slots, Vue's named slots, and the Unix philosophy of "do one thing well." Here's how that plays out in this codebase.

---

## How it works

Picture a stack of Lego pieces: each piece has a single shape and a single colour; you build the spaceship by *arranging* pieces, not by ordering one giant pre-coloured spaceship-shaped piece. Composition is the same — you build a UI by arranging small components, not by configuring a do-everything component.

### Composition at the page level — home page

The home page is a textbook composition stack:

```
// src/app/page.tsx
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

**This is like a React render function for the page level: each child knows nothing about the others, and the page is just the sum.** The home page doesn't pass any props down — each component owns its own data (mostly hard-coded). Reordering them is one move; deleting one is one move; adding `<RecentBlogPosts />` between `Hero` and `FeaturedProjects` is one move. Nothing is coupled.

The boundary condition: this only works when the children genuinely don't need to share state. If `FeaturedProjects` had to know whether `Hero` was animating, you'd need lifted state or context — composition by itself wouldn't carry that.

### Composition at the visualizer level — controls + viz

Every sort page follows the same shape:

```
// src/app/sorting/bubble-sort/page.tsx (simplified)
"use client";
export default function BubbleSort() {
  const [inputSize, setInputSize] = useState(defaultInputSize);
  const [speed, setSpeed] = useState(defaultSpeed);
  const [bars, setBars] = useState([] as number[]);
  // ... algorithm logic ...

  return (
    <>
      <div className="absolute top-4 right-0 text-right">
        <ul>
          <li>time complexity: ...</li>
          <li><BSelect label="input size:" options={inputSizeOptions} ... /></li>
          <li><BSelect label="speed:"      options={speedOptions}     ... /></li>
          <li><a onClick={bubbleSort}>Run</a> | <a onClick={reset}>Reset</a></li>
        </ul>
      </div>
      <div className="absolute bottom-4">
        <ArrayVisualizer array={bars} highlightIndices={...} scanIndices={...} />
      </div>
    </>
  );
}
```

**If you're coming from frontend, you've seen container/presentational components — here it's the same split.** The page is the *container*: it owns state, runs the algorithm, decides when to highlight which index. The `ArrayVisualizer` is the *presentational* component: given `array`, `highlightIndices`, `scanIndices`, render bars. The page doesn't care how `ArrayVisualizer` renders; `ArrayVisualizer` doesn't care what algorithm computes the highlights. Swap in `LinearDataVisualizer` and bubble sort still works.

The practical consequence: adding a new sort means writing a new container page. The visualizer doesn't change. Adding a new visualizer style (e.g., circle packing instead of bars) means writing a new presentational component without touching any of the sort pages — until you decide to use the new viz.

### What the codebase does NOT use

There's no `withSomething(HOC)`. No render props pattern (`<Component>{(args) => ...}</Component>`). No compound components (`<Tabs><Tab/><TabPanels/></Tabs>`). The composition stays simple: parent renders children, children take props, that's it.

**The codebase also doesn't lift state.** Each visualizer page owns its own state; none of them share. If two pages need the same "global theme color" or "muted state," that'd need context — but right now nothing does, so the simpler shape stands.

### The principle

This is what people mean by "components are functions of props." A composed UI is just function calls — readable top-down, no hidden control flow, no inheritance chains. When something looks complex, the fix is almost always *more, smaller components* — not bigger components with more props.

The full picture is below.

---

## Component composition — diagram

```
Home page composition (top-level, all server components)

┌─ Home (src/app/page.tsx) ─────────────────────────┐
│  <Hero />                                         │
│  <FeaturedProjects />                             │
│  <Concepts />                                     │
│  <Footer />                                       │
└───────────────────────────────────────────────────┘
        each owns its data, no inter-component state


Visualizer page composition (one client page, no shared state)

┌─ BubbleSort page (src/app/sorting/bubble-sort/page.tsx) ─┐
│                                                          │
│  state: inputSize, speed, bars, highlightIndices         │
│  logic: bubbleSort()                                     │
│                                                          │
│  ┌─ Controls (inline JSX) ───────────────────────┐       │
│  │  <BSelect label="input size:" .../>           │       │
│  │  <BSelect label="speed:"      .../>           │       │
│  │  <a onClick={bubbleSort}>Run</a>              │       │
│  │  <a onClick={reset}>Reset</a>                 │       │
│  └───────────────────────────────────────────────┘       │
│                                                          │
│  ┌─ Visualizer (presentational) ─────────────────┐       │
│  │  <ArrayVisualizer                             │       │
│  │     array={bars}                              │       │
│  │     highlightIndices={highlightIndices}       │       │
│  │     scanIndices={scanIndices}                 │       │
│  │  />                                           │       │
│  └───────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Home page composition:** `src/app/page.tsx` L6–L15 — the four-child stack.
**Container/presentational split:** `src/app/sorting/bubble-sort/page.tsx` L85–L128 (container) + `src/components/ArrayVisualizer/ArrayVisualizer.tsx` (presentational).
**Reusable UI primitive:** `src/components/ui/BSelect/BSelect.tsx` — used by every sort page for both input-size and speed dropdowns.

GitHub: `[src/app/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/page.tsx)` and `[ArrayVisualizer.tsx](https://github.com/rlynjb/reincodes/blob/main/src/components/ArrayVisualizer/ArrayVisualizer.tsx)`.

---

## Elaborate

### Where this pattern comes from
"Composition over inheritance" comes from the Gang of Four design-patterns book (1994). React's `children` prop, introduced from day one in 2013, baked composition into the framework's DNA — there's no React class inheritance for component reuse (you can extend Component, but `extends` is for lifecycle access, not behaviour reuse). Dan Abramov's 2016 "Mixins Considered Harmful" essay made the case for composition as the React-native pattern.

### The deeper principle
*Locality is the underrated property of good code.* Composition keeps related behaviour in one component; inheritance scatters it across class hierarchies. When something is wrong, you fix it by reading top-down — no jumping through superclasses.

### Where this breaks down
- Highly customizable widgets that vary in dozens of dimensions — sometimes a compound-component pattern (`<Tabs.Root><Tabs.List><Tabs.Trigger/></Tabs.List></Tabs.Root>`) reads better than nesting + props.
- Cross-cutting concerns like analytics, theming, internationalisation — context or providers handle these; pure composition would mean drilling props.
- Performance-critical trees where you need to share computed values without re-running — memoisation + lifted state may be necessary.

### What to explore next
- [03-client-component-islands](./03-client-component-islands.md) — how server and client components compose without sharing runtime state.
- [05-animation-loop-pattern](./05-animation-loop-pattern.md) — why the container holds the animation state and the visualizer doesn't.
- [06-static-data-as-source](./06-static-data-as-source.md) — how `FeaturedProjects` reads from a hard-coded array because no shared state exists.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬───────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Composition (per-page own)│ Shared state (context/   │
│                  │                           │ store)                   │
├──────────────────┼───────────────────────────┼──────────────────────────┤
│ Per-page setup   │ ~30 lines of scaffolding  │ Boilerplate + provider   │
│ Code duplication │ Same shape across 6 pages │ DRY                      │
│ Coupling         │ Pages independent         │ All pages share contract │
│ Refactor cost    │ One file at a time        │ Touch shared store first │
│ State leakage    │ None                      │ Possible                 │
│ Onboarding       │ Read one file → done      │ Read store + page        │
│ Test isolation   │ Each page testable solo   │ Need mocked store        │
└──────────────────┴───────────────────────────┴──────────────────────────┘
```

### What we gave up

DRY. Every sort page has the same ~30-line scaffolding: `inputSize` state, `speed` state, `bars` state, `useEffect` to reset, `BSelect` controls, the algorithm function. Six near-identical files. If you change the controls layout, you change it six times.

For this codebase that's fine — six files is the *whole sort surface*, and each can diverge as the algorithm dictates (heap sort needs to show the tree, merge sort might benefit from a merge-step visualizer). The duplication isn't accidental; it's deliberate room for each page to be its own thing.

### What the alternative would have cost

If we'd lifted the controls into a single `<SortLayout>` component that took an algorithm-runner prop, the six files would shrink to ~10 lines each — but every per-algorithm tweak would have to thread through the layout. Heap sort wanting to also show a tree alongside the bars? Now `SortLayout` needs an extra slot. Quick sort wanting a pivot-selection toggle? Another prop. Within three or four pages the layout component would have a wide prop surface and a switch statement for variants — at which point it's worse than six independent files.

The cost would also be onboarding. With independent files, a new contributor reads `bubble-sort/page.tsx` and sees the whole bubble-sort surface. With a shared layout, they have to read the layout *and* the algorithm file *and* understand the contract between them.

### The breakpoint

Fine until the duplicated scaffolding starts costing more than the divergence enables. Right now the six sort pages are ~95% identical, but the option to diverge any one of them is cheap. The breakpoint is when (a) the controls are about to change in a way that's a copy-paste-six-times job, or (b) we add 20+ sort variants and the duplication becomes a maintenance tax instead of an option. Neither is true today.

---

## Tech reference (industry pairing)

### React composition primitives

- **Codebase uses:** Plain JSX nesting + `children` prop semantics; no HOCs, no render props, no context.
- **Why it's here:** the simplest possible reuse mechanism; works because no two visualizer pages need to share runtime state.
- **Leading today:** React composition + hooks — `adoption-leading` across React 16.8+, 2026.
- **Why it leads:** standard React idiom; every React engineer recognises it without explanation.

### When you'd reach for compound components

- **Codebase uses:** None currently. Compound components would look like `<Tabs.Root><Tabs.List><Tabs.Trigger/></Tabs.List></Tabs.Root>`.
- **Why mention it:** Radix UI and shadcn/ui have made this pattern standard for accessible widget libraries; it'd show up if reincodes ever grows complex shared widgets.
- **Leading today:** Radix UI primitives — `innovation-leading` for headless accessible components, 2026.
- **Runner-up:** Ariakit, React Aria — both share the compound-component shape.

---

## Summary

### Part 1 — concept recap

Component composition is the technique of building UIs by nesting small focused components rather than configuring large generic ones. reincodes uses it at two levels: the home page is a four-component stack with no shared state, and each visualizer page is a container that owns state and runs the algorithm, wrapping a presentational visualizer (`ArrayVisualizer`, `GridVisualizer`, etc.) that just renders props. The constraint is "no two pages need to share state at runtime," and the cost is that the six sort pages duplicate ~30 lines of scaffolding each — a deliberate cost so each page can diverge independently.

### Part 2 — key points to remember

- Home page = four children with no inter-component coupling.
- Visualizer page = container (owns state + algorithm) + presentational viz (renders props).
- No HOCs, no render props, no compound components — just nesting.
- Lives in step 4 (State ownership) of the system-design checklist — state lives in the container, presentation flows down via props.
- Duplication is the price of independence; six near-identical sort pages is the deliberate shape.

---

## Interview defense

### What an interviewer is really asking

When someone asks "why didn't you make a generic sort component?" they want to know whether you considered the alternative and rejected it, or whether you missed it. The answer: I considered it. The duplication is real but small, and the option-to-diverge is more valuable than the DRY savings.

### Likely questions

**Q [mid]: How would you add a new sort visualization, say `radix-sort`?**

A: Copy `bubble-sort/page.tsx` to `sorting/radix-sort/page.tsx`, swap the algorithm function, adjust complexity text. The page imports `ArrayVisualizer` and `BSelect` like every other sort page, and the new route is created automatically by file-based routing.

```
1. cp bubble-sort/page.tsx
2. Rename function and route
3. Replace bubbleSort with radixSort
4. Adjust time complexity copy
                ↓
        next build picks it up
```

**Q [senior]: Six near-identical sort pages — is that good or bad?**

A: It's a deliberate tradeoff. The duplicated scaffolding (~30 lines × 6 files = ~180 lines) is the cost; the benefit is each page is independently editable. Heap sort might want to show the tree alongside the bars; merge sort might want a merge-step viewer. If those divergences land, they don't disturb the other five files. If I'd built `<SortLayout>` with an algorithm prop, every divergence would either go into the shared layout or into a switch-on-algorithm — both of which get ugly fast. The breakpoint is "we add 20+ sorts and the duplicated bits change in lockstep"; we're not near that.

```
┌── What we picked ─────────┐    ┌── What we didn't ─────────┐
│  6 files × 30 LOC dup      │    │  1 <SortLayout/> + algos │
│  Each independently        │    │  Prop surface widens     │
│    editable                │    │    per per-variant need  │
│  Read one file → know it   │    │  Read layout + algo      │
│  Diverge cheaply           │    │  Diverge with cost       │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: What changes if reincodes adds 50 sort variants?**

A: At 50 variants the per-page duplication is the maintenance tax. I'd extract a `<SortControls>` component for the input-size + speed + run/reset shell, leaving each page with the unique controls. The algorithm code stays per-page (it should). The visualizer is already extracted. The point at which composition stops being the right pattern is when *the duplication is changing in lockstep*; at 50 variants that's likely.

```
At 50 variants, here's the move:
┌─ Per-page algorithm code ─┐
│  ✓ stays per-page         │  ← right place
└────────────────────────────┘
┌─ Per-page controls JSX ───┐
│  ⚠ extract <SortControls> │  ← duplication too high
└────────────────────────────┘
┌─ Per-page state mgmt ─────┐
│  ⚠ extract `useSortRun()` │  ← same shape everywhere
└────────────────────────────┘
```

### The question candidates always dodge

**Q: You said "composition over inheritance" but you didn't write any inheritance to compare against. Are you reciting a slogan or do you understand what it costs?**

A: Fair. Inheritance in React would look like a base `SortVisualizerComponent` class with protected methods (`run`, `reset`, `renderControls`, `renderViz`) that subclasses override. The cost would be: (1) `this`-binding hell — class methods need `.bind(this)` or arrow members; (2) lifecycle leakage — the base class would have to expose `useState`-equivalent through state or refs, and subclasses would step on each other's state shapes; (3) testability — testing a subclass requires instantiating the base; (4) refactor cost — moving a method up or down the hierarchy is a multi-file edit with type churn. With composition, "share this behaviour" means "extract this hook" or "extract this component" — both are pure functions on the surface, both are local. I haven't *paid* the inheritance cost in this codebase because I didn't take that path, but I've seen what it looks like in legacy class-based codebases. The slogan's load-bearing.

```
┌── What I chose ───────────┐    ┌── Class inheritance ──────┐
│  Composition: extract     │    │  Inheritance: extract by  │
│  by file                  │    │    base-class method      │
│  Locality: yes            │    │  Locality: no — jump base │
│  this binding: n/a        │    │  this binding: care       │
│  Refactor: 1 file move    │    │  Refactor: parent+children│
│  Test: function in isolation│  │  Test: instantiate base   │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Compose by nesting, not by configuration."
- "Container owns state and logic; presentational takes props and renders."
- "Duplication is the price of independence — pay it deliberately."
- "When a component grows props, extract; when it grows behaviour branches, split."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Draw the home page composition stack and the visualizer container-and-presentational split. Label what each layer owns.

### Level 2 — Explain it out loud

Explain to a colleague: "If I wanted to add a 'rendering options' dropdown to the bubble sort page, where would it live and what would it touch?" Under 90 seconds.

Checkpoints:
- Name the page file? → `src/app/sorting/bubble-sort/page.tsx`.
- Say why the visualizer wouldn't change? → `ArrayVisualizer` is presentational and doesn't know about controls.
- Name the tradeoff? → adding controls per page means duplication if you add the same control to multiple pages.

### Level 3 — Apply it to a new scenario

Without looking: "I want a 'compare two sorts side by side' page that shows bubble vs quick. What components do you compose, and where does the shared timing state live?"

Write your answer. Then check how `bubble-sort/page.tsx` is structured to see what would be reused.

### Level 4 — Defend the decision you'd change

"If you had to commit to either fully extracting `<SortLayout>` now or keeping all six pages independent forever, which and why?"

### Quick check — code reference test

- Where does the home page compose its children?
- Where does a sort page hold its state?
- Where does the visualizer render the bars?

✓ Pass: `src/app/page.tsx`, `src/app/sorting/<algo>/page.tsx`, `src/components/ArrayVisualizer/ArrayVisualizer.tsx`.
