# Page-local state ownership

**Industry name(s):** Co-located state, local component state, "lift state up only when shared"
**Type:** Industry standard · Language-agnostic

> Every visualizer page owns its own `useState` for `bars`, `scanIndex`, `speed`, `inputSize`; there is no Context, Zustand, Redux, or global store anywhere in the codebase.

**See also:** → [03-client-component-boundary.md](./03-client-component-boundary.md) · → [04-state-driven-animation-with-delayloop.md](./04-state-driven-animation-with-delayloop.md)

---

## Why care

#### Move 1 — The grounded scenario

You've worked on a React app where, in week three, someone added Redux for "the cart." In month two, every component was reading from `useSelector` and the cart store had nine slices. In month six, a junior asked "where does the cart total come from?" and the answer was four files deep, through three reducer compositions, with one selector that memoised the result.

Picture the opposite. A React app where every page is a sandbox. The state lives at the top of the page component. You read the page top-to-bottom and you see every piece of state it needs. There's nothing to import from a store, nothing to subscribe to, nothing to selector-into. You change a page, you don't break another page — because no other page knows the first one exists.

#### Move 2 — Name the question (or job) the pattern answers

The question is: *where should state live by default?* The answer in this codebase is *the page* — every visualizer's animation state is held in `useState` inside the page component, scoped to that page, destroyed on route change. No context, no global store. The pattern says "if no one else needs to read this state, no one else should be able to."

#### Move 3 — Why answering that question matters

**What depends on getting this right:** the blast radius of every code change. When state is global, a refactor to one slice can break consumers in components that don't even import the slice directly — they read it through a context, which reads it through a selector, which reads it through a reducer. When state is page-local, the page is the only thing that can break. You delete the page, you delete the state. You change the state's shape, only the page sees the change.

In this codebase, `src/app/sorting/bubble-sort/page.tsx` owns five `useState` calls: `inputSize` (L17), `speed` (L18), `bars` (L39), `highlightIndices` (L51), `scanIndices` (L52). All five are private to that one component. The insertion-sort page has its own five. The merge-sort page has its own five. There is no cross-page coupling because there is no shared state.

The second thing depending on this: *the cost of adding a new page*. With page-local state, adding `src/app/sorting/heap-sort/page.tsx` is "copy the bubble-sort page, replace the algorithm." No store wiring, no slice creation, no subscriber setup. The page is a unit.

#### Move 4 — Concrete before/after

With a global store (Redux, Zustand, Context):

- Page mounts → subscribes to relevant slice via `useSelector` or `useStore`
- User changes `inputSize` → dispatches `setInputSize` action → reducer updates store → every subscribed component re-renders
- User navigates away → store keeps the value; if they come back to a different visualizer, they may inherit stale state
- Adding a new visualizer → write the algorithm, plus add a slice (or namespace within a slice) for its state, plus wire `useSelector` calls in the page
- Renaming `inputSize` to `arraySize` → grep the project, update all subscribers

With page-local state (this codebase):

- Page mounts → `useState` initialises with defaults
- User changes `inputSize` → `setInputSize(val)` → React schedules a re-render of the page
- User navigates away → the page unmounts; state is destroyed
- Adding a new visualizer → copy a page file, change the algorithm. Five lines of `useState` are part of the template
- Renaming `inputSize` to `arraySize` → rename it in one file; no other file references it

#### Move 5 — The one-line summary

Page-local state ownership is the default of *put state in the smallest scope that needs it*, applied to this codebase as "state lives in the page, period" — no context, no store, no shared layer.

---

## How it works

### Move 1 — The mental model

The mental model is *the page is a self-contained sandbox.* The page owns its state. Children read state via props. State is destroyed when the page unmounts. Nothing crosses the page boundary.

```
src/app/sorting/bubble-sort/page.tsx
─────────────────────────────────────
function BubbleSort() {
  const [inputSize, setInputSize]         = useState(...)
  const [speed, setSpeed]                 = useState(...)
  const [bars, setBars]                   = useState(...)
  const [highlightIndices, setHighlightIndices] = useState(...)
  const [scanIndices, setScanIndices]     = useState(...)
              │
              │  passed down as props
              ▼
  <BSelect onSelect={setInputSize} ... />
  <BSelect onSelect={setSpeed} ... />
  <ArrayVisualizer array={bars}
                   highlightIndices={highlightIndices}
                   scanIndices={scanIndices} />
}

  ▲ owned and destroyed at the page level
  │ nothing outside this function knows these exist
```

