## Chapter 01 — Composition refactors

Composition refactors are the small, named, behaviour-preserving operations — Extract Function, Rename, Move, Parameterize, Split Phase, Inline, the rest of the Fowler catalog. They're the smallest unit of restructuring in the vocabulary, and the highest-frequency category. In a codebase this size, this is where most of the actual refactoring lives.

### Map of the territory

- **Parameterize Function** — DEEP. `MinHeap` and `MaxHeap` in `BinaryHeap.ts:23–243` are line-for-line parallel, differing only in comparator direction. They have already drifted (`getMinSwapSequence` on `MinHeap`, not on `MaxHeap`).
- **Extract Function** — DEEP. Every sorting page inlines the algorithm + animation loop in the page closure. The shape repeats five times with small per-algorithm variation.
- **Rename** — BRIEF. `Graph2.ts` next to `Graph.ts`. The `2` reads like a version number; the comments at the top of each file (`"this version is from IK"` / `"this version is from Book"`) say it's not.
- **Move Function** — BRIEF. `breadth_first_search` (`Graph2.ts:201–225`) and `getRandomEdgeWeight` (`Graph2.ts:255–261`) are free functions exported alongside the `Graph2` class.
- **Split Phase** — BRIEF. The sorting pages do "reset → start algorithm" inside a single `useEffect`. Tiny payoff.
- **Replace Conditional with Polymorphism / Dispatch Table** — BRIEF. `PriorityQueue._elementsInverted` (`PriorityQueue.ts:75–94`) switches on `isMinHeap`. Two cases, one boolean.
- **Replace Magic Number with Named Constant** — MENTION. `merge-sort/page.tsx:154` hardcodes `delayLoop(100)`. Not a magic-number question — it's a bug.
- **Remove Dead Parameter / Dead Field** — MENTION. `MinHeap.getMinSwapSequence` (`BinaryHeap.ts:27`) is pushed to but never read.
- **Inline Function / Inline Variable** — NOT FOUND. No useless one-line wrappers, no indirection that needs collapsing.
- **Decompose Conditional** — NOT FOUND. No complex if/else needing extraction. The conditionals in this codebase are tight by default.
- **Extract Variable** — NOT FOUND at any interesting scale. The algorithm code is already line-by-line; intermediate values already have names.

---

### Parameterize Function — DEEP

**Where it shows up**

`src/utils/data_structures/BinaryHeap.ts:23–133` (`MinHeap`) and `:136–243` (`MaxHeap`). The two classes are parallel:

- Same fields (`heap`, `prevHeap`, `swapSequence`). `MinHeap` carries an extra `getMinSwapSequence: number[][]` at `:27` that `MaxHeap` does not have at `:139`.
- Same `heapifyUp` shape — the only line that differs is the comparator: `this.heap[child] < this.heap[parent]` at `:56` vs `this.heap[child] > this.heap[parent]` at `:167`.
- Same `heapifyDown` shape — comparators flipped at `:98`/`:102` vs `:209`/`:213`, and the field pushed to is `swapSequence` in MaxHeap but `getMinSwapSequence` in MinHeap (`:104`).
- Same `insert` (`:70–74`, `:181–185`). Same `getMin`/`getMax` (`:120–132`, `:231–242`) — the only meaningful difference is the method name.

About 100 lines of duplicated code across two files. The shape Parameterize Function is asking for is one class `BinaryHeap<T>(compare: (a, b) => number)` with the comparator passed in at construction — `new BinaryHeap(arr, (a, b) => a - b)` for min, `(a, b) => b - a` for max. The two classes collapse to ~60 lines.

Two pages consume them: `heap-sort/page.tsx:52` constructs a `MinHeap`; `trees/binary-heap/page.tsx:21` constructs both. Both pages read `swapSequence` (`heap-sort/page.tsx:86`, `binary-heap/page.tsx:114,128`) and `prevHeap` (`binary-heap/page.tsx:107,114,122,128`). The `swapSequence` field is the visualization replay buffer — every animation depends on it.

**Why it's like this**

Reconstructable: the codebase wrote `MinHeap` first as a self-contained class, then needed a max-heap for the binary-heap visualizer, then copy-pasted the file and flipped the comparators. The `getMinSwapSequence` field on `MinHeap` looks like an in-flight experiment to record a *second* swap sequence (probably for the `getMin`/`heapifyDown` half of the animation) that never made it to `MaxHeap` — the drift happened mid-thought.

