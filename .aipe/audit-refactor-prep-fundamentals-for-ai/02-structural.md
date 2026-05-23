## Chapter 02 — Structural refactors

Structural refactors touch boundaries between units — extract a module, inline a class, invert a dependency, hide a delegate, split pure from effectful, introduce an anti-corruption layer. Larger blast radius than the composition refactors in Chapter 01, smaller than the patterns in Chapter 03. This chapter asks where the codebase's *boundaries* are mis-drawn — not the code inside them.

### Map of the territory

- **Separate Pure from Effectful** — DEEP. Every visualizer page fuses the pure algorithm with the React-effectful animation in one closure. The pattern is already proven in `Tree.preOrderTraversal` (`Tree.ts:39–55`) as a generator. The split-or-don't decision is the central architectural question in this codebase.
- **Inline Module / Class** — BRIEF. `src/utils/data_structures/finding_shortest_path/shortest_path.ts` is entirely commented out. `src/utils/data_structures/DijkstrasAlgorithm.ts` is broken at runtime and has no callers. Both are dead modules shaped like live ones.
- **Invert Dependency** — BRIEF. `DijkstrasAlgorithm.ts:1` imports `Graph2` and `PriorityQueue` as concrete classes. The DI argument is academic because the module is dead.
- **Hide Delegate** — BRIEF. Visualizer pages mutate `bars[r-1]` and `bars[r]` directly (`bubble-sort/page.tsx:58–60`) and then publish with `setBars([...bars])`. The internal mutation is part of the page's algorithm.
- **Extract Module** — BRIEF. If the shell extraction in Chapter 03 lands, the resulting `useAnimationLoop` hook and `<SortingShell>` component earn a small module of their own.
- **Introduce Boundary / Anti-Corruption Layer** — NOT FOUND. No external APIs, no third-party domain models, no translation layer needed. The codebase talks to React and to `d3-force` and to nothing else.

---

### Separate Pure from Effectful — DEEP

**Where it shows up**

The visualizer pages. In every sorting page, the algorithm and the animation share one closure and one mutable array:

- `bubble-sort/page.tsx:54–76` — the swap (`:58–60`) and the setState publish (`:62–66`) live in the same `for` loop body. The algorithm reads and writes `bars` in place; the animation calls `setBars([...bars])` to republish the reference to React; the `await delayLoop(speed)` at `:64` is what makes the swap visible.
- `quick-sort/page.tsx:55–123` — same pattern, recursive. The partition mutates `arr` in place; `setHighlightIndices`/`setScanIndices` interleave with `await delayLoop(speed)` at `:86`, `:103`, `:107`.
- `merge-sort/page.tsx:53–101` — the `divide`/`combine` recursion is pure-ish (it returns the merged buffer), but `combine` calls `updateOriginalArray` (`:92`) which writes back to `bars` with state-updating side effects.
- `heap-sort/page.tsx:62–106` — the cleanest separation by accident. `minheap.insert(v)` (`:84`) runs synchronously without animation; `satisfyHeapAndAnimateInUI` (`:62–79`) is the effectful replay of `minheap.swapSequence`. The pure phase (build heap) and effectful phase (animate the swap sequence) are two function calls back to back.

The pattern is already proven in pure form in one place: `Tree.preOrderTraversal` (`src/utils/data_structures/Tree.ts:39–55`) is a `function*` that `yield`s nodes lazily. The consumer (`Tree.find`, `Tree.insert`, `Tree.remove`) iterates the generator and decides what to do per yielded node. There is no `setState`, no `delayLoop`, no React anywhere in `Tree.ts`. The pure-effectful split exists in this codebase — in exactly one corner.

**Why it's like this**

Reconstructable: bubble-sort was the first visualizer, and the simplest way to make it work was to write the algorithm and the animation as one function. Once that pattern shipped, the next four sorts adopted it because it was the working shape. `Tree.ts` was written later for the n-ary tree visualizer (`recursions/fibonacci-numbers/page.tsx` consumes it), at which point the generator idiom had arrived in the author's vocabulary. The two shapes coexist in the codebase because they were written in different mental modes.

