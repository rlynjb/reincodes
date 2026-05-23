## Chapter 04 — DSA refactors

The narrowest category in the catalog. Worth applying only to hot paths or to code over data that's grown. reincodes is a DSA visualizer where the algorithms are intentionally slow — `delayLoop(speed)` is the feature, not a cost to remove. Most DSA refactors don't apply, and the ones that do apply in places that aren't load-bearing.

### Map of the territory

- **Change Data Structure** — BRIEF. `Graph.ts` exposes both `displayAdjacencyList` (default) and `displayAdjacencyMatrix` (opt-in). `Graph2.ts` ships a node-object adjacency list. The migration off `Graph.ts` is partial — `network/page.tsx` is the only remaining caller.
- **Replace Quadratic with Linear** — BRIEF. `PriorityQueue.valueIndicesLookup` already does this for `updatePriority`; it's the codebase's success story here.
- **Collapse Traversals** — BRIEF. `MinHeap.getMin` (L120–L132) does an O(n) `prevHeap.filter()` next to an O(log n) heap operation. Same in `MaxHeap.getMax`. Textbook example, not load-bearing.
- **Memoize at a Stable Boundary** — MENTION. Fibonacci ships iterative; subsets/n-choose-k visualize at small n. Nothing earns a memo.
- **Lazy Evaluation** — BRIEF. The Iterator chapter already covers this. `Tree.preOrderTraversal` is lazy; `Graph.bfs_traversal` is not. The refactor is the same one.
- **Batch / Debounce / Throttle** — DEEP. `delayLoop` *is* a throttle, by design. The interesting question is whether the per-step `setState` calls should batch within a single algorithmic step.
- **Replace Recursion with Iteration** — NOT FOUND. V8 stack handles visualizer-scale depth (n ≤ 200) with margin. The iterative variants that exist in `BinarySearchTree.ts` are study-notebook artifacts, not perf refactors.

---

### Batch / Debounce / Throttle — DEEP

**Where it shows up**

`src/utils/delayLoop.ts` is one line: `setTimeout(resolve, delay)` wrapped in a Promise. Every visualizer page interleaves `setBars(...)`, `setHighlightIndices(...)`, `setScanIndices(...)`, and `await delayLoop(speed)` to make each algorithm step observable.

Look at `quick-sort/page.tsx:97–108`:

```
for (let big = start+1; big <= end; big++) {
  if (arr[big] < arr[start]) {
    small++;
    swapHelper(arr, big, small);
    setHighlightIndices(prevIndices => [...prevIndices, small]);
    await delayLoop(speed);
  }
  setScanIndices(big);
  await delayLoop(speed);
}
```

Each iteration has two `await delayLoop(speed)` calls — one for the swap, one for the scan-pointer move. That's two renders per loop iteration. The bubble-sort and selection-sort pages have one per iteration. `merge-sort/page.tsx:138–155` mixes things further: it calls `setScanIndices`, then a functional `setBars`, then `await delayLoop(100)` (hardcoded, ignoring the user's speed selection).

The heap-sort page is the outlier in the opposite direction (`heap-sort/page.tsx:82–106`): it builds the entire heap synchronously without animating intermediate swaps, then replays `minheap.swapSequence` against the original `bars` array via `satisfyHeapAndAnimateInUI`. That's batching the build phase and animating the replay separately.

**Why it's like this**

The visualizer was built by hand-tuning each algorithm's "what does the user see at each step" question separately. Quick-sort wanted two distinguishable moments per inner-loop iteration (the swap and the scan move) so it got two `delayLoop` calls. Bubble-sort wanted one moment per swap so it got one. Merge-sort needed a separate `updateOriginalArray` helper because the merge step writes back to a buffer and that's not naturally one-render-per-comparison. Each choice was locally correct.

**Take**

The throttle pattern is correct in spirit and the implementation is fine for what it is, but the lack of a step contract makes the code do work it doesn't need to. Three places this matters:

First, `setHighlightIndices` followed by `setScanIndices` followed by `setBars` inside one logical step *should* batch into one render. React 18+ does batch across awaits in *event handlers* but not consistently across awaits in plain async functions started from `useEffect`. The current shape is "render twice between delays" in some cases and "render once" in others, and the difference is invisible to the reader. Wrap the three setters in a single state object — `setVisualState({ bars, highlightIndices, scanIndices })` — and you batch by construction.

Second, the merge-sort `updateOriginalArray` hardcodes `delayLoop(100)` (L154) instead of using `speed`. That's not a perf refactor; it's a bug that hides behind the throttle. Worth fixing as a `Rename`/`Inline Variable` cleanup at the same time as anything else in this file.