**Take**

This is the cleanest DRY refactor in the codebase. The two classes encode one algorithm parameterized on one operator, the drift is non-hypothetical (`getMinSwapSequence` already exists in only one of them), and the call sites are two pages. The `heap-sort` page only uses `MinHeap`; the `binary-heap` page uses both with identical method shapes. There's no API surface to preserve that a parameterized class can't satisfy.

The right shape is `class BinaryHeap<T>` with `constructor(initData: T[] = [], compare: (a: T, b: T) => number = defaultCompare)`. `insert` stays. The `getMin`/`getMax` distinction collapses into one `extract()` method. The drifted `getMinSwapSequence` field gets a decision — either delete it (it's never read; this is the right call), or unify it with `swapSequence` as a single "swaps since last operation" buffer. Either way, you don't ship two of them.

The piece that's tempting and wrong: don't try to make `BinaryHeap` and `PriorityQueue` (`PriorityQueue.ts:34`) share a base class as part of this refactor. `PriorityQueue` is a different beast — it wraps the heap with a `valueIndicesLookup` dictionary (`:38`) for O(log n) `updatePriority`, it indexes from 1 instead of 0, and its API is `enqueue`/`dequeue` over `HeapItem` records instead of raw values. The two structures are siblings, not parent/child. Touching `PriorityQueue` is a separate refactor in a separate spec.

**The tradeoff**

The duplication-as-pedagogy argument has real weight in this codebase. The reader who opens `BinaryHeap.ts` to read about min-heaps gets `MinHeap` in self-contained form — comparator inline, method name on the class, no generics, no callback passing. Parameterizing it costs that legibility. A reader who wants to know "how does a min-heap differ from a max-heap?" can now diff two classes side by side. After the refactor, they have to read the call site to find out which heap they're looking at.

Counter-argument: that legibility is fictional in this codebase, because the two classes have already drifted. `MinHeap` has `getMinSwapSequence`; `MaxHeap` doesn't. Reading them side by side teaches the reader a difference that *isn't* about min-vs-max — it's about which file the author touched more recently. The "two classes teach two variants" story is only true if the two classes stay parallel, and they don't.

The deeper tradeoff: this is the one refactor in the codebase where DRY is unambiguously the right call. Locality of Behaviour (Chapter 05's verdict on the sorting pages) doesn't apply here because `BinaryHeap.ts` isn't a teaching artifact at the page level — nobody navigates to `BinaryHeap.ts` to learn about heaps. The teaching artifact is `trees/binary-heap/page.tsx`. The data structure file is infrastructure that two pages import.

**What I'd watch for**

The `swapSequence` field is consumed *after* the algorithm runs — the `binary-heap` page reads `minheap.swapSequence` (`:114`) and replays it. That's a real coupling between the heap's internal state and the visualizer's animation. Any refactor that touches the comparator parameterization will be tempted to also clean up `swapSequence` ("record steps as you go, not retroactively"). Don't fold them together. The Parameterize refactor is "two classes become one with a comparator"; the swap-sequence rework is the generator-pattern refactor that Chapter 03's Iterator section is asking for. Two specs, two sessions.

The other trap: the test surface is zero. There are no unit tests for `MinHeap` or `MaxHeap`. The verification is "the heap-sort page still animates correctly, and the binary-heap page still renders the swap replay." That's a manual smoke test, and a manual smoke test on a refactor that touches the comparator is exactly the kind of thing that ships a regression. If you do this refactor, write the heap tests first — a `MinHeap` insert-then-extract round-trip, a `MaxHeap` same — and only then collapse the classes. The tests are 30 lines; the refactor is 100. The ratio is fine.

**Verdict**

Worth doing. This is the cleanest single-refactor win in the codebase — real duplication, real drift, two callers that don't depend on the class identity. Write the tests first, then collapse.

---

### Extract Function — DEEP

**Where it shows up**

The animation loop inside every sorting page. The shape repeats:

- `bubble-sort/page.tsx:54–76` — algorithm body that calls `setHighlightIndices`, `setScanIndices`, `setBars([...bars])`, `await delayLoop(speed)` between iterations.
- `insertion-sort/page.tsx:53–74` — same shape, different algorithm. The setters cluster around `await delayLoop(speed)` at `:64`.
- `quick-sort/page.tsx:64–123` — recursive `divide_and_combine` with the same setter+delayLoop pattern at `:86`, `:103`, `:107`. Adds a fourth setter (`setHighlightRegion`) but the structure is the same.
- `merge-sort/page.tsx:53–101` — recursive `divide`/`combine`, plus a separate `updateOriginalArray` helper at `:112–156` that walks the merged buffer with `setScanIndices` + `setBars` + `await delayLoop(100)`. The `100` is hardcoded — this page ignores `speed`.
- `heap-sort/page.tsx:62–106` — the outlier. `satisfyHeapAndAnimateInUI` (`:62–79`) is structurally an extracted animation function — it takes a `swapSequence` and a `data` array, and replays the swaps with `setHighlightIndices` + `await delayLoop(defaultSpeed)`. Uses `defaultSpeed` at `:64`, `:71`, `:101` instead of the user's `speed` state — same class of bug as merge-sort.

The pattern repeats five times: mutate state, publish, wait. The candidate for extraction is the "publish + wait" pair — `setBars([...bars]); await delayLoop(speed);` — or, more ambitiously, the whole "step the algorithm" loop wrapped as `useAnimationLoop(speed)` or `applyStep(step)`.

**Why it's like this**

Each page was written one at a time, and each time the question "where does the animation cadence live?" was answered locally. Bubble was first; bubble's cadence is "one delay per swap." Quick-sort wanted two distinguishable moments per inner iteration so it got two `delayLoop` calls. Merge-sort wrote a separate helper because the merge step writes back to a buffer, and the helper picked up a hardcoded `100` somewhere during debugging that never got cleaned up. Heap-sort committed to a different architecture entirely (build heap synchronously, replay the swap sequence) and ended up with the cleanest separation by accident.

**Take**

Extract Function applies, but the smallest version of it — extract the `setBars; delayLoop` pair into one helper — saves nothing. Two lines become a one-line call. That's not the refactor that pays back.

The version that pays back is bigger: extract the whole animation orchestration into a `useAnimationLoop` hook (or a `step()` helper that takes a `{ bars, highlight, scan }` object and handles publish-then-wait). The page calls `step(...)` once per algorithmic decision point. The hardcoded `delayLoop(100)` in merge-sort goes away because there's only one source of cadence. The `defaultSpeed` in heap-sort goes away for the same reason. The five pages stop having five subtly different animation contracts.

But that's not Extract Function anymore — it's the shell extraction that Chapter 03 already opined on, and the verdict there was "do the shell extraction, leave the algorithm in `page.tsx`." This refactor is a consequence of that one, not an independent Extract Function call. If the shell exists, the animation loop lives in the shell, and the pages stop repeating it. If the shell doesn't exist, then no smaller Extract Function call earns its place — every candidate I can name either (a) extracts two lines for no win or (b) is actually the shell refactor with a different name.

The honest call: Extract Function as a standalone refactor doesn't apply here. The Extract Function candidates that exist are all artifacts of the larger shell extraction. Spec the shell, fold the animation loop into it, and the per-page duplications go away as a side effect.

There's one place where Extract Function in the strict sense earns its keep, and it's `merge-sort/page.tsx:112–156` — the `updateOriginalArray` helper. It's already extracted. The take here is that it's *correctly* extracted (a real concern: walking the merged buffer back into the original array, with its own scan animation), and the only thing wrong with it is the `delayLoop(100)` hardcode on `:154` and the `setBars(prevBars => { ... })` functional update at `:143–152` that hides what the function is doing under a closure. Rename the function, fix the `100` to `speed`, and the helper is fine. Don't try to fold it back into the merge body.

**The tradeoff**

If you spec a small Extract Function for the publish+wait pair — `await applyStep(setBars, bars, speed)` or similar — you save two lines per call site and you introduce a wrapper that does very little. The reader who opens `bubble-sort/page.tsx:64` and sees `await applyStep(...)` has to chase a second file to find out what it does. For two lines, the indirection costs more than it saves. The reader's mental model is fine with `setBars([...bars]); await delayLoop(speed);` inline — both halves are React idioms.

If you spec the larger version (the shell + hook), you save ~30 lines of state plumbing per page across five pages (so ~150 lines net), and you get a single source of truth for animation cadence. That's the right refactor, but it's not Extract Function — it's the shell extraction from Chapter 03 with Extract Function as a side effect.

The breakpoint where small Extract Function would earn its place is "is there a five-line block that needs a comment to explain what it does?" Right now there isn't. The animation loops are tight enough that the function-name-replaces-the-comment argument doesn't trigger.

**What I'd watch for**

The trap on the small version: a `step({ bars, highlight, scan })` helper that batches the three setters into one render. That's seductive because it removes the "is this two renders or one?" ambiguity Chapter 04 mentioned, but it changes behaviour — the current shape lets each page mutate only the state it needs (quick-sort's accumulating `setHighlightIndices(prev => [...prev, small])` at `:102` is the obvious case), and a full-state-per-step helper forces every page to think in terms of complete visual state. That's a real coupling change, not a behaviour-preserving Extract Function. Spec it as a separate refactor and call it what it is.

The trap on the bigger version: it's two refactors stacked. The shell extraction is in Chapter 03. Don't smuggle the animation-loop extraction in under "Extract Function" — name it as part of the shell spec, or as a follow-on spec to the shell spec. One refactor, one spec.

**Verdict**

Worth doing as part of the shell extraction in Chapter 03 — not as a standalone Extract Function. The small Extract Function calls don't pay back at this scale; the big one is a different refactor wearing this one's name.

---

### Rename — BRIEF

`src/utils/data_structures/Graph2.ts` next to `src/utils/data_structures/Graph.ts`. The `2` reads like a version number ("Graph v2, replaces Graph v1"), which is what the new reader will assume. The reality, per the comments at `Graph.ts:7` and `Graph2.ts:6`, is that the two files come from two different study sources — one from "IK," one from "Book" — and they're two parallel implementations with different APIs. `Graph2.ts` is used by everything except `network/page.tsx` (verified: `grid/page.tsx:4`, `finding-shortest-path/page.tsx:4` import `Graph2`; `network/page.tsx:14` imports `Graph`). The migration is half-done by design, not by accident — but the name `Graph2` reads as if the migration is mid-progress.

**Take:** Rename is the right refactor here, and the cheap one. The new name should say what makes `Graph2` different — `AdjacencyListGraph`, or `NodeBasedGraph`, or even `Graph` with the older one renamed to `EdgeListGraph`. The constraint is that anything imported by three pages and the index has to be updated atomically, which is one find-and-replace pass in TS. The harder question is whether to do the Rename or to finish the migration (move `network/page.tsx` onto `Graph2`, delete `Graph.ts`). Chapter 05's DRY section covered the migration question; this is the lighter version that ships value either way. **Verdict:** Worth doing. Rename to something descriptive even if the migration never finishes — the `2` suffix is the cheapest readability tax in the codebase, and removing it is one PR.

---

### Move Function — BRIEF

`breadth_first_search` (`Graph2.ts:201–225`) is a free function exported from the same file as the `Graph2` class. It takes `g: any` and a start node, doesn't call any class methods other than `g.nodes[...].getEdgeList()`, and returns a `parent` array. `getRandomEdgeWeight` (`Graph2.ts:255–261`) is also a free function, used by `finding-shortest-path/page.tsx:95,98`. Both functions live in `Graph2.ts` for historical reasons — the file was the catch-all for graph-related code as the visualizer grew.

**Take:** `getRandomEdgeWeight` doesn't belong in `Graph2.ts` at all — it's a `Math.random()` wrapper that has nothing to do with graphs. Move it to `src/utils/generateRandomNumber.ts` or alongside it. `breadth_first_search` is a closer call — it's tightly tied to the `Graph2` shape (it reads `g.numNodes` and `g.nodes[i].getEdgeList()`), and moving it to its own file means the BFS algorithm lives one import away from the data structure it depends on. The honest call is to leave BFS in `Graph2.ts` (it's clearly graph-related) and move `getRandomEdgeWeight` out. **Verdict:** Worth doing for `getRandomEdgeWeight`. Not worth doing for `breadth_first_search` — the colocation argument applies; the function lives next to the data structure it operates on, which is correct.