**Take**

This is the structural refactor in this codebase. Every algorithm visualizer is a candidate. The shape is exactly what Chapter 03 already named under Strategy/Iterator: the algorithm becomes `function* bubbleSort(arr): Generator<SortStep>` that yields `{ kind: "swap", i, j }` or `{ kind: "scan", i }` or `{ kind: "highlight", indices }`. The page becomes a consumer that pumps steps into a `setVisualState` while awaiting `delayLoop(speed)` between yields.

The version of the take that's been the most contested across this book: Chapter 03 said do the shell extraction, leave the algorithm in `page.tsx`. Chapter 05 said locality wins; don't split. Both are right, *until* the codebase wants a feature that requires the split. Scrub. Step-back. "Show me the algorithm state at iteration 17." A complexity readout that tracks operations as the algorithm runs. Any of those features is a Separate-Pure-from-Effectful refactor in disguise, because each of them requires the algorithm to surrender control of its own iteration to an external consumer. You can't scrub backwards through a function that mutates state and awaits.

So: not worth doing today. Worth doing the instant a feature demands it. And — the part that's underrated — the *cost* of doing it is much lower than the locality argument makes it sound, because `Tree.ts` already shows the shape. A reader who opens `bubbleSort.ts` and sees `function* bubbleSort(arr)` with `yield { kind: "swap", i, j }` is reading the algorithm at the same depth they'd read the inline version. The indirection cost is the page being two files instead of one, not the algorithm being harder to read.

The heap-sort page is the proof-of-concept already in the tree. `satisfyHeapAndAnimateInUI` (`:62`) is the effectful consumer; `minheap.insert(v)` is the pure producer; `swapSequence` is the step protocol. The page is already separated. The other four sorts could be brought to this shape by retroactively reconstructing what the heap-sort author did from scratch.

**The tradeoff**

The locality argument is real and Chapter 05 made it well: the reader who navigates to `/sorting/bubble-sort` opens one file and sees the whole algorithm. Splitting that into `bubble-sort/page.tsx` (the shell) + `algorithms/bubbleSort.ts` (the generator) costs that first-read locality. The reader has to chase one import to find the algorithm.

The counter-tradeoff is that the *current* shape isn't actually pure-algorithm code in `page.tsx`. The reader who opens `bubble-sort/page.tsx:54–76` to learn bubble-sort is reading bubble-sort tangled with `setHighlightIndices`, `setScanIndices`, `await delayLoop(speed)`, and `setBars([...bars])`. The signal-to-noise for "what does bubble-sort do?" is already lower than it would be in a pure generator. The locality you'd be defending is the locality of *the page*, not of *the algorithm*. Those are different things, and the codebase blurs them.

The breakpoint where the calculus flips: any feature that needs the algorithm to yield control. The instant scrub, step-back, or pause-at-iteration-N becomes a real requirement, the refactor pays back in one feature. Until then, the cost of indirection is real and the benefit is hypothetical, and Chapter 05's "don't pre-pay for features that haven't arrived" call holds.

The deeper tradeoff with `MinHeap.swapSequence`: it's a *workaround* for not having generators. The heap mutates itself synchronously, records the swaps as a side-effect, and the consumer replays them later. That's two passes (build, then animate) where a generator would be one (yield-as-you-go). The `getMinSwapSequence` drift on `MinHeap` (Chapter 01) is the kind of bug that lives in workarounds — record-then-replay APIs sprout fields like that. A generator would never grow that field because the recording layer wouldn't exist.

**What I'd watch for**

The step ADT. This is the trap. A naive `Step` union type for sorting algorithms ends up with 12 variants because every sort wants its own subtle visualization vocabulary — quick-sort wants `highlightRegion` (`quick-sort/page.tsx:52`), bubble-sort doesn't; heap-sort wants `swapSequence` indices, merge-sort wants a write-into-original-array event. Designing the step protocol so all five sorts fit is the actual engineering work in this refactor. Get it wrong and you ship a refactor that's also a feature regression — some animation detail that worked in the inline version stops working after the split.

