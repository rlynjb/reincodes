# State-driven animation with delayLoop

**Industry name(s):** Async render loop, declarative animation via state, awaited-setTimeout pattern
**Type:** Project-specific composition (of `useState` + `await new Promise(setTimeout)`)

> The visualizer animates by alternating `setState` and `await delayLoop(speed)` inside an async function, so React re-renders between every algorithm step — the UI is always a function of state, the animation is the side effect.

**See also:** → [03-client-component-boundary.md](./03-client-component-boundary.md) · → [06-page-local-state-ownership.md](./06-page-local-state-ownership.md)

---

## Why care

#### Move 1 — The grounded scenario

You've sorted an array in JavaScript before. Native bubble sort runs in microseconds:

```ts
function bubbleSort(arr) {
  for (let i = 0; i < arr.length; i++) {
    for (let r = arr.length - 1; r > i; r--) {
      if (arr[r] < arr[r-1]) {
        [arr[r], arr[r-1]] = [arr[r-1], arr[r]];
      }
    }
  }
  return arr;
}
```

This works. It returns a sorted array. It produces zero pixels. The whole point of the function is the *answer*, not the journey to the answer. If you tried to render the array at every iteration with `setState`, React would batch the updates and the user would see one re-render: the initial array, then the sorted array. The middle is invisible.

Now picture the same algorithm but the goal flips: the journey *is* the product. The user wants to watch each swap happen on screen. Each step has to render. Each step has to pause long enough to see. The algorithm runs in maybe 50ms total — but it has to play out over 5 seconds.

#### Move 2 — Name the question (or job) the pattern answers

The question is: *how do you stretch an algorithm in time so React renders between every step?* The answer in this codebase is to make the algorithm `async`, wrap each render-worthy mutation in a `setState` call, and `await delayLoop(speed)` between mutations. The `await` yields the event loop, React flushes the pending re-render, the browser paints, and *then* the algorithm continues to the next step. The single line `delayLoop(speed)` is what turns the algorithm from "produces an answer" into "produces a sequence of frames."

#### Move 3 — Why answering that question matters

**What depends on getting this right:** the entire visualizer concept. If `setState` and the algorithm don't interleave correctly, you get one of two failure modes. Either React batches updates and the user sees only the start and end (no animation), or the algorithm finishes before any setState commits (same outcome). The pattern is the contract that says "between each step, *stop, let the renderer breathe, then continue.*"

In this codebase, `delayLoop` is six lines (`src/utils/delayLoop.ts` L1–L7). Every visualizer page depends on it. Strip it out and every animation collapses into a flash from "shuffled" to "sorted."

The second thing depending on the answer: *the UI consistency invariant.* Because each step is a `setState` call, the bars on screen are always exactly the array in state. There is no separate animation timeline, no requestAnimationFrame loop with its own array, no DOM mutation outside React. The view is always a pure function of state. If you pause the algorithm halfway through, the bars on screen accurately reflect the half-sorted array — no separate "animation in progress" state to reconcile.

#### Move 4 — Concrete before/after

Without `delayLoop` (synchronous sort):

- Click "Run"
- JS runs the full sort in ~50ms
- React schedules 200 `setState` calls but batches them
- One render commits at the end
- User sees: shuffled → (no intermediate frames) → sorted
- The visualizer doesn't visualize

With `delayLoop` (async sort, `await` between mutations):

- Click "Run"
- For each swap: mutate the array, `setState`, `await delayLoop(100)`
- Each `await` yields the JS event loop
- React flushes the pending render, browser paints, 100ms elapses
- Then the next iteration runs
- User sees: every swap, paced at `speed` ms per step
- Total runtime: `n_swaps * speed` ms, not `~50ms`

#### Move 5 — The one-line summary

`delayLoop(speed)` is `await new Promise(r => setTimeout(r, speed))` with a friendlier name — the pause between two `setState` calls that lets React render the frame and the browser paint it before the algorithm continues.

---

## How it works

### Move 1 — The mental model

The mental model is *interleave state mutations with awaited pauses so the renderer fits in the gaps.*

