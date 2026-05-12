# Animation loop pattern (await-delay in async algorithm)

**Industry name(s):** Async-await stepping, frame-rate-controlled visualization, cooperative animation
**Type:** Project-specific (composition of `async/await` + `setTimeout` + React state)

> Every visualizer animates by mutating state inside an async algorithm, awaiting a `delayLoop(speed)` between mutations so the user sees one step at a time.

**See also:** → [03-client-component-islands](./03-client-component-islands.md) · → [04-component-composition](./04-component-composition.md)

---

## Why care

You've watched a sort algorithm in a textbook animation and felt time slow down — bar swaps appearing one after another, each pause letting you trace what changed. That visible pacing is the *whole product*; without it, the algorithm finishes in a millisecond and you see the sorted output without learning anything. The trick is making JavaScript wait at deliberate points.

This is the **cooperative animation** pattern: instead of `requestAnimationFrame` or `setInterval`, the algorithm itself yields control with `await new Promise(resolve => setTimeout(resolve, ms))`. Same shape that powers older sleep-based simulators, Python's `time.sleep` in jupyter teaching notebooks, and the kind of "step debugger" mode many learning tools use. Here's how that yields-and-mutates loop runs in this codebase.

---

## How it works

Picture a movie editor scrubbing through footage one frame at a time. They could press play and watch the whole sequence in real time, but for editing they need each frame to *pause* until they say "next." That's what `delayLoop` does — it pauses the algorithm between mutations so the React render cycle has time to paint each step before the next swap happens.

### The four-line core

```
// src/utils/delayLoop.ts:5
export const delayLoop = (delay: number = 1000) =>
  new Promise((resolve) => setTimeout(resolve, delay));
```

That's the whole helper. **If you're coming from frontend, you're used to `setTimeout(callback, ms)` — here it's wrapped in a Promise so it's awaitable.** The practical consequence: anywhere you write `await delayLoop(speed)` inside an `async` function, the function suspends, the event loop runs other work, and execution resumes after `speed` ms.

```
Without delayLoop:                      With await delayLoop(50):
  for i in bars:                          for i in bars:
    swap(i)        ──┐                      swap(i)            ──┐
    setBars([...])   │  All in one          setBars([...])       │
    swap(i+1)        │  microtask           await delayLoop(50)  │  Yield to React,
    setBars([...])   │  No paint            swap(i+1)            │  one paint per
    swap(i+2)        │  between             setBars([...])       │  swap
    setBars([...]) ──┘                      await delayLoop(50)  │
                                          ...                  ──┘
  ↓ user sees: final state only          ↓ user sees: every swap
```

### The async algorithm shape

Every sort page follows the same shape (using bubble sort as the example):

```
// src/app/sorting/bubble-sort/page.tsx:54-76
const bubbleSort = async () => {
  for (let i=0; i<bars.length; i++) {
    for (let r=bars.length-1; r>i; r--) {
      if (bars[r] < bars[r-1]) {
        // 1. Mutate the array in place
        const highval = bars[r-1];
        bars[r-1] = bars[r];
        bars[r] = highval;

        // 2. Update highlight state (controls bar colours)
        setHighlightIndices([i]);
        setScanIndices(r);

        // 3. Yield to React → it paints the new bars + highlights
        await delayLoop(speed);

        // 4. Push the mutated array into state to trigger another paint
        setBars([...bars]);
      }
    }
    // tidy up at the end of the outer pass
    if (i === bars.length-1) {
      setHighlightIndices([]);
      setScanIndices(null);
    }
  }
}
```

**This is like a generator function pausing at each `yield` — except it uses `async/await` instead of generator syntax.** Four steps repeat per swap: mutate, update highlights, await, push to state. The await is load-bearing — without it, all the swaps happen in one synchronous microtask and React batches them into a single re-render at the end.

The condition under which it works: this depends on `await delayLoop(0)` being enough to yield. In practice `setTimeout` always queues a task after the current microtask flush, so even `delayLoop(0)` gives React a chance to paint. With `speed > 0`, the user gets a deliberate pause they can watch.

### Why `setBars([...bars])` after the await