Third, the heap-sort page's "batch the build, animate the replay" pattern is *better* than what the other sorts do. It separates the algorithm from the animation, and the animation step rate is independent of the algorithmic step count. If you ever wanted heap-sort to feel like the other five, the right move is to make the other five look like heap-sort — generator yields steps, the animation loop renders one step per `delayLoop`. That's the same refactor as the Strategy/Iterator extraction in Chapter 03.

**The tradeoff**

Batching `setHighlightIndices` + `setScanIndices` + `setBars` into one state object removes the "is this two renders or one?" ambiguity, but it forces every visualizer to think in terms of full-state-per-step instead of incremental mutation. The current shape lets you call only the setters that changed; the batched shape requires you to specify the full visualization state at every step, even if only one field moved. For an algorithm with a clean step ADT (bubble, selection), that's a clear win. For an algorithm where the step is naturally "highlight one more index, leave the rest alone" (quick-sort's `setHighlightIndices(prev => [...prev, small])` accumulating pattern), it's a small regression in expressiveness.

The deeper tradeoff: any consolidation of the per-step setters into one object is the *same* refactor as building a `SortStep` ADT for the Strategy/Iterator extraction. They land in the same place from two different directions. If you do one, the other becomes trivial; if you don't, both are still pending.

**What I'd watch for**

The `delayLoop(100)` hardcode in merge-sort isn't unique — `heap-sort/page.tsx` uses `defaultSpeed` (L64, L71, L101) instead of the user-controlled `speed` state. Two pages ignore the speed selector. A user who picks "slow" and runs merge-sort will see merge-sort at 100ms regardless. This is a behavioural bug masquerading as a throttle inconsistency. Don't fix it as part of a perf refactor; spec it separately as "wire `speed` through merge-sort and heap-sort."

The other thing to watch: any refactor that touches `delayLoop` cadence will be tempted to also "fix" the algorithm to be faster (collapse two `delayLoop`s into one, batch a buffer update). That's a behavioural change disguised as a refactor. The animation cadence is part of the user-visible behaviour. Keep it identical or spec the change.

**Verdict**

Worth doing as a state-batching refactor (one `setVisualState` per algorithmic step), bundled with the Strategy/Iterator extraction. Not worth doing as a `delayLoop` rework — the throttle itself is fine.

---

### Change Data Structure — BRIEF