---

### Split Phase — BRIEF

`bubble-sort/page.tsx:29–33` (and every other sorting page) has a `useEffect` that runs `reset()` on `[inputSize, speed]` changes. `reset()` itself (`:24–27`) does two things in sequence: clear `bars` to `[]`, then set `bars` to a freshly generated random array. The pattern is "drop the visual to empty, then repopulate." It's two phases, sort of.

**Take:** Split Phase is the catalog name for separating a function that does two distinct things — validate-then-persist, parse-then-transform. `reset()` here is two `setBars` calls back to back, and the only reason it's two calls instead of one is to force a render-to-empty before the new array (a visual reset trick, not an algorithm split). Calling this Split Phase is technically right and operationally useless — there's nothing to test independently. **Verdict:** Not worth doing. The two `setBars` calls are a visual idiom, not a phase boundary.

---

### Replace Conditional with Polymorphism / Dispatch Table — BRIEF

`PriorityQueue._elementsInverted` (`PriorityQueue.ts:75–94`) switches on `this.isMinHeap`:

```
if (this.isMinHeap) {
  return this.heapArray[parent].gt(this.heapArray[child]);
} else {
  return this.heapArray[parent].lt(this.heapArray[child]);
}
```

The same boolean switch appears in `updatePriority` (`:215–227`) to decide whether to propagate up or down based on the priority direction.