The strategy: *no state escapes the page.* Children are read-only views.

### Move 2 — The layered walkthrough

**Five `useState` calls, all in the page**

Open `src/app/sorting/bubble-sort/page.tsx`. The five state hooks at L17, L18, L39, L51, L52 are the entire state surface of this page. There is no other source of truth.

```
state declaration                          purpose
────────────────                           ───────
useState(defaultInputSize)        L17      how many bars (20, 50, 100, ...)
useState(defaultSpeed)            L18      ms between animation steps
useState([] as number[])          L39      the array being sorted
useState([] as number[])          L51      indices to mark with highlight color
useState(null as null | number)   L52      current scan position (or null)
```

If you're coming from Redux or Zustand, you've put state like this in a global store and pulled it out per component. Here the state is right next to the code that mutates it. The setter is right there: `setBars(...)` is in scope wherever the algorithm is. No `dispatch({ type: 'SET_BARS', payload: ... })`, no `useStore(s => s.setBars)`. The mutation and the state are the same lexical block.

```
Redux/Zustand layout                       Page-local layout
────────────────────                       ──────────────────
store/sortingSlice.ts:                     src/app/sorting/bubble-sort/page.tsx:
  state: { bars, scan, ... }                 const [bars, setBars] = useState(...)
  reducers: { setBars, ... }                 // setBars is right here, callable

page.tsx:                                    bubbleSort = async () => {
  const bars = useSelector(s => s.bars)        ...
  const dispatch = useDispatch()                setBars([...bars])
  dispatch(setBars(...))                     }
```

The practical consequence: a reader of the page can answer "where does `bars` come from?" by looking at the top of the function. They never have to ask "is `bars` in a store somewhere?" because there are no stores.

**Children are read-only props**

The page renders an `<ArrayVisualizer>` at L121–L125 with three props: `array`, `highlightIndices`, `scanIndices`. The visualizer cannot set those values back — it has no setter prop, no callback. It is a pure function of the props it receives.

```
page.tsx               ArrayVisualizer
────────               ───────────────
owns state             receives props
  setBars                  array
  setHighlight             highlightIndices
  setScan                  scanIndices

         ───────▶ data flow is one-way

         ◁────── no update path back
```

If you're coming from frontend, you're used to "lifting state up" — moving state to the lowest common ancestor of the components that need it. Here the page is *always* the lowest common ancestor of every component on that route. Lifting state up means lifting it to the page; lifting past the page would mean a global store, which the codebase doesn't have.

The practical consequence: visualizer components are reusable across pages. The same `<ArrayVisualizer>` is used by every sort page. Same for `<BinaryVisualizer>` (BST + heap pages), `<GridVisualizer>` (BFS grid + shortest-path), `<NetworkDiagram>` (network graph + state-space). The components don't know which page is using them; they just render their props.

**State is destroyed on route change**

When the user clicks from `/sorting/bubble-sort` to `/sorting/insertion-sort`, React unmounts `BubbleSort`. Every `useState` value is gone. When `InsertionSort` mounts, its five `useState` calls initialise fresh from defaults.

```
time
────
t=0       BubbleSort mounts, state initialises
t=...     user runs sort, state mutates
t=user    user clicks Link to /sorting/insertion-sort
          │
          ▼
t=1       BubbleSort unmounts
          all useState values destroyed
          algorithm function (if mid-execution) keeps running but
          its setBars calls land on a now-unmounted component
          (React warns, no real harm)
          │
          ▼
t=2       InsertionSort mounts, state initialises from defaults
          new bars array generated, new sort kicked off
```

If you're coming from Redux, you're used to state persisting across route changes — the store outlives any single component. Here the opposite is true: state is intentionally ephemeral. If you want a fresh sort, navigating away and back gives you one for free.

The practical consequence: no stale state, no cross-page leaks. The insertion-sort page never inherits anything from the bubble-sort page, even if the user just came from there.

**The home page is the only "shared" place — and it's static**

The home page (`src/app/page.tsx`) composes Hero + FeaturedProjects + Concepts + Implementations + Footer. None of these own animation state. They render static catalogs (`CONCEPT_CATEGORIES`, `IMPLEMENTATIONS`, the inline `projects` array in `FeaturedProjects`). The home is the page where you'd be tempted to add a global store — "remember what the user clicked last," "track which visualizers they've visited" — and the codebase declines.