```
sync algorithm                       async algorithm + delayLoop
──────────────                       ───────────────────────────
swap; swap; swap; swap; ...          swap; setState; await pause;
                                     swap; setState; await pause;
                                     ...

renderer:                            renderer:
  one chance at the end                one chance per await
  → user sees end state only           → user sees every step
```

The underlying strategy: *each `await` yields the event loop; React's commit phase and the browser's paint pipeline fit inside the yield.*

### Move 2 — The layered walkthrough

**`delayLoop` is six lines**

```ts
export const delayLoop = (delay: number = 1000) =>
  new Promise((resolve) => setTimeout(resolve, delay));
```

That's the entire file. It returns a Promise that resolves after `delay` ms. No `clearTimeout`, no cancellation, no token. The simplicity is the whole point.

If you're coming from frontend, you've probably written this inline:

```ts
await new Promise(r => setTimeout(r, 1000));
```

`delayLoop(1000)` is just the named version. The name makes the call sites readable — `await delayLoop(speed)` declares intent better than the inline form.

```
delayLoop(speed)
       │
       │ returns a Promise
       ▼
┌─────────────────────────────────┐
│ setTimeout(resolve, speed)      │
│   │                              │
│   ▼ after speed ms               │
│ resolve()                       │
│   │                              │
│   ▼ Promise settles              │
│ await returns                   │
└─────────────────────────────────┘
```

**The animation contract: mutate state → await → repeat**

Inside the `bubbleSort` function in `src/app/sorting/bubble-sort/page.tsx` L54–L76, the loop reads:

```ts
const bubbleSort = async () => {
  for (let i = 0; i < bars.length; i++) {
    for (let r = bars.length - 1; r > i; r--) {
      if (bars[r] < bars[r-1]) {
        // 1. perform the swap on the in-memory array
        const highval = bars[r-1];
        bars[r-1] = bars[r];
        bars[r] = highval;

        // 2. update the highlight + scan state
        setHighlightIndices([i]);
        setScanIndices(r);

        // 3. yield the event loop for `speed` ms
        await delayLoop(speed);

        // 4. trigger a re-render with the new bars array
        setBars([...bars]);
      }
    }
  }
};
```

If you're coming from React, the pattern looks initially wrong. You're used to "treat state as immutable; never mutate the bars array in place." Here the code does mutate `bars` directly (L58–L60), and *then* calls `setBars([...bars])` (L66) to trigger React's reconciliation. The mutation happens first because the algorithm operates on a real array; the spread-into-`setBars` is what tells React "here's a new reference, please re-render."

```
each iteration of the inner loop
─────────────────────────────────

  bars in memory                React state                  what the user sees
  ──────────────                ────────────                 ────────────────────
  [5,3,8,1,...]                 (last set: [5,3,8,1,...])    bars: [5,3,8,1,...]
        │
        │ swap bars[r] and bars[r-1]
        ▼
  [5,1,8,3,...]                 (last set: [5,3,8,1,...])    bars: [5,3,8,1,...]
                                                              (no render yet —
                                                               state hasn't changed)
        │
        │ setHighlightIndices([i])
        │ setScanIndices(r)
        ▼
        │ await delayLoop(speed)  ◀── yield to event loop
        │
        │ React commits queued updates (highlight, scan)
        │ browser paints
        │ `speed` ms elapses
        ▼
        │ setBars([...bars])     ◀── new reference triggers
        │                            another commit
        ▼
  [5,1,8,3,...]                 (last set: [5,1,8,3,...])    bars: [5,1,8,3,...]
                                                              (now visible)
```

The practical consequence: every iteration produces exactly one visible frame (or close to it — React may coalesce the highlight and bars updates into one commit). The user sees the algorithm tick forward one step per `speed` ms.

**Why `setBars([...bars])` and not just `setBars(bars)`**

React's `useState` setter uses `Object.is` to compare the new value to the old. If you pass the same array reference, React doesn't re-render — it thinks nothing changed, even if you've mutated the array's contents.

```
setBars(bars)        ──▶  React sees same reference  ──▶  no re-render
setBars([...bars])   ──▶  React sees a new array      ──▶  re-render
```