The way to de-risk this: start with the heap-sort page, which already has the pattern, and write `function* minHeapsort(arr)` against the *existing* `swapSequence` shape (positions of swaps). If that generalizes cleanly, you have a step ADT. If it doesn't generalize because quick-sort needs `highlightRegion` and merge-sort needs `writeBack`, then you know the step protocol is per-algorithm, and the refactor is "each algorithm has its own generator + its own step type + its own renderer mapping" — which is fine but is more files than the locality argument might tolerate.

The other thing to watch: the `useEffect(() => { algorithm() }, [])` pattern (e.g. `bubble-sort/page.tsx:78–82`) is wrong, and the wrongness compounds with a split. The algorithm runs once on mount, mutates state asynchronously, and the closure captured an old `bars`. The fix is wiring Run to an explicit handler that resets state and starts a fresh generator — Chapter 03 flagged this. Do that fix as part of the split, not separately; the split surfaces the bug by making the iteration explicit.

**Verdict**

Worth doing eventually — not now. The day this codebase grows scrub, step-back, or any feature that requires algorithm/animation separation, this refactor pays back in one feature. Until then, locality wins and the inline shape is correct. The one thing worth doing today is writing the step ADT for the heap-sort generator as a thought experiment, so when the day comes, the protocol design isn't a blocker.

---

### Inline Module / Class — BRIEF

Two modules in `src/utils/data_structures/` are dead in different ways. `DijkstrasAlgorithm.ts` (`:1–55`) imports `Graph2` and `PriorityQueue`, but uses `g.num_nodes` (`:6,9,16`) and `edge.to_node` (`:31`) — snake_case fields that don't exist on the camelCase `Graph2.numNodes` (`Graph2.ts:65`) and `Edge.toNode` (`Graph2.ts:8`). The function would throw `undefined` against any real input. It's not exported from `data_structures/index.ts` and no page imports it. `src/utils/data_structures/finding_shortest_path/shortest_path.ts` is one file containing one block comment (`/* ... */`) that wraps an older Dijkstra implementation in its entirety. No exports, no callers.

**Take:** Inline Module here means "this module doesn't earn its existence; collapse it into nothing or into a notes folder." Both files qualify. `DijkstrasAlgorithm.ts` is dead code shaped like an algorithm — the most misleading kind of file, because a reader navigating the codebase looking for the Dijkstra implementation finds it, reads it, and concludes the codebase uses it. It doesn't. The grid and finding-shortest-path pages either use `breadth_first_search` from `Graph2.ts:201` directly or build their own logic; Dijkstra never gets called. The honest move is to delete the file or move it to `src/utils/notes/Graph/` where the rest of the study-notebook code lives. `shortest_path.ts` is the same call — one commented-out function is not a module, it's a `git blame` artifact. Delete the file. **Verdict:** Worth doing. Both files are pure removal — no migration, no API surface to preserve, no callers to update. The benefit is that the codebase stops teaching a reader an algorithm that doesn't run.

---

### Invert Dependency — BRIEF

`DijkstrasAlgorithm.ts:1` imports `Graph2` and `PriorityQueue` as concrete classes. The function takes `g: any` (`:4`) but immediately calls `g.num_nodes` (`:6`), `g.nodes[i].getEdgeList()` (`:30`), so the dependency on `Graph2` is structural even though the type signature is `any`. The visualizer pages have the same shape: `heap-sort/page.tsx:52` does `new MinHeap()` directly, `network/page.tsx:68` does `new Graph(...)`, `finding-shortest-path/page.tsx:86` does `new Graph2(numNodes, true)`. Concrete dependencies everywhere.