```
home page (no useState)            visualizer page (useState × 5)
─────────────────────              ───────────────────────────────
static catalogs only               full local state machine
no shared state across pages       no shared state across pages
```

The practical consequence: the home page and every visualizer share zero state. The home is a directory of links, and each visualizer is an independent app.

**What this rules out**

A natural feature you'd want with shared state: "open bubble-sort and insertion-sort side by side and watch them race on the same input." The codebase cannot do this without leaving the page-local model. Each visualizer page is `bars: useState(...)`, so two visualizers would have two independent arrays with no coordination. The fix is one of: (a) lift state to a parent route's layout, (b) introduce a context for shared input, (c) move to a global store. All three would replace the page-local rule. The codebase has chosen not to support that feature in exchange for the simpler model.

### Move 3 — The principle

The principle this exemplifies is *put state in the smallest scope that needs it, then justify any move upward.* Here the smallest scope is the page. Pages don't need to share state, so state doesn't share. The cost of this default is the loss of cross-page features (compare-side-by-side, persisted preferences, recently-visited tracking). The win is a codebase where every file is fully understandable on its own — no hidden coupling, no surprise re-renders from a slice you forgot you subscribed to.

This is what people mean by "co-located state" or "Kent C. Dodds' state colocation" — the same idea, formalised. State near the code that uses it; only lift it when something outside that block legitimately needs it. In this codebase the rule is enforced absolutely: no outside block ever needs visualizer state, so visualizer state never lifts.

The full picture is below.

---

## Page-local state ownership — diagram

```
┌─ src/app/sorting/bubble-sort/page.tsx ────────────────────────────────────┐
│                                                                           │
│   function BubbleSort() {                                                 │
│     ┌─ state owned here ─────────────────────────────────────────┐       │
│     │                                                            │       │
│     │   inputSize        speed         bars                      │       │
│     │   highlightIndices               scanIndices               │       │
│     │                                                            │       │
│     │   (5 useState calls, no other source of truth)             │       │
│     │                                                            │       │
│     └──────────────────────────────────────┬─────────────────────┘       │
│                                            │ props passed down            │
│                                            ▼                              │
│     <BSelect onSelect={setInputSize} ... />                               │
│     <BSelect onSelect={setSpeed} ... />                                   │
│     <ArrayVisualizer array={bars}                                         │
│                      highlightIndices={highlightIndices}                  │
│                      scanIndices={scanIndices} />                         │
│                                                                           │
│   }                                                                       │
│                                                                           │
└──────────────────────────────────────│────────────────────────────────────┘
                                       │ user navigates to another visualizer
                                       ▼
┌─ React unmounts BubbleSort ───────────────────────────────────────────────┐
│                                                                           │
│   all useState values destroyed                                           │
│   no global store retains anything                                        │
│   next page mounts fresh                                                  │
│                                                                           │
└──────────────────────────────────────│────────────────────────────────────┘
                                       │ /sorting/insertion-sort mounts
                                       ▼
┌─ src/app/sorting/insertion-sort/page.tsx ─────────────────────────────────┐
│                                                                           │
│   function InsertionSort() {                                              │
│     ┌─ state owned here (independent of BubbleSort) ──────────┐          │
│     │ inputSize, speed, bars, highlight, scan                 │          │
│     └─────────────────────────────────────────────────────────┘          │
│   }                                                                       │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Canonical example**
**File:** `src/app/sorting/bubble-sort/page.tsx`
**Function / class:** `BubbleSort` (default export)
**Line range:** L16–L83 (state + effects + algorithm)

```ts
export default function BubbleSort() {
  const [inputSize, setInputSize]               = useState(defaultInputSize);  // L17
  const [speed, setSpeed]                       = useState(defaultSpeed);      // L18

  // ...

  const [bars, setBars]                         = useState([] as number[]);    // L39

  // ...

  const [highlightIndices, setHighlightIndices] = useState([] as number[]);    // L51
  const [scanIndices, setScanIndices]           = useState(null as null | number); // L52

  // setters used inside the bubbleSort async function below — no dispatch, no store
}
```

Every other visualizer page has the same shape — sometimes more state (BST needs the tree structure plus current node plus search target), sometimes fewer (Fibonacci needs only the recursion depth and the call stack). All of it lives at the top of the page component.

**No store, anywhere**

There is no `src/store/`, no `src/state/`, no `useStore` calls, no Context Provider, no Zustand `create` calls. A grep for `createContext`, `useReducer`, `zustand`, `redux`, `jotai`, `valtio` returns zero matches in the codebase. The absence is the pattern.

**The exceptions that prove the rule**

- `src/const/options.ts` exports `inputSizeOptions`, `speedOptions`, `defaultInputSize`, `defaultSpeed` — these are *constants*, not state, used as initial values for `useState`.
- `src/components/Home/conceptsData.tsx` exports `CONCEPT_CATEGORIES` and `IMPLEMENTATIONS` — *static data*, not state.

In both cases the exported values never change at runtime; they're build-time constants imported by pages.

---

## Elaborate

### Where this pattern comes from

The pattern is older than React but became cultural in the React community around 2019–2020, when hooks made local state ergonomic and Kent C. Dodds' "state colocation" essay argued explicitly against premature globalisation. Redux had been the default since 2015; by 2020, "Redux toolkit + slices everywhere" had produced enough overengineered codebases that "use local state by default, lift only when shared" became the corrective.

### The deeper principle

The deeper principle is *broadcast cost has to be earned.* Every piece of state in a global store implicitly broadcasts to every subscriber. Most state has exactly one consumer — the component that mutates it. Broadcasting that state widens its reach for no benefit, and every consumer is now coupled to its shape. Co-located state matches the broadcast cost to the actual consumer count: one, in this codebase, for every piece of visualizer state.

```
broadcast scope                    earns its place when
───────────────                    ────────────────────
component-local                    one consumer (default)
parent-lifted                      two siblings need it
context                            cross-cutting (theme, auth) — not subtree-local
global store                       cross-page persistence, server-state cache,
                                   cross-component coordination