The spread copies the array so the reference changes. Inside the new array are the same numbers, in the new order. React diffs and re-renders the `ArrayVisualizer` with the updated bars.

This is the cost of using direct mutation: every "tell React something changed" call has to construct a new outer reference. The algorithm itself is mutational (idiomatic JS); the boundary to React is where the spread happens.

**`await` is what makes React get its turn**

The non-obvious part is *why the await is necessary at all*. JavaScript is single-threaded. While the synchronous portion of `bubbleSort` is running, nothing else can run — not React's commit phase, not the browser's paint, nothing. `setState` doesn't render immediately; it schedules a re-render to happen after the current synchronous code finishes.

If `bubbleSort` were fully synchronous — 200 swaps, 200 `setState` calls, no `await` — React would coalesce all 200 scheduled re-renders into one, and the user would see only the final array. The `await delayLoop(speed)` is what *splits* the synchronous block. After the `await`, the JS engine returns control to the event loop; the event loop runs React's commit phase, the browser paints, the `setTimeout` callback eventually fires, the Promise resolves, and the algorithm resumes.

```
without await                       with await delayLoop(speed)
─────────────                       ─────────────────────────────
sync block A:                       sync block A:
  setState 1                          setState 1
  setState 2                          await delayLoop(speed) ◀── yield
  setState 3                        (event loop runs:
  ... (200 setStates)                  React commits setState 1
                                       browser paints
final commit:                          speed ms passes)
  one re-render with               sync block B:
  the last value                      setState 2
                                      await delayLoop(speed) ◀── yield
user sees one frame                ...

                                    user sees N frames
```

**Reset is the inverse**

When the user changes the input size or speed, the page calls `reset()` (L24–L27), which does `setBars([])` immediately followed by `setBars(generateArrayOfRandomNumbers(inputSize))`. The empty `setBars([])` is a deliberate hard wipe — without it, React might reconcile the visualizer's bars and animate from the old positions; emptying the array first forces a clean re-render.

`reset()` is synchronous on purpose; it produces a single state change the user sees instantly. The animation pattern only applies during the algorithm itself.

### Move 3 — The principle

The principle this exemplifies is *use the event loop as a frame source.* Traditional animation uses `requestAnimationFrame` and a separate timeline; this codebase uses `await setTimeout` and React's render cycle. The tradeoff is rendering granularity: `requestAnimationFrame` gives you 16ms frames (60fps) and is the right choice when motion needs to be smooth and continuous. `delayLoop(speed)` with `speed` typically 50–500ms gives you discrete frames at human-readable pace, which is exactly what a step-through visualizer wants. The win of using state-driven rendering is the invariant: the UI is always a function of state. Pause the algorithm anywhere and the screen reflects the array exactly as the algorithm sees it.

The full picture is below.

---

## State-driven animation with delayLoop — diagram

```
┌─ Page state (useState in BubbleSort) ─────────────────────────────────────┐
│                                                                           │
│   bars: number[]              ◀── the array being sorted                  │
│   highlightIndices: number[]  ◀── current outer-loop position             │
│   scanIndices: number | null  ◀── current inner-loop position             │
│   speed: number               ◀── ms between steps                        │
│                                                                           │
└─────────────────────────────────│─────────────────────────────────────────┘
                                  │ feeds props to
                                  ▼
┌─ ArrayVisualizer (read-only renderer) ────────────────────────────────────┐
│                                                                           │
│   draws each bar with height = bars[i]                                    │
│   marks highlightIndices in one colour, scanIndices in another            │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

                              ▲     │
                              │     │ user clicks Run
                              │     ▼
┌─ async bubbleSort() ──────────────────────────────────────────────────────┐
│                                                                           │
│   for each pair (i, r):                                                   │
│      if bars[r] < bars[r-1]:                                              │
│           1.  swap in place                                               │
│           2.  setHighlightIndices([i])                                    │
│               setScanIndices(r)                                           │
│           3.  await delayLoop(speed)   ◀── yields the JS event loop       │
│           4.  setBars([...bars])       ◀── new ref → forces re-render     │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

                              ▲                              │
                              │                              │ yield
                              │                              ▼
┌─ Event loop + React + browser ────────────────────────────────────────────┐
│                                                                           │
│   1.  React commits queued state updates                                  │
│   2.  ArrayVisualizer re-renders with new bars                            │
│   3.  Browser paints                                                      │
│   4.  setTimeout fires after speed ms                                     │
│   5.  delayLoop Promise resolves                                          │
│   6.  control returns to bubbleSort                                       │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**The primitive**
**File:** `src/utils/delayLoop.ts`
**Function / class:** `delayLoop`
**Line range:** L1–L7 (the whole file)

```ts
export const delayLoop = (delay: number = 1000) =>
  new Promise((resolve) => setTimeout(resolve, delay));