The first three steps mutate `bars` in place and call `setHighlightIndices` / `setScanIndices`. React sees the new highlights and re-renders — but `bars` is still the same array reference, so React's `===` check on the `array` prop of `ArrayVisualizer` might short-circuit. The `setBars([...bars])` after the await forces a new reference, guaranteeing the bar positions also re-render even though their contents changed.

**Think of it like `this.forceUpdate()` for arrays — except you do it by giving React a new top-level reference.** The boundary condition: if `ArrayVisualizer` memoised the bars deeply (it doesn't), the spread might not be enough; you'd need to clone the elements too. Today, shallow spread suffices.

### The same shape in graph traversal

```
// src/app/graphs/finding-shortest-path/page.tsx:276-292
const runAlgo = async () => {
  let algo = Dijkstras(graph, graph.nodes[0].index, graph.numNodes);

  for (let i=0; i<algo.length; i++) {
    setHighlight((oldNodeIndex) => {
      const newNodeIndex = [...oldNodeIndex];
      newNodeIndex.push(algo[i])
      return newNodeIndex;
    });

    await delayLoop(200)
  }
}
```

Same pattern: compute the answer up front, then step through the answer one item per `delayLoop` tick, updating state each step. The visualizer (`GridVisualizer` here) reads `highlight` and adds CSS classes.

### Move 2.5 — current state vs future state

Today every page hand-rolls the loop. **What doesn't have to change** if reincodes ever wants pause/resume/scrub controls: the algorithm shape stays the same; you'd wrap `delayLoop` with a controllable timer (a `useRef` to a "paused" flag, or an event-emitter pattern). The fact that every algorithm is already `async` means it can be paused at any await — that's the architectural foresight; cooperative scheduling makes scrubbing tractable later.

### The principle

This is what people mean by "cooperative animation": the unit of work yields control rather than being preempted. Same principle as Python's `asyncio.sleep(0)` for letting the event loop breathe, or game loops that call `yield` after each frame. In the React world, where everything is single-threaded JS, cooperation is the only option — there's no preemption to be had. The win is *the algorithm and the animation are the same function*; you don't translate an algorithm into a frame-by-frame state machine, you just sprinkle awaits in the natural code.

The full picture is below.

---

## Animation loop pattern — diagram

```
async function run() {

  ┌─ Loop body ────────────────────────────────────────────────┐
  │                                                            │
  │   1. Mutate bars[]    ──┐                                  │
  │                         │ in-place mutation                │
  │   2. setHighlight(...)  │ schedule re-render               │
  │                         │                                  │
  │   3. await delayLoop(speed)                                │
  │      ┌─────────────────────────────────────────┐           │
  │      │  Browser event loop ticks while waiting │           │
  │      │  ─ React commits the highlight change   │           │
  │      │  ─ Browser paints the new frame         │           │
  │      │  ─ User sees one step of the algorithm  │           │
  │      └─────────────────────────────────────────┘           │
  │                                                            │
  │   4. setBars([...bars])  ← force new array reference       │
  │                                                            │
  └────────────────────────────────────────────────────────────┘
                              │
                              ▼  loop next iteration
}

(Pattern lives entirely client-side — algorithm + animation = one async function)
```

---

## In this codebase

**Core helper:** `src/utils/delayLoop.ts` L1–L7 — 4 lines.
**Sort use:** `src/app/sorting/bubble-sort/page.tsx` L54–L76 — `bubbleSort` async function.
**Graph use:** `src/app/graphs/finding-shortest-path/page.tsx` L276–L292 — `runAlgo` async function.
**Network use:** `src/components/NetworkDiagram/NetworkDiagram.tsx` L179–L188 — `traverseNodes` async function (highlights BFS path through d3 nodes).

GitHub: `[delayLoop.ts](https://github.com/rlynjb/reincodes/blob/main/src/utils/delayLoop.ts)`.

---

## Elaborate

### Where this pattern comes from
The `Promise(resolve => setTimeout(resolve, ms))` idiom predates `async/await` (which arrived in ES2017) — it's the canonical way to "sleep" in JavaScript, dating back to early Promise libraries (Q, Bluebird). What changed with `async/await` is that calling it became natural: instead of `.then(() => doNext())` chains, you write `await sleep(); doNext();`. The visualization-specific application of this pattern shows up in tutorials all the way back to D3 animation guides circa 2014.

### The deeper principle
*Cooperative scheduling makes time visible.* When you sprinkle awaits in an algorithm, time becomes an explicit feature of the code — pauses are *in the source*, not somewhere else in a separate animation system. That makes the algorithm and its animation refactor-together.

### Where this breaks down
- High-fps animation (60fps+). `setTimeout(50)` is fine for "show me each swap," not fine for smooth transitions — those want `requestAnimationFrame`.
- Cancellation. There's no built-in way to abort a running `bubbleSort()`. Today the only cancel is reload-the-page. A future pause/resume would need a shared "abort" flag the algorithm checks at each await.
- Concurrent runs. If a user clicks "Run" twice quickly, two `bubbleSort()` calls run in parallel and stomp on the same `bars` array. Today this is unhandled; ideally a `useRef` lock would prevent re-entry.

### What to explore next
- [02-dsa/01-selection-sort](../02-dsa/01-selection-sort.md) — see the same loop with a different inner algorithm.
- [03-client-component-islands](./03-client-component-islands.md) — why every page that uses this pattern must be a client component.
- [07-d3-imperative-with-useeffect](./07-d3-imperative-with-useeffect.md) — a place where animation is delegated to d3 instead of `delayLoop`.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ delayLoop (await/sleep)  │ requestAnimationFrame    │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Code shape       │ Algorithm = animation    │ State machine + tick fn  │
│ Frame rate       │ 1 step per `speed` ms    │ 60fps, easing curves     │
│ Pause/resume     │ Not built in             │ Trivial (skip a tick)    │
│ Cancellation     │ Not built in             │ Cancel the rAF handle    │
│ Re-entry safety  │ Manual lock              │ Manual lock              │
│ Memory           │ Promise per delay (~ms)  │ One rAF callback         │
│ Battery          │ ~free (sparse timers)    │ Higher (continuous loop) │
│ Onboarding       │ Anyone reads it          │ Need to know rAF idiom   │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Pause/resume/scrub controls. The algorithm runs straight through once started; the only way to "pause" is to reload. Adding pause would require a shared flag the algorithm consults at each await — doable but not free.

Cancellation safety. If a user clicks Run while a previous Run is mid-flight, two algorithms race over the same `bars` array. The visible artefact is flicker and incorrect intermediate states. The fix is a `useRef` lock guarding the entry to `bubbleSort()`. Today, the assumption is users don't double-click; in a teaching tool this assumption sometimes breaks.

Frame-rate smoothness. `setTimeout(50)` produces ~20fps animation, which is fine for visible-step pacing but jittery for smooth motion. If reincodes wanted to interpolate bar positions during a swap (animate the bars sliding past each other rather than instantly swapping), this pattern wouldn't carry it — `requestAnimationFrame` would.

### What the alternative would have cost

If `bubbleSort` were rewritten as a state machine (`{ step: 0, swapping: [i, j], bars: [...] }`) advanced by `requestAnimationFrame`, the code would balloon from ~25 lines to ~80, the algorithm would no longer read as bubble sort, and adding a new sort would require translating the algorithm into the state-machine shape. The teaching value drops — the code stops *being* the algorithm.

The alternative also adds a coordination layer between the rAF tick and React state updates. The cooperative pattern sidesteps that: each await yields naturally to React, and React's commit phase happens between awaits without explicit coordination.

### The breakpoint

Fine until pause/resume/scrub become real product requirements (a teaching tool benefits enormously from these), or until concurrent algorithm runs become common (e.g., side-by-side sort comparison), or until smooth interpolated motion becomes a goal. At any of those, the pattern needs a wrapper — controllable timer, abort flag, or rAF-driven state machine.

---

## Tech reference (industry pairing)

### setTimeout + Promise + async/await

- **Codebase uses:** `setTimeout` wrapped in a Promise, awaited inside async algorithm functions. `delayLoop.ts` is the four-line helper.
- **Why it's here:** the simplest way to yield from inside an algorithm loop so the React render cycle can paint between steps.
- **Leading today:** `async/await` — `adoption-leading` for asynchronous JavaScript, 2026 (no real competitor; generators and `.then()` chains exist but no one writes new code in them).
- **Why it leads:** ES2017 standard; supported everywhere; integrates naturally with Promise-returning APIs.
- **Runner-up:** Generators (`function*` + `yield`) — same expressive power, but stigmatised for being awkward; mostly relegated to data-stream libraries.

### requestAnimationFrame (the alternative)

- **Codebase uses:** None. The pattern would be `function tick() { ...mutate...; requestAnimationFrame(tick); }`.
- **Why mention it:** the right pattern for 60fps animation, smooth interpolation, and battery-friendly compositing.
- **Leading today:** rAF — `adoption-leading` for visual animation, 2026.
- **Why it leads:** browser-scheduled to run at display refresh rate; pauses automatically when tab is backgrounded.

---

## Summary

### Part 1 — concept recap

The animation loop pattern is the technique of writing an algorithm as an `async` function and `await`ing a Promise-wrapped `setTimeout` between mutations, so React has time to paint each step before the next mutation happens. reincodes uses this in every visualizer — `bubbleSort` in `bubble-sort/page.tsx`, `runAlgo` in `finding-shortest-path/page.tsx`, `traverseNodes` in `NetworkDiagram.tsx` — all built on the four-line `delayLoop` helper. The constraint that forces the choice is "algorithm code should *read* as the algorithm," and the cost paid is that there's no built-in pause/resume/cancel — the algorithm runs straight through once started.

### Part 2 — key points to remember

- `delayLoop(ms)` is 4 lines: a Promise that resolves after `ms` via `setTimeout`.
- The four-step loop body: mutate, setHighlight, await, setBars-spread.
- The `setBars([...bars])` after the await is what forces React to see a new array reference.
- Lives in step 2 (Request/response flow — the "request" here is the user clicking Run) and step 5 (Failure handling — double-click races are the failure mode) of the system-design checklist.
- The cost is no pause/resume/cancel and no concurrency safety — visible artefacts on edge cases.

---

## Interview defense

### What an interviewer is really asking

When someone asks how the animation works, they want to know whether you understand the *event loop* and *React's commit phase*, not just that "setTimeout exists." The right answer names: the algorithm yields with `await`, the browser processes microtasks (React commits state changes), the next paint runs, and the algorithm resumes when the timer fires.

### Likely questions

**Q [mid]: Walk me through one swap in bubble sort. What happens at each step?**

A: Four moves. First, mutate `bars[r-1]` and `bars[r]` in place — JS object mutation, no React involvement yet. Second, call `setHighlightIndices([i])` and `setScanIndices(r)` — these schedule re-renders. Third, `await delayLoop(speed)` — the function suspends, React processes the pending state updates and paints the new highlights, then `speed` ms pass on the timer. Fourth, `setBars([...bars])` — push a new array reference so React re-renders the bars themselves. Then the loop continues.

```
1. swap bars[r-1] ↔ bars[r]   (sync mutation, no render)
2. setHighlight(...)           (schedule render)
3. await delayLoop(50)         (yield → React paints, then timer fires)
4. setBars([...bars])          (force new ref → paint again)
```

**Q [senior]: Why do you call `setBars` *after* the await and not before?**

A: Two reasons. (a) Putting `setBars` before the await means React might batch all four state updates (`setHighlight`, `setScan`, `setBars`) into one render — which is what we want for *the next* paint, but it'd happen before the timer fires, so the user wouldn't see a delay between mutations. Putting `setBars` after the await means the new array reference lands in state at the *start* of the next loop iteration, painted as the new starting state. (b) Mutating `bars` in place and then calling `setBars([...bars])` is a deliberate two-step: the mutation is for the algorithm's correctness; the spread is for React's identity check. Doing them at separate moments makes the contract explicit.

```
┌── before-await order ─────┐    ┌── after-await order ──────┐
│  mutate                   │    │  mutate                   │
│  setHighlight             │    │  setHighlight             │
│  setBars(spread)          │    │  await delayLoop ─────────│  ← yield
│  await delayLoop ─────────│    │  setBars(spread)          │
│  (all 3 setStates batched)│    │  (paint highlights, then  │
│                           │    │   paint new bars on next  │
│                           │    │   iteration's setHighlight)│
└───────────────────────────┘    └───────────────────────────┘
   1 paint per iteration            2 paints per iteration
```

**Q [arch]: Two users click Run at the same time on the same page. What happens?**

A: Single browser session — not "two users," but if a user clicks twice quickly, two `bubbleSort()` invocations run in parallel because each click hands off to `await delayLoop()` which doesn't lock. They share the same `bars` array (mutated in place), so they swap *each other's* swaps, and you'll see flicker, partial sorts, and possibly an incorrect final state. The fix is a `useRef` "running" flag the function checks at the top: if running, return early. Today this isn't implemented because the assumption is users single-click; if reincodes were turned into a teaching tool that ran in noisy classroom contexts, the lock becomes load-bearing.

```
At 10× user-action rate (re-clicking Run):
┌─ Algorithm runs ───────┐
│  ⚠ multiple invocations│  ← breaks first
│    share `bars` array  │
│  fix: useRef lock      │
└────────────────────────┘
┌─ Browser perf ─────────┐
│  ✓ fine — ~20fps each  │
└────────────────────────┘
┌─ Animation correctness ┐
│  ✗ visible artefacts    │
│    on double-run       │
└────────────────────────┘
```

### The question candidates always dodge

**Q: Why not `requestAnimationFrame` for the animation? It's the *real* animation API.**

A: For 60fps smooth animation, rAF is the right tool — that's not in dispute. The reason this codebase uses `setTimeout` + Promise is that the goal isn't smoothness; it's *visible discrete steps*. With rAF, "speed" would need to be a frames-per-step counter, the algorithm would need to translate into a per-frame state machine, and the swap would need to interpolate bar positions over multiple frames. The teaching value of the code drops sharply — the algorithm stops being legible. The cost of `setTimeout` is genuine: at very fast `speed` values (1ms) the animation can feel choppy because `setTimeout` has a minimum granularity. But at the speeds humans actually want to watch (50–500ms per step), it's the right shape. If smooth interpolation became a goal, I'd add it as a separate path — keep the `setTimeout` loop for "step through" mode, add an rAF-driven smoothed renderer for "play" mode.

```
┌── setTimeout (picked) ────┐    ┌── requestAnimationFrame ──┐
│  Algorithm reads like the │    │  Algorithm = state machine│
│    algorithm              │    │    + tick                 │
│  20fps discrete steps     │    │  60fps smooth interp      │
│  ~25 LOC per sort         │    │  ~80 LOC per sort         │
│  No interp between swaps  │    │  Interpolate positions    │
│  Teaching shape           │    │  Production-anim shape    │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Algorithm and animation are the same async function."
- "Mutate → set highlights → await → set new array ref. Four moves per step."
- "The await is the *whole point* — without it, React batches and you see only the final state."
- "Pause/resume isn't free with this pattern — but the algorithm shape stays legible."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Draw the four-step loop body. Label what happens at each step (mutate / set highlight / await / set bars). Label what the browser does during the await.

### Level 2 — Explain it out loud

Explain to a colleague: "I removed the `await delayLoop(speed)` line — what does the user see and why?" Under 90 seconds.

Checkpoints:
- Name the file? → `src/app/sorting/bubble-sort/page.tsx` L54+.
- Say what React does with the state updates? → batches them, no paint between mutations.
- Name the tradeoff this pattern accepts? → no built-in pause/resume/cancel.

### Level 3 — Apply it to a new scenario

Without looking: "I want to add a Pause button that freezes the animation mid-sort and a Resume button that picks up where it left off. What changes?"

Write your answer. Then look at `delayLoop.ts` and `bubble-sort/page.tsx` to see what would have to change.

### Level 4 — Defend the decision you'd change

"If you were starting reincodes today, would you use `setTimeout` + `await` or `requestAnimationFrame`? What would that change about the teaching shape of the code?"

### Quick check — code reference test

- Which file holds the 4-line helper?
- Approximately which lines of `bubble-sort/page.tsx` hold the async loop?
- What's the function name?

✓ Pass: `src/utils/delayLoop.ts` (any line); `bubble-sort/page.tsx` ~L54–L76; `bubbleSort`.