```

### Where this breaks down

This pattern breaks when state genuinely needs to be shared. Auth state, theme state, the user's locale, the contents of a cart in an e-commerce app, a chat room's messages across multiple UI panels — all of these have multiple consumers, none of which is hierarchically below a single component. Forcing those into prop drilling produces unreadable JSX; the right move is to lift them to context or a store.

The pattern also breaks when state needs to *survive* the component's lifecycle — a draft post the user is composing across navigation, a multi-step form's progress, the position of a scrolled list when navigating back. The page-local pattern destroys state on unmount, so any "remember this when I come back" feature needs a different home (localStorage, sessionStorage, URL params, or a global store).

In this codebase neither failure mode applies — there is no auth, no theme switching, no cross-page persistence — so the pattern holds without strain.

### What to explore next

- `useReducer` → the local-state primitive when state transitions are complex enough that a `useState` setter becomes unwieldy
- React Context → the next step up when state needs to cross more than two levels of props
- URL state → query params and route segments as state that the URL persists; the right home for "selected algorithm" or "playback speed" if you wanted to share a link to a specific configuration
- Zustand → the smallest viable global store; a single hook, no provider, used when context becomes too coarse but Redux is too much

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌─────────────────────┬───────────────────────────┬──────────────────────────────┐
│ Cost dimension      │ Page-local state (taken)  │ Global store (alternative)   │
├─────────────────────┼───────────────────────────┼──────────────────────────────┤
│ Cross-page sharing  │ impossible                │ first-class                  │
│ Add a new page      │ copy the file, done       │ also wire a new slice or     │
│                     │                           │ namespace                    │
│ State persistence   │ none — unmount destroys   │ outlives any component       │
│ across navigation   │                           │                              │
│ Cognitive load      │ read the page; you see    │ read the page; chase the     │
│                     │ all state                 │ store; chase the selectors   │
│ Refactor blast      │ one file                  │ every subscriber of the slice│
│ radius              │                           │                              │
│ Dependencies        │ zero — built into React   │ a library (Redux, Zustand,   │
│                     │                           │ Jotai) + setup               │
│ Side-by-side mode   │ impossible without        │ trivial                      │
│                     │ restructuring             │                              │
│ Initial render      │ trivial — local defaults  │ store has to initialise      │
│                     │                           │ before subscribers           │
└─────────────────────┴───────────────────────────┴──────────────────────────────┘
```

### Sub-block 1 — what we gave up