```

**The canonical usage site**
**File:** `src/app/sorting/bubble-sort/page.tsx`
**Function / class:** `bubbleSort` (inner function inside `BubbleSort` component)
**Line range:** L54–L76

The async function that wraps the sorting algorithm and interleaves it with `setBars` + `await delayLoop(speed)`. The single `await delayLoop(speed)` on L64 is what splits the algorithm into observable steps.

**The state hooks that the animation drives**
**File:** `src/app/sorting/bubble-sort/page.tsx`
**Lines:**
- `bars` — L39 (`useState([] as number[])`)
- `highlightIndices` — L51
- `scanIndices` — L52
- `speed` — L18

**The render target**
**Component:** `ArrayVisualizer`
**Usage:** L121–L125

Read-only. Renders bars from props. No internal animation state — every visual change comes from a parent `setState`.

Every other visualizer page (insertion-sort, quick-sort, BST traversal, BFS on a grid, Dijkstra) follows the same shape: `useState` for what's being mutated, an async function with the algorithm body, `await delayLoop(speed)` between mutations.

---

## Elaborate

### Where this pattern comes from

The pattern emerged from React developers wanting to teach algorithms. Static teaching diagrams show the start and end; nothing in between. The earliest sorting visualizers (Sound of Sorting, c. 2011) used native code with explicit `Sleep()` calls between mutations. When React + hooks landed in 2019, the JS-side equivalent became `await new Promise(r => setTimeout(r, ms))` between `setState` calls — same idea, declarative renderer instead of imperative draw calls. The `delayLoop` name is project-specific; the pattern is not.

### The deeper principle

The deeper principle is *the renderer needs a chance to run.* Whether you're animating bars, streaming LLM tokens to a chat UI, or simulating a physics tick, the renderer is single-threaded with your code. If you don't yield, you don't paint. The choices for yielding are:

```
yield mechanism                       use when
───────────────                       ──────────────────────────────────
await new Promise(setTimeout)        discrete steps at human pace
requestAnimationFrame                continuous motion at frame rate
async iteration over a stream        rate set by the producer (network, LLM)
Web Workers + postMessage             heavy CPU that would block the renderer
```

All of them are variations on the same idea: split the work so the renderer fits between the pieces.

### Where this breaks down

This pattern breaks when the animation needs sub-`speed`-ms precision (a 60fps physics animation cannot use 100ms `setTimeout` slices), when the algorithm has to remain interruptible mid-step (no cancellation token here means clicking "Reset" mid-sort lets the in-flight sort keep mutating state), or when the algorithm needs to run faster than `speed` allows for very large inputs (200 swaps at 100ms each is 20 seconds; at 10ms each, React's render cost starts to dominate).

The codebase accepts the cancellation cost — running `reset()` during a sort can produce a brief visual race as the in-flight `setBars` calls finish. The fix would be an `AbortController`-like signal threaded through the async function; the codebase has chosen simplicity over that.

### What to explore next

- `requestAnimationFrame` → the continuous-motion equivalent; uses the browser's actual frame schedule instead of `setTimeout`
- Generators (`function*`) → an alternate way to express step-at-a-time algorithms, used in `src/utils/data_structures/Tree.ts` for tree traversals
- Reactive streams (RxJS, Solid signals) → a different mental model where state changes themselves are time-stamped events
- AbortController → the standard primitive for "cancel this in-flight async operation," what's missing from the current cancellation story

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌─────────────────────┬───────────────────────────┬──────────────────────────────┐
│ Cost dimension      │ setState + delayLoop      │ Imperative rAF + canvas      │
│                     │ (taken)                   │ (the alternative)            │
├─────────────────────┼───────────────────────────┼──────────────────────────────┤
│ Code clarity        │ algorithm + setState +    │ algorithm + manual frame     │
│                     │ await, reads top-down     │ scheduling + draw calls      │
│ Frame rate ceiling  │ ~30–60fps in theory,      │ true 60fps; sub-16ms steps   │
│                     │ limited by setTimeout +   │ possible                     │
│                     │ React reconciliation      │                              │
│ Frame rate floor    │ unbounded slow — speed=   │ 16ms minimum frame slot      │
│                     │ 1000 means 1 step/sec     │                              │
│ State <-> view sync │ always — view is a        │ requires reconciliation;     │
│                     │ function of state         │ canvas state separate from   │
│                     │                           │ React state                  │
│ Cancellation        │ none — sort runs to       │ trivial — cancel rAF token   │
│                     │ completion regardless     │                              │
│ DOM granularity     │ React diffs each frame,   │ single canvas paint per      │
│                     │ updates only changed bars │ frame, no diffing            │
│ Cognitive load      │ matches React mental      │ second mental model alongside│
│                     │ model                     │ React                        │
│ Onboarding          │ any React dev recognises  │ canvas + rAF requires        │
│                     │ useState + await          │ separate context             │
└─────────────────────┴───────────────────────────┴──────────────────────────────┘
```