`src/utils/data_structures/Graph.ts` is the older graph (`displayAdjacencyList` is the default constructor path at L59; `displayAdjacencyMatrix` at L311 is a method that's not called by any consumer in the repo). `src/utils/data_structures/Graph2.ts` is the newer graph (node-object adjacency list with rich `Node2` methods like `getEdgeList`, `addEdge`, `removeEdge`). `Graph` is imported by exactly one page — `graphs/network/page.tsx:14` — and `Graph2` is imported by everything else (grid, finding-shortest-path, river-crossing-puzzle). The `data_structures/index.ts` comment "used in Network" (L3) confirms the migration is half-done by design, not by accident.

**Take:** The migration is one page away from done. `network/page.tsx` doesn't depend on anything `Graph` has that `Graph2` doesn't — it builds an edge list, asks for connectivity info, renders. The reason it hasn't migrated is that `Graph.ts` carries seven half-finished methods (`hasEulerianCycle`, `hasEulerianPath`, `numberOfConnectedComponents`, `isGraphValidTree`, `search`, `check_if_eulerian_cycle_exists`) that read like a study notebook — they're the *content* of `Graph.ts`, more than its API surface is. Migrating to `Graph2` would delete that content. **Verdict:** Not worth migrating until you've decided what to do with the study-notebook content in `Graph.ts`. The data-structure choice (adjacency list vs matrix) isn't the actual question; the question is "does the codebase want to keep these reference methods?" If yes, leave `Graph.ts` for the one page that needs it. If no, move the reference methods into `src/utils/notes/Graph/` (the existing notes folder) and migrate `network` to `Graph2`. Either way, this is a content decision masquerading as a DSA refactor.

---

### Collapse Traversals — BRIEF

`MinHeap.getMin` (`BinaryHeap.ts:120–132`) does `this.prevHeap.filter(item => item !== removedNode)` on every removal — an O(n) pass over `prevHeap` next to the O(log n) `heapifyDown`. The same shape exists in `MaxHeap.getMax` (L231–L242). `prevHeap` itself is only used by `heap-sort/page.tsx` indirectly — the page reads `minheap.swapSequence`, not `prevHeap` — so the field exists for a reason that isn't visible at the page-of-use.

**Take:** This is a textbook Collapse Traversal — the filter is doing work nobody consumes. The visualizer caps `inputSize` at ~50 so the O(n) per removal × n removals = O(n²) cost is bounded at ~2500 operations, which is invisible at human time scales. The cost of the refactor is zero (delete two lines) but the *benefit* is also zero, because nothing in the codebase is bottlenecked here. **Verdict:** Worth doing only as part of a larger `BinaryHeap.ts` cleanup. The field is dead-code shaped — `prevHeap` is initialized in the constructor (L31, L142), pushed to on every insert (L72, L183), and filtered on every removal (L127, L238), and nothing reads it. Removing the field, the pushes, and the filter is one diff. Don't dress it up as a perf refactor; it's a `Remove Dead Field` cleanup.

---

### Replace Quadratic with Linear — BRIEF

`PriorityQueue.valueIndicesLookup` (`PriorityQueue.ts:38`, populated at L112–L113, L176, L197–L198) is a dictionary from value to heap-array index. `updatePriority` (L207–L228) uses it to find the heap position in O(1) before deciding whether to propagate up or down, making the whole operation O(log n). Without it, the implementation would scan the heap array for the value (O(n)) and Dijkstra would degrade from O((V+E) log V) to O(V²).

**Take:** This is the codebase's one DSA refactor that already happened, and it's the right one. The data structure earns its memory cost: a `{ [value]: index }` dict that doubles the queue's memory in exchange for the asymptotic improvement on `updatePriority`, which is the operation Dijkstra leans on. The thing to watch is that the dict is kept in sync in three places (enqueue at L176, dequeue at L197–L198, swap at L112–L113) and the next refactor that touches the heap is the one that breaks it. **Verdict:** Already done. Flag for the inverse refactor — don't let anyone remove the lookup as "unused state" without understanding why it exists. A short comment on the field declaration ("required for O(log n) updatePriority; Dijkstra depends on this") would prevent a future regression.

---

### Lazy Evaluation — BRIEF

`Tree.preOrderTraversal` and `Tree.postOrderTraversal` are generators (lazy by construction). `Graph.bfs_traversal` (L160–L224) and `Graph2.breadth_first_search` (L201–L225) build full `result` / `parent` arrays before returning. `BinarySearchTree.preOrder` / `inOrder` / `postOrder` (L390–L478) build full arrays before returning.

**Take:** Same refactor as the Iterator section of Chapter 03 — spreading the generator pattern from `Tree.ts` to the other traversals. **Verdict:** See Chapter 03's Iterator section for the full take. The DSA framing ("avoid materializing arrays we'll never fully iterate") is the same refactor as the design-pattern framing ("yield steps so the consumer controls iteration"), just spelled differently.

---

### MENTION

- **`subsets(n)`** — `2ⁿ` work is unavoidable if you actually need every subset. The visualizer caps n ≤ 20 so even the worst case is ~1M subsets, fine at browser speed. If you ever raise the cap, switch to a generator (same pattern as `Tree.preOrderTraversal`) so subsets stream one at a time instead of materializing.
- **`fib_naive` memoization** — the page already ships the iterative form (O(n), O(1) space). Memoization isn't needed; the naive recursive form isn't wired to the visualizer. Don't add memo speculatively.
- **`BinarySearchTree.preOrder_iterative` / `postOrder_iterative`** (L413–L433, L490–L505) — both push to `stack` and read `node.value`, but the actual field is `node.key`. These methods are dead code (no callers) and almost certainly buggy. Either delete them or fix them; don't leave them as misleading study artifacts. Same applies to `BinarySearchTree.insert_iterative` (L73–L104), which references `BinaryTreeNode` — a class that doesn't exist in this file.
- **`DijkstrasAlgorithm.ts:31`** — `edge.to_node` is snake_case, but `Edge` in `Graph2.ts:7–19` declares the field as `toNode`. The whole file is dead code (no imports, no exports beyond the unexported function). Either wire it up or delete it.

---

### Chapter close

The honest read: reincodes doesn't need DSA refactors. The one refactor it already did (the PQ's value-index lookup) is the one that mattered, and the rest of the catalog applies in places that don't matter because the data doesn't grow — `inputSize ≤ 200` is the contract, and at that scale the difference between O(n) and O(log n) is "a millisecond nobody can see." The interesting takes in this chapter aren't perf takes; they're "this is dead code shaped like a perf concern" (the `prevHeap` filter, the snake_case Dijkstra, the broken iterative BST traversals) or "this is a refactor that lives in another chapter" (lazy evaluation, batching). The codebase's actual DSA failure mode isn't slow code — it's *misleading* code: methods named like reference implementations that don't work, fields maintained for no consumer, two graph classes where one would do. A `Remove Dead Code` pass against `data_structures/` would do more for this codebase than any perf refactor in the catalog. Spec that as `Inline Module` (collapse `Graph` into `Graph2` + a notes folder) and `Remove Dead Field` (kill `prevHeap`), not as DSA. The DSA chapter is short because the codebase earned it.