**Take:** Invert Dependency pays back when the dependency might be swapped, mocked, or hidden behind a contract. None of those forces exist here. There's no test suite, no second implementation of `MinHeap`, no remote `Graph` service. Adding `GraphLike` and `PriorityQueueLike` interfaces so Dijkstra could accept anything that quacks right would buy nothing — Dijkstra has zero callers. The only place this even *looks* like a real DI question is `DijkstrasAlgorithm.ts`, and that file is dead per the Inline Module take above. **Verdict:** Not worth doing. The codebase is concrete-by-design and the abstractions wouldn't pay back. Chapter 05 already made this call under Dependency Inversion.

---

### Hide Delegate — BRIEF

Visualizer pages reach into the `bars` array directly. `bubble-sort/page.tsx:58–60` writes `bars[r-1] = bars[r]; bars[r] = highval;` — direct index mutation. The same shape repeats in `insertion-sort/page.tsx:59–60`, `merge-sort/page.tsx:143–152`, `quick-sort/page.tsx:58–62` (the `swapHelper`). The page publishes by calling `setBars([...bars])`. A `BarArray` wrapper with `swap(i, j)`, `mark(i, j)`, `scan(i)`, `commit()` could hide the index-level access behind a domain-level API.

**Take:** The internals being reached into are an array of numbers, and the operations being done to it are array operations. Wrapping `arr[i] = arr[j]; arr[j] = temp;` in `bars.swap(i, j)` is not hiding a delegate — it's renaming an idiom. The `BarArray` would be a one-method-deep proxy whose only contribution is a method name. The cost is real: every algorithm now reads through a wrapper instead of operating on the underlying array, and the reader who comes to learn bubble-sort gets `bars.swap(i, j)` instead of the classic three-line swap. That's a regression for a teaching artifact. **Verdict:** Not worth doing. The array-level access is at the right level of abstraction for what the visualizer is teaching.

---

### Extract Module — BRIEF

`src/utils/data_structures/` is the codebase's one substantial utility module and it's fine — it groups heap, graph, tree, BST, PQ in one place under a clear name, and the index file re-exports them. No Extract Module candidates at the data-structure level. The candidate that *does* exist sits at a different layer: if the shell extraction from Chapter 03 lands, the resulting `<SortingShell>` component and its `useAnimationLoop` hook (or whatever shape the animation orchestration takes) need a home. Putting them in `src/components/` next to `ArrayVisualizer` is one option; making `src/components/sorting/` for the shell + helpers is another; making `src/hooks/` for the animation hook is a third.

**Take:** Don't pre-create modules. The right pattern is to do the shell extraction first, see what ends up in it, and pick a folder when there are at least two files that want to live next to each other. If `<SortingShell>` is one file and `useAnimationLoop` is one file and they only get imported by sorting pages, `src/components/sorting/` is the right home. If the hook generalizes beyond sorting (it probably does — the same shape would help the graph and tree visualizers), then `src/hooks/` earns its place. The Extract Module decision is downstream of the shell extraction; don't make it ahead of time. **Verdict:** Worth doing as a follow-on to the Chapter 03 shell extraction, not as an independent refactor. Don't create empty folders.

---

### Chapter close

The structural shape of this codebase is one boundary that's drawn wrong and a lot of boundaries that are drawn right. The wrong one is the page-level fusion of algorithm and animation, and the verdict — at the staff-engineer level — is that it's wrong on paper and correct in practice, because the feature surface that would justify splitting them hasn't arrived. The right boundaries are everywhere else: `data_structures/` is a clean module, `components/` separates visualizers from primitives, the home-page composition stays in `components/Home/`, and there are no anti-patterns like a god-object service file or a cross-cutting `utils` dumping ground. The two structural problems that *do* exist — the dead Dijkstra file and the dead `shortest_path.ts` — are housekeeping, not boundary problems. The codebase's structural integrity is good; what's wrong with it is content (dead code shaped like live code, a `Graph2` name that reads like a version) and one deferred refactor that's waiting on a feature that hasn't shipped. That's a healthy structural posture for a codebase this size.