### Sub-block 1 — what we gave up

The first cost is *no cancellation*. Once `bubbleSort()` starts, it runs to completion or until the component unmounts. Clicking Reset mid-sort doesn't stop the in-flight algorithm; it just races with it. The user might see the bars regenerate, then suddenly snap to a partially-sorted state as a queued `setBars` lands. The fix would be threading an `AbortSignal` through every algorithm and checking it before each `await` — small change per file but multiplied by every visualizer.

The second cost is *frame rate limited by React reconciliation*. Each `await delayLoop(speed)` produces a re-render of `ArrayVisualizer`, which diffs and updates DOM nodes. At small `speed` values (10–30ms) the cost of React's reconciliation starts to matter — the actual frame rate is `1000 / (speed + reconciliation_time)` not `1000 / speed`. For the input sizes here (20–200 bars), reconciliation is fast enough that the cap doesn't bite, but it would for 10,000-element arrays.

The third cost is *the visual rate is the algorithm rate*. The algorithm cannot run faster than the animation. If you want to sort an array silently and only show the final state, you'd need a separate code path that skips `delayLoop`. The codebase has no such path because the algorithm and the animation are the same thing.

### Sub-block 2 — what the alternative would have cost

If this had been implemented with `requestAnimationFrame` and a canvas, the rendering would be tighter — true 60fps, sub-16ms steps, smooth motion. But every visualizer would need its own draw function (rectangles for sorting, circles + lines for BST, grids for BFS), every change would require a separate "the canvas state changed" mechanism, and React would no longer be the source of truth for what's on screen.

The cost of canvas + rAF for a teaching tool would be the loss of the "pause and inspect" property. With state-driven rendering, you can pause the algorithm at any step and the DOM shows exactly the array at that step — inspectable in DevTools, screenshotable, accessible to keyboard nav and screen readers. Canvas is opaque to all of that.

The cancellation story is also better with rAF — you hold a frame-request ID and call `cancelAnimationFrame(id)` to stop. The current codebase has nothing equivalent.

The net: the alternative is faster and more cancellable, slower to write, harder to inspect, and gives up the React-as-source-of-truth invariant.

### Sub-block 3 — the breakpoint

The setState + delayLoop pattern stops being the right call when (1) array sizes exceed ~1000 and the React reconciliation cost exceeds the `speed` budget, (2) sub-16ms step granularity is required, or (3) cancellation matters enough to thread it through every algorithm. For sorting visualizers with 20–200 bars at 100–500ms per step, the pattern is well below all three breakpoints.