The first thing gone is *side-by-side comparison*. Open bubble-sort and insertion-sort in the same view, feed both the same array, watch them race — impossible without restructuring. The state for each page is owned by that page; there is no place "above" both pages where shared input could live (the App Router doesn't render two pages at once).

The second thing gone is *persistence across navigation*. A user who's been watching a slow sort run, navigates to another page, and comes back, gets a fresh sort from scratch. The mid-sort state is gone. The fix is either a `useEffect` that writes to localStorage on every change (a per-page burden), or a global store (a category change).

The third thing gone is *cross-cutting preferences*. "Always start every sort with 100 bars at speed 200" cannot be expressed in this codebase — each page reads its defaults from `src/const/options.ts` constants. Changing the defaults globally is a code edit, not a runtime preference. If the codebase wanted user-configurable defaults, the natural home would be a context or localStorage, both of which are absent.

### Sub-block 2 — what the alternative would have cost

If this codebase had used Zustand from day one, the cost would be a single store file (~50 lines) plus a hook call in every page. The savings would be the three features above: side-by-side, persistence, preferences. But none of those features are in the codebase, so the cost would have been paid for nothing.

The more invisible cost of a global store is coordination. With Zustand, the moment two visualizers share a piece of state (`speed`, say), changing the type of `speed` requires updating every consumer. With local state, each visualizer's `speed` is independent — changing one doesn't affect any other. For a hobby codebase where pages evolve independently, that independence is the right default.

Redux would have been even costlier: action creators, reducers, selectors, and an `<Provider>` at the root — for a codebase with no shared state. Redux earned its place in 2015 when component-local state was unergonomic; in 2026 with hooks, the right move is to skip it unless you have actual shared state to manage.

### Sub-block 3 — the breakpoint

Page-local state stops being the right default the moment a feature genuinely requires cross-page coordination. Concrete triggers: (1) user accounts (auth state must be everywhere), (2) a shared preferences UI (theme, default input size), (3) a "remember my last visualizer" link on the home page, (4) any side-by-side or PiP visualizer mode. The first such feature is where Zustand or Context enters; below that, page-local is strictly simpler.

### Sub-block 4 — what wasn't actually a tradeoff

Class components with `this.state` are not a meaningfully different alternative; they'd hold state in the same scope (the page component) and produce the same isolation. Hooks just made the syntax cleaner.

URL state (`useSearchParams` to encode `speed` and `inputSize` in the URL) was also not a real alternative — the constraint is that the page is `"use client"` and pre-rendered as static HTML at build time, and search-param-driven state would mean every page is hydrated with the same defaults regardless of URL. To honor URL state, the page would have to read params after hydration via `useEffect`, which is the same shape as the current `useState` with extra steps.

### Tone

Page-local state is the right call for a codebase with zero cross-page coordination. Adding a store before the coordination exists is overengineering; not adding one when coordination shows up is underengineering. The codebase is currently in the former regime and would notice the transition the day a side-by-side feature is requested.

---

## Tech reference (industry pairing)

### React `useState`

- **Codebase uses:** `useState` hooks at L17, L18, L39, L51, L52 of `src/app/sorting/bubble-sort/page.tsx`, and equivalent calls in every other visualizer page.
- **Why it's here:** the local-state primitive. Every visualizer's animation state lives in `useState` calls at the top of the page.
- **Leading today:** React `useState` — adoption-leading for component-local state, 2026.
- **Why it leads:** built-in, zero dependencies, integrates with concurrent rendering and Suspense, recognized by every React engineer.
- **Runner-up:** Solid signals — innovation-leading for fine-grained reactivity; tracks dependencies automatically and only re-renders the DOM that depends on changed values. Different framework, not a drop-in alternative.

### Module-level constants for defaults

- **Codebase uses:** `defaultInputSize`, `defaultSpeed`, `inputSizeOptions`, `speedOptions` in `src/const/options.ts`, imported by every visualizer at the top of its `useState` call.
- **Why it's here:** the initial values for state. Without these constants, every page would hardcode `useState(20)` or similar, and changing the default would be a multi-file edit.
- **Leading today:** ES modules with named exports — adoption-leading for static config, 2026.
- **Why it leads:** zero runtime cost, tree-shakeable, statically analysable, universal browser support.
- **Runner-up:** environment variables — innovation-leading when defaults need to differ between dev and prod; not used here because the defaults are the same everywhere.

### The non-use of global state (notable absence)

- **Codebase uses:** nothing. No Redux, Zustand, Jotai, Recoil, Valtio, MobX, Context Provider with state, or `useReducer` at the root.
- **Why it's here:** the codebase made an explicit choice not to introduce a store before there was state to share.
- **Leading today:** Zustand — adoption-leading for "I need a small global store without Redux ceremony," 2026.
- **Why it leads:** ~1KB, no Provider needed, hook-based API, easy to migrate to from `useState` when state needs to be lifted.
- **Runner-up:** Jotai — innovation-leading for "atomic" state (one atom per piece of state); composes well, harder to reason about cross-atom dependencies.

---

## Summary

### Part 1 — concept recap

Page-local state ownership is the choice to put `useState` at the page-component level and never above it — no context, no global store. In this codebase, every visualizer page owns five or so `useState` calls (e.g., `src/app/sorting/bubble-sort/page.tsx` L17, L18, L39, L51, L52 for `inputSize`, `speed`, `bars`, `highlightIndices`, `scanIndices`); these never escape the page, and they're destroyed on route change. The constraint that made it the right call is the absence of cross-page coordination — no auth, no shared preferences, no compare-side-by-side feature. The cost is the inability to add those features without leaving the pattern; cross-page persistence, side-by-side mode, and shared preferences all require lifting state above the page.

### Part 2 — key points to remember

- This pattern lives in checklist step 4 (**State ownership** — every piece of state has a single, scoped owner: the page).
- The page is the largest scope state ever reaches; nothing in the codebase shares state across pages.
- Children components (`ArrayVisualizer`, `BinaryVisualizer`, etc.) are pure renderers — they receive props, they cannot set them.
- State is destroyed on route change; no stale state, no cross-page leaks.
- Adding a new visualizer is a copy-the-file operation; no store wiring is needed.
- The breakpoint is the first feature requiring cross-page coordination (auth, shared preferences, side-by-side); below that, page-local is the simpler default.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks why there's no Redux or Zustand in the codebase, they're checking whether you understand state colocation. The shallow answer is "I didn't need one." The answer they want is a decision: where state currently lives, why that's enough for this codebase, and the trigger that would make you reach for a store.

### Likely questions

[mid] Q: Where does the `bars` state in the bubble-sort page actually live?

A: It lives in the `BubbleSort` component itself, declared at line 39 of `src/app/sorting/bubble-sort/page.tsx` with `useState([] as number[])`. The setter `setBars` is in the same lexical scope as the algorithm function, so the algorithm just calls `setBars([...bars])` after each swap. There's no store, no context — the state and the code that mutates it are in the same function body. When the user navigates away, the component unmounts and the state is destroyed.

Diagram:
```
state lives where it's used

src/app/sorting/bubble-sort/page.tsx
─────────────────────────────────────
function BubbleSort() {
  const [bars, setBars] = useState([]);    ◀── declared here

  const bubbleSort = async () => {         ◀── used here, same scope
    ...
    setBars([...bars]);
  };

  return <ArrayVisualizer array={bars} /> ◀── passed down
}
```

[senior] Q: At what point would you introduce a store?

A: The first feature that requires cross-page coordination. Concretely: a "favorites" list of visualizers, a shared input size that persists across pages, or a side-by-side compare mode. None of those exist today, so a store would be unused infrastructure. I would reach for Zustand specifically because it's ~1KB with no Provider boilerplate and migrating from `useState` to Zustand is mechanical — replace `const [bars, setBars] = useState(...)` with `const bars = useStore(s => s.bars); const setBars = useStore(s => s.setBars)`. If I'd added Zustand on day one without a coordination feature to justify it, I'd have shipped dead weight.

Diagram:
```
The decision tree

  Is state read by exactly one component?
    │
    yes ──▶ useState (current)
    │
    no
    │
    ▼
  Is state read by 2–3 siblings under one parent?
    │
    yes ──▶ lift to common parent, prop drill
    │
    no
    │
    ▼
  Is state read across routes / by deeply nested children?
    │
    yes ──▶ Zustand / Context
    │
    no
    │
    ▼
  Is state cross-app, cross-team, cross-feature?
    │
    yes ──▶ Redux Toolkit (last resort)
```

[arch] Q: If this site grew to 200 visualizers and you wanted a "recently visited" panel on the home page, what changes?

A: Two layers. First, "recently visited" is cross-page state — the home page needs to know what the user did on the visualizer pages — so the rule "no shared state" no longer holds. Second, "recently visited" needs to survive navigation, so it can't be `useState`. The natural shape is localStorage as the source of truth (survives page reload), with a thin Zustand store wrapping it for in-app reactivity. Each visualizer page calls `recordVisit(page)` on mount; the home reads from the store to render the panel. The visualizer pages keep their local animation state — only the "I was here" record lifts. The page-local pattern survives for animation state because animation state still doesn't need to be shared.

Diagram:
```
What lifts, what stays

┌─ visualizer pages ──────────────────────────────────┐
│                                                     │
│   animation state (bars, scan, speed, ...)          │
│      ◀── stays page-local (no consumer outside)     │
│                                                     │
│   "I was here" record                                │
│      ──▶ lifts to Zustand store backed by           │
│           localStorage                              │
└─────────────────────────────────────────────────────┘

┌─ home page ─────────────────────────────────────────┐
│                                                     │
│   reads recently-visited from store ◀──── new       │
│   renders panel                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### The question candidates always dodge

Q: Isn't refusing to use a store a kind of dogma? Every real app has one.

A: Most real apps that need a store have one. Plenty of real apps that don't need one ship one anyway because the team didn't ask the question. The question is "what state needs to be shared?" — and for this codebase the answer is honestly zero. Every visualizer is a sandbox; the home is a static directory; there's no auth, no preferences, no cross-page coordination. Adding Zustand on day one would have been ~50 lines of setup, one provider, and one slice per page-level state — for the privilege of using `useStore` instead of `useState`. The mental model is the same; the surface area is bigger. I'd rather add the store the day a feature needs it, because that day arrives or it doesn't, and either way I haven't paid for it in advance.

Diagram:
```
Two paths from day 0

Path A: add store now              Path B: page-local now,
──────────────────────             ──────────────────────
day 0: 50 lines of                 day 0: 0 lines of
       store setup                        store setup
day 1: every page uses             day 1: every page uses
       useStore                           useState
day N: store grows with            day N: still no store
       no real benefit
                                   day M (when shared state
                                   actually needed):
                                   add Zustand at that
                                   point, migrate the
                                   relevant state

Cost paid:                         Cost paid:
  always                             only when justified
```

### One-line anchors

- "State lives in the page; the page is the smallest scope and also the largest — nothing shares state across pages."
- "Every visualizer is a sandbox: copy the file, change the algorithm, you have a new page."
- "Children components are pure renderers — they read props, they can't set state."
- "I add a store the day cross-page coordination is required; before that day, it's overhead."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw two visualizer pages side by side (e.g., bubble-sort and insertion-sort). Show where their state lives, what flows down to children, and what crosses between the two pages. Label what happens when the user navigates from one to the other.

Open the file and compare against the *Page-local state ownership — diagram* section.

- Pass: you showed two independent state blocks with no arrows between them, and unmount + remount on route change
- Fail: re-read Move 2 and try again

### Level 2 — Explain it out loud

Explain why this codebase has no Redux store to a colleague who's used to "every React app needs a store." No notes. Under 90 seconds.

Checkpoints — did you:
- Name a specific file (`src/app/sorting/bubble-sort/page.tsx`) where state is owned?
- Say what cross-page features are missing as a result?
- Name the tradeoff in one sentence (cross-page coordination traded for fewer dependencies and clearer ownership)?

### Level 3 — Apply it to a new scenario

A teammate wants to add a "remember my preferred speed" feature — when the user changes the speed dropdown on any visualizer, the new value should be the default on every visualizer they open afterward. What changes about state ownership?

Write your answer (3–5 sentences), then open `src/app/sorting/bubble-sort/page.tsx` L18 and `src/const/options.ts` to verify what you'd need to refactor.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: *no cross-page state, so no side-by-side comparison mode is possible*. Answer in writing:

"If you were starting this project today and the headline feature was 'race two sorting algorithms on the same input,' would you still use page-local state? What would the architecture look like instead, and what files in the current codebase would change?"

Reference `src/app/sorting/bubble-sort/page.tsx` L17–L52 (the local state) and the App Router structure to support your answer.

### Quick check — code reference test

Without opening any files, answer:
- How many `useState` calls are in `src/app/sorting/bubble-sort/page.tsx`?
- Is there a Redux/Zustand/Context store anywhere in the codebase?
- What happens to `bars` when the user clicks a Link to a different visualizer?

Then open the files and verify.