**Take:** Two cases on a boolean is not the smell this refactor was named for. Replace Conditional with Polymorphism earns its place when the conditional has four-plus arms or when new cases land regularly. Two cases of a stable boolean (min-heap or max-heap; the PQ supports both at construction time and the choice is fixed for the life of the instance) is the right shape for an `if`. A dispatch table here would replace one boolean with one function-typed field that's set in the constructor — same information, more indirection. **Verdict:** Not worth doing. The boolean is honest about what's happening. Leave it.

---

### MENTION

- **`merge-sort/page.tsx:154`** hardcodes `delayLoop(100)` instead of `delayLoop(speed)`. The page imports `speed` from state but ignores it for the `updateOriginalArray` walk. Behavioural bug, not a Replace Magic Number refactor — fix it as `delayLoop(speed)`.
- **`heap-sort/page.tsx:64`, `:71`, `:101`** uses `defaultSpeed` (the import constant) instead of `speed` (the user-controlled state). Same class of bug. The user picks "slow" and heap-sort runs at the default.
- **`MinHeap.getMinSwapSequence`** (`BinaryHeap.ts:27`) is declared on the class, pushed to in `heapifyDown` at `:104`, and never read by anything. Dead field — delete it.
- **`BinarySearchTree.insert_iterative`** (`BinarySearchTree.ts:73–104`) references `BinaryTreeNode` (`:76`, `:91`, `:93`), which isn't imported and isn't defined in this file. The method is dead code and would crash if called. Delete or implement.
- **`BinarySearchTree.preOrder_iterative`** (`BinarySearchTree.ts:413`) and **`postOrder_iterative`** (`:490`) push to a stack and read `node.value`, but the field is `node.key` (see `BSTNode` at `:3–13`). Dead and buggy. Delete or fix.
- **`DijkstrasAlgorithm.ts:6,9,16`** uses `g.num_nodes` (snake_case) against `Graph2`'s `numNodes` (camelCase, declared at `Graph2.ts:65`). `:31` uses `edge.to_node` against `Edge.toNode` (`Graph2.ts:8`). The file is dead code; either fix the field names or delete the file. See Chapter 02 — Inline Module for the larger framing.

---

### Chapter close

reincodes has one composition refactor worth specifying on its own (Parameterize Function on the heaps) and one composition refactor that turns out to be a structural refactor in disguise (the sorting-page animation loop, which is the shell extraction from Chapter 03). The rest is either MENTION-level cleanup — magic numbers, dead fields, a `2` suffix that reads like a version number — or NOT FOUND because the codebase doesn't have the smell that refactor was named for. What that pattern suggests is that the codebase is well-composed at the function-and-variable level. The local code is tight; intermediate values have names; conditionals are short; there's almost no pointless indirection to inline. The composition-level work is light because the composition was done carefully the first time. The pressure that does exist sits one level up — at the boundary between the heap classes (DRY drift), and at the boundary between the page and the algorithm (the shell extraction). Both of those are in Chapter 02. This chapter is honest about being short; the cleanups it names are the cleanups the codebase actually has, and the absence of bigger ones is a signal, not an oversight.
