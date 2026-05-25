# Section 02 — Data structures & algorithms

The reincodes codebase is an interactive DSA visualizer plus a portfolio. Every operation here ships as a `useState`-driven animation under `src/app/{sorting,trees,recursions,graphs}/*/page.tsx`, anchored on reference data structures in `src/utils/data_structures/`. The project owner also maintains a parallel study notebook at `src/utils/notes/` (organized as `BST/`, `Graph/`, `Recursions/`, `Sorting/`) — standalone reference implementations that are not imported by the visualizers but kept for direct comparison; concept files below cite the corresponding `notes/` file under a **Study notebook reference** block in `## In this codebase`.

This section walks each operation as its own file: the data shape, the brute-force baseline, the optimal version with its insight, the codebase implementation with line refs (production + study-notebook), and the interview defense.

## File index

### Inputs

- [01 — Array of random numbers](01-array-of-random-numbers.md) — `generateArrayOfRandomNumbers(size)` — the input primitive every sorting visualizer starts from.

### Sorting (compares O(n²) family to O(n log n) family)

- [02 — Bubble sort](02-bubble-sort.md) — adjacent-pair swaps; O(n²); the visualizer walks right-to-left (smallest sinks left).
- [03 — Insertion sort](03-insertion-sort.md) — sorted-prefix construction; O(n) best case; the TimSort small-run primitive.
- [04 — Selection sort](04-selection-sort.md) — find-min-then-swap; O(n) writes; no best case; unstable.
- [05 — Merge sort](05-merge-sort.md) — divide-and-conquer with two-pointer combine; O(n) auxiliary; stable.
- [06 — Quick sort](06-quick-sort.md) — Lomuto partition with random pivot; in-place; not stable.
- [07 — Heap sort](07-heap-sort.md) — heap-extract loop; O(1) auxiliary in the canonical form; not stable.

### Trees & heaps

- [08 — Binary search tree](08-binary-search-tree.md) — recursive + iterative insert/search/delete + three traversals.
- [09 — Binary heap](09-binary-heap.md) — array-encoded complete tree with parent-child index math; MinHeap + MaxHeap.
- [10 — Priority queue](10-priority-queue.md) — heap-backed PQ with `valueIndicesLookup` for O(log n) `updatePriority`.
- [11 — N-ary tree traversal](11-n-ary-tree-traversal.md) — generic n-ary tree with generator-based pre/post-order.

### Recursion

- [12 — Recursion: Fibonacci](12-recursion-fibonacci.md) — naive O(φⁿ) call tree vs memoized O(n); codebase ships iterative form.
- [13 — Recursion: subsets and n-choose-k](13-recursion-subsets-and-n-choose-k.md) — include/exclude decisions; power-set vs pruned combinations.

### Graphs