### Sub-block 4 — what wasn't actually a tradeoff

Generators (`function*`) were not a meaningfully different option. They'd give you step-at-a-time iteration, but you'd still need `setTimeout` between steps to let React render — so the rendering question is the same, just with a different control-flow style. Generators win when the algorithm needs to be paused and resumed by external code (a "step forward" button instead of an automatic timer); the current codebase always runs the algorithm to completion once Run is clicked, so generators add ceremony without payoff.

### Tone

`setState + await delayLoop` is the right call for a step-through teaching tool. It matches React's mental model, makes the UI a pure function of state, and the costs (no cancellation, modest rate ceiling) are below the regime this codebase operates in.

---

## Tech reference (industry pairing)

### `setTimeout` + `Promise`

- **Codebase uses:** `src/utils/delayLoop.ts` L5 wraps `setTimeout` in a `Promise` so it can be `await`ed. Every visualizer page calls `await delayLoop(speed)`.
- **Why it's here:** the yield point. Without an explicit yield to the event loop, React batches every `setState` in the algorithm into one final commit and no animation appears.
- **Leading today:** `setTimeout` — adoption-leading across all of JavaScript, 2026.
- **Why it leads:** universal browser support, predictable semantics, no dependencies. The "use setTimeout and forget it" pattern has worked since 1996.
- **Runner-up:** `requestIdleCallback` — innovation-leading for "do this work when the browser isn't busy," used in some React internals; not appropriate here because the codebase wants a *fixed* delay, not an opportunistic one.

### React `useState`

- **Codebase uses:** `useState` hooks for `bars`, `highlightIndices`, `scanIndices`, `speed`, `inputSize` at L17, L18, L39, L51, L52 of `src/app/sorting/bubble-sort/page.tsx`.
- **Why it's here:** the source of truth for what's on screen. Every state setter triggers a re-render of `ArrayVisualizer`, which makes the animation visible.
- **Leading today:** React hooks — adoption-leading for component-local state across React, 2026.
- **Why it leads:** the standard React state primitive since 2019; every React tutorial, library, and codebase uses it; integrates with concurrent rendering and Suspense without extra setup.
- **Runner-up:** Solid signals — innovation-leading for fine-grained reactivity; only re-renders the DOM nodes that depend on the changed value. Faster for high-frequency updates but a different framework.

### `async`/`await` for control flow

- **Codebase uses:** `const bubbleSort = async () => { ... await delayLoop(speed) ... }` at L54–L76 of `src/app/sorting/bubble-sort/page.tsx`. Every visualizer's algorithm function is declared `async` so it can `await` between steps.
- **Why it's here:** lets the algorithm body read top-down like normal imperative code, even though the function yields the event loop between steps.
- **Leading today:** `async`/`await` — adoption-leading for asynchronous JS control flow, 2026.
- **Why it leads:** turns Promise chains into linear code; supported natively in every modern engine; matches how programmers naturally write step-by-step logic.
- **Runner-up:** RxJS observables — innovation-leading for event-stream-style reactivity; overkill for a single linear algorithm but the right shape when multiple data sources must be combined.

---

## Summary

### Part 1 — concept recap

State-driven animation with `delayLoop` is the pattern that turns a normally instant algorithm into a step-by-step animation by interleaving `setState` calls with `await delayLoop(speed)`. In this codebase, every visualizer page declares its algorithm as an `async` function, calls `setBars([...bars])` after each mutation, then `await delayLoop(speed)` to yield the event loop so React can render and the browser can paint. The constraint that made it the right call is the product itself: the visualizer is the algorithm, so the algorithm has to render every step in real time. The cost is no cancellation (in-flight sorts can't be stopped) and a modest frame-rate ceiling driven by React reconciliation, both well below where the codebase operates.

### Part 2 — key points to remember

- This pattern lives in checklist step 2 (**Request / response flow** — the entire render cycle inside the browser is driven by this loop) and step 4 (**State ownership** — only client-owned state can drive an animation).
- `delayLoop(ms)` is `new Promise(r => setTimeout(r, ms))` — six lines, no cancellation, no dependencies.
- The `await` is the load-bearing piece; without it, React batches every `setState` into one commit and the animation collapses.
- The algorithm mutates the bars array in place (idiomatic JS), then calls `setBars([...bars])` to give React a new reference and trigger a re-render.
- The UI is always a function of state — pause the algorithm and the screen reflects the array exactly as the algorithm sees it.
- The breakpoint is sub-16ms steps or array sizes >1000; below that, the pattern is the right choice for any step-through visualizer.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks how the animation works, they're probing two things: do you understand the event loop well enough to know why `setState` alone isn't enough, and did you pick this approach deliberately versus the canvas-and-rAF alternative? The answer they want shows you can name the event-loop yield, name the React batching that makes the yield necessary, and name what canvas would have bought you that you decided not to pay for.

### Likely questions

[mid] Q: Why do you need `await delayLoop(speed)` instead of just calling `setBars` repeatedly?

A: Because JavaScript is single-threaded and React batches state updates inside synchronous code. If I call `setBars` 200 times in a tight loop, React coalesces all 200 into one final commit — the user sees the shuffled array, then the sorted one, with no frames in between. The `await delayLoop(speed)` yields the event loop, which lets React commit the queued update, lets the browser paint, then resumes the algorithm. The `delayLoop` itself is six lines: a Promise wrapping `setTimeout`.

Diagram:
```
without await                       with await
──────────────                      ────────────
sync block of setBars × 200         setBars; await delayLoop;
       │                            setBars; await delayLoop;
       │                            ...
React batches all 200
       │                            React commits between each
       ▼                            event-loop yield
one re-render at the end
                                    user sees N frames
user sees 1 frame
```

[senior] Q: Why not use `requestAnimationFrame` and a canvas? That's the standard way to animate.

A: Two reasons. First, the visualizer isn't a continuous motion animation — it's a step-by-step teaching tool. The user is supposed to see one swap at a time, paced slowly enough to follow. `requestAnimationFrame` is built for 60fps continuous motion; `setTimeout` with a configurable `speed` lets the user pick anything from 10ms to 1000ms per step. Second, using React for the rendering keeps the invariant that the DOM is a function of state — pause the algorithm, the screen reflects the array exactly. Canvas is opaque to DevTools, screenshots, and screen readers, which would matter for a teaching tool. The trade is performance (canvas would be smoother at fast speeds) for inspectability and a single mental model.

Diagram:
```
What we picked vs canvas + rAF

┌──────────────────────┬───────────────────┬──────────────────────┐
│ Property             │ setState +        │ rAF + canvas         │
│                      │ delayLoop         │                      │
├──────────────────────┼───────────────────┼──────────────────────┤
│ Step granularity     │ user-controlled   │ 16ms locked          │
│                      │ (10–1000ms)       │                      │
│ Pauseable/inspectable│ DOM = state       │ opaque pixel buffer  │
│ Performance ceiling  │ ~hundreds of bars │ thousands of items   │
│ Mental model         │ pure React        │ React + canvas       │
└──────────────────────┴───────────────────┴──────────────────────┘
```

[arch] Q: If the array had 100,000 bars instead of 20, what would break first?

A: Three things would degrade in order. First, the `setBars([...bars])` call would become expensive — spreading 100k elements is O(n) per step, and there are ~n² swaps, so spread cost dominates. Second, React's reconciliation of `ArrayVisualizer` would have to diff 100k DOM nodes per frame — at that scale, the diff cost easily exceeds the `speed` budget. Third, `setTimeout`'s minimum effective delay is around 4ms; at array sizes that need fast scrolling, the `speed` floor would push back. The fix is layered: virtualised rendering (only draw the bars on screen), structural sharing via Immer or a typed array to skip the spread, and possibly moving to canvas rendering for the array itself while keeping React for the controls. None of those are needed at the current scale.

Diagram:
```
What breaks first as input size grows

input size  ▏  bottleneck
─────────── ┼ ──────────────────────────────────────
n = 20      ▏  nothing — pattern works
n = 200     ▏  nothing — pattern works
n = 2,000   ▏  setBars spread cost becomes noticeable
n = 20,000  ▏  React diff cost exceeds speed budget
n = 100,000 ▏  must move to canvas or virtualised list
```

### The question candidates always dodge

Q: There's no way to cancel a running sort. Doesn't that produce race conditions?

A: Yes, and the codebase accepts it. If the user clicks Reset mid-sort, the in-flight `bubbleSort()` keeps running because there's no cancellation token. It continues calling `setBars` on the array even after `reset()` has wiped it and re-randomised it. The visible result is a brief flicker — the new array shows, then a stale `setBars` from the old sort lands, then maybe more. In practice the algorithm finishes within a few seconds and the racing stops, so the user sees the correct end state. The right fix is an `AbortSignal` threaded through every algorithm, with `if (signal.aborted) return;` checks before each `await delayLoop`. I haven't paid that cost because the visible glitches are tolerable for a teaching tool and the cancellation surface area would multiply across every visualizer. If the project grew to expose pause/resume controls on every visualizer, the signal would become non-optional.

Diagram:
```
What the race looks like

t=0      user clicks Run                    bars = [random]
t=0+     bubbleSort() starts                bars mutates step by step
t=2.0s   user clicks Reset                  bars = []  → setBars([random])
t=2.0+   in-flight sort still running       setBars(old half-sorted array)
t=2.0++  more stale setBars land            bars flips back and forth
t=4.0s   old sort finishes                  user sees correct random array
```

### One-line anchors

- "`delayLoop` is six lines — a Promise wrapping `setTimeout` — but it's what turns an algorithm into an animation."
- "Without an `await` between `setState` calls, React batches them into one commit and the user sees only the final frame."
- "I picked React + state-driven rendering over canvas + rAF because the visualizer is a teaching tool, and DOM-based rendering is inspectable in ways canvas isn't."
- "The animation contract is `setState → await delayLoop(speed) → setState` — break that pattern and the visualizer stops visualizing."
- "There's no cancellation; in-flight sorts run to completion. That's a known cost the codebase accepts."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the full loop from the user clicking Run to one swap appearing on screen. Label each box: the algorithm function, the state setters, the await, the event loop, React's commit, the browser paint. Show what happens during the `await delayLoop(speed)` step specifically.

Open the file and compare against the *State-driven animation with delayLoop — diagram* section.

- Pass: you showed the event-loop yield as the load-bearing step and labelled what React and the browser do during it
- Fail: re-read Move 2 (the `await` paragraph) and try again

### Level 2 — Explain it out loud

Explain why `setBars([...bars])` is necessary instead of `setBars(bars)` to a colleague who knows React. No notes. Under 90 seconds.

Checkpoints — did you:
- Name `Object.is` or "React compares references"?
- Reference `src/utils/delayLoop.ts` and `src/app/sorting/bubble-sort/page.tsx` L66?
- Name the tradeoff in one sentence (mutational algorithm + spread at the React boundary)?

### Level 3 — Apply it to a new scenario

Without looking at the file: a teammate adds a new "step backward" button to the visualizer. When clicked, it should reverse the last swap. What changes about the animation contract, and what new state does the page need to own?

Write your answer (3–5 sentences), then open `src/app/sorting/bubble-sort/page.tsx` L54–L76 and reason through whether the current pattern supports it or needs to be replaced.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: *no cancellation*. Answer in writing:

"If you were starting this project today and expected users to scrub the algorithm back and forth like a video player, would you keep the `await delayLoop(speed)` pattern? What would you add or change in `src/utils/delayLoop.ts` and in each visualizer page?"

Reference `src/utils/delayLoop.ts` L1–L7 and `src/app/sorting/bubble-sort/page.tsx` L54–L76 to support your answer.

### Quick check — code reference test

Without opening any files, answer:
- What's the entire body of `delayLoop`? (one expression)
- Inside `bubbleSort`, what comes immediately after the `await delayLoop(speed)` line?
- Where is `speed` set initially? (which line of `bubble-sort/page.tsx`?)

Then open the files and verify.