- [14 — Graph adjacency list](14-graph-adjacency-list.md) — `Graph2.Node2` with `edges: { [neighbor]: Edge }` dict, vs older `number[][]` form in `Graph.ts`.
- [15 — BFS with parent tracking](15-bfs-with-parent-tracking.md) — `breadth_first_search` returning a parent array; the reconstruction primitive.
- [16 — DFS traversal](16-dfs-traversal.md) — recursive form (`Graph.ts`) + commented iterative-stack form (`Graph2.ts`).
- [17 — Dijkstra's shortest path](17-dijkstras-shortest-path.md) — PQ-driven; the reason `valueIndicesLookup` exists.
- [18 — State-space BFS (river crossing)](18-state-space-bfs.md) — BFS over an implicit graph of `PGState` nodes generated on the fly.

## Complexity cheat sheet

`n` = input size. Bold rows are the operations a recruiter is most likely to ask about; everything else is supporting material. The "Holds at 10×?" column asks: if `n` grows from a typical visualizer input (50) to 500, does the operation still feel instant in the browser?

```
┌──────────────────────────────┬──────────────┬──────────────┬───────────┬───────────────┐
│ Operation                    │ Time (avg)   │ Time (worst) │ Space     │ Holds at 10×? │
├──────────────────────────────┼──────────────┼──────────────┼───────────┼───────────────┤
│ generateArrayOfRandomNumbers │ O(n)         │ O(n)         │ O(n)      │ yes           │
│                              │              │              │           │               │
│ ** Sorting **                │              │              │           │               │
│ bubble-sort (no early-exit)  │ O(n²)        │ O(n²)        │ O(1)      │ no            │
│ insertion-sort               │ O(n²)        │ O(n²)        │ O(1)      │ no            │
│ selection-sort               │ O(n²)        │ O(n²)        │ O(1)      │ no            │
│ merge-sort                   │ O(n log n)   │ O(n log n)   │ O(n)      │ yes           │
│ quick-sort (random pivot)    │ O(n log n)   │ O(n²)        │ O(log n)* │ yes           │
│ heap-sort (in-place)         │ O(n log n)   │ O(n log n)   │ O(1)      │ yes           │
│                              │              │              │           │               │
│ ** BST (balanced) **         │              │              │           │               │
│ BST.insert / search / delete │ O(log n)     │ O(n)†        │ O(1)      │ yes (log)     │
│ BST.preOrder / inOrder / etc │ O(n)         │ O(n)         │ O(n)      │ yes           │
│                              │              │              │           │               │
│ ** Binary heap **            │              │              │           │               │
│ MinHeap.insert / getMin      │ O(log n)     │ O(log n)     │ O(1)      │ yes           │
│ MinHeap.buildHeap (n inserts)│ O(n log n)   │ O(n log n)   │ O(1)      │ yes           │
│ heapify (in-place build)     │ O(n)         │ O(n)         │ O(1)      │ yes           │
│                              │              │              │           │               │
│ ** Priority queue **         │              │              │           │               │
│ PQ.enqueue / dequeue         │ O(log n)     │ O(log n)     │ O(n)      │ yes           │
│ PQ.updatePriority (with map) │ O(log n)     │ O(log n)     │ O(n)      │ yes           │
│ PQ.updatePriority (no map)   │ O(n)         │ O(n)         │ O(1)      │ no            │
│                              │              │              │           │               │
│ ** Tree (n-ary) **           │              │              │           │               │
│ Tree.preOrderTraversal       │ O(n)         │ O(n)         │ O(h)      │ yes           │
│ Tree.find (linear pre-order) │ O(n)         │ O(n)         │ O(h)      │ yes           │
│ Tree.insert (find + push)    │ O(n)         │ O(n)         │ O(h)      │ yes           │
│                              │              │              │           │               │
│ ** Recursion **              │              │              │           │               │
│ fib_naive(n) (no memo)       │ O(φⁿ)        │ O(φⁿ)        │ O(n)      │ no            │
│ fib_memo(n)                  │ O(n)         │ O(n)         │ O(n)      │ yes           │
│ fib_iterative (codebase)     │ O(n)         │ O(n)         │ O(1)      │ yes           │
│ subsets(n)                   │ O(2ⁿ · n)    │ O(2ⁿ · n)    │ O(2ⁿ · n) │ no            │
│ choose(n, k)                 │ O(C(n,k))    │ O(C(n,k))    │ O(n)      │ depends on k  │
│                              │              │              │           │               │
│ ** Graphs **                 │ V = nodes    │ E = edges    │           │               │
│ Adjacency list build         │ O(V + E)     │ O(V + E)     │ O(V + E)  │ yes           │
│ Adjacency matrix build       │ O(V²)        │ O(V²)        │ O(V²)     │ no for dense  │
│ BFS                          │ O(V + E)     │ O(V + E)     │ O(V)      │ yes           │
│ DFS (recursive)              │ O(V + E)     │ O(V + E)     │ O(V)      │ yes‡          │
│ Dijkstra (PQ-backed)         │ O((V+E)logV) │ O((V+E)logV) │ O(V)      │ yes           │
│ Dijkstra (scan-based)        │ O(V²)        │ O(V²)        │ O(V)      │ no            │
│ State-space BFS (river)      │ O(\|S\| + \|T\|) │ O(\|S\| + \|T\|) │ O(\|S\|)    │ depends§      │
└──────────────────────────────┴──────────────┴──────────────┴───────────┴───────────────┘
```

`*` quicksort's auxiliary space is the recursion stack — O(log n) average with balanced partitions, O(n) worst with adversarial input.
`†` BST in this codebase is not self-balancing. A skewed insertion order (already-sorted input) gives a degenerate linked list — O(n) operations until rebalanced.
`‡` DFS recursive depth is bounded by V; V8 stack limit (~10k frames) is the practical breakpoint where the iterative stack form earns its place.
`§` `|S|` = reachable state count, `|T|` = state-transition count. For the prisoners-and-guards puzzle |S| is tiny (<64); for the 15-puzzle it's ~10¹³.

## Operations that don't hold at 10×

The visualizer caps `inputSize` at small values (~50–200) so the operations that scale poorly still feel instant. If you're defending the codebase in an interview, these are the operations where a recruiter could land a "what happens at scale" follow-up:

- **Bubble / insertion / selection sort** — O(n²) means n=500 is ~250k ops per pass × ~500 passes = 125M ops. Still tens-of-ms in JS but starts dropping frames at the 200ms `delayLoop`. **Fix:** swap to merge or heap sort. **Effort:** ~1hr per sorting page; the visualizer-step pattern is the same.
- **Adjacency matrix build for dense graphs** — `Graph.ts` builds an `n × n` matrix unconditionally. For sparse graphs the matrix wastes O(V²) space. **Fix:** prefer `Graph2.ts`'s adjacency list for any graph that's ever larger than ~100 nodes. **Effort:** the migration is already partially done (`Graph2` exists); finish removing `Graph` uses. ~2–4hr.
- **`PriorityQueue.updatePriority` without the index lookup** — currently has the lookup, so it's O(log n). The brute-force version (scan for the value) is O(n) and would tank Dijkstra to O(V²) on large graphs. **Fix:** already done — flagged here so a regression doesn't re-introduce it.
- **`fib_naive`** — `O(φⁿ)`. The `recursions/fibonacci-numbers/page.tsx` page ships the iterative form for the *value*, but the n-ary tree on screen would still be expensive to render at large n if the call tree were the source of truth. **Fix:** the codebase already memoizes via the iterative form; if you ever wire the tree viz to the actual recursion, add memoization. **Effort:** trivial — wrap with a `Map<n, value>`.
- **`subsets(n)`** — `2ⁿ` is unavoidable if you actually need every subset, but the visualizer doesn't have to materialize them all at once. **Fix:** if visualizing for n > 20, stream subsets one at a time via a generator (same pattern as `Tree.preOrderTraversal`). **Effort:** 1–2hr.
- **Dijkstra with scan-based PQ** — would be O(V²) and would defeat the whole reason for using a heap. The codebase already pays the memory cost of `valueIndicesLookup` to avoid this; if you ever remove that lookup, Dijkstra degrades silently.

## What this section doesn't cover

- **Self-balancing trees** (AVL, Red-Black). The BST file names them as the fix for the skew failure mode but doesn't implement them.
- **Union-find / disjoint-set**. `Graph.ts` mentions union-find as an alternative for `isGraphValidTree` but doesn't ship one.
- **A\* and heuristic search.** State-space BFS works for small puzzles; the file names A* as the next step for large state spaces but doesn't visualize it.
- **String algorithms.** No string-search, no edit distance, no tries. The visualizer surface is geometric and array-driven.
