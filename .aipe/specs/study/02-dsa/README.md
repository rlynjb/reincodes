# 02 — Data structures & algorithms

Every algorithm and data structure reincodes visualises, in one place. Read in numeric order; later files reference earlier ones.

## Files

### Sorting (6 files)
1. **[01-selection-sort](./01-selection-sort.md)** — find min, swap, repeat. O(n²). Minimal swaps.
2. **[02-bubble-sort](./02-bubble-sort.md)** — adjacent compare/swap. O(n²). Cleanest invariant.
3. **[03-insertion-sort](./03-insertion-sort.md)** — maintain sorted prefix. O(n²) worst / **O(n) best (sorted input)**. Adaptive.
4. **[04-merge-sort](./04-merge-sort.md)** — split + merge. **O(n log n) guaranteed**. O(n) extra memory. Stable.
5. **[05-quick-sort](./05-quick-sort.md)** — pivot + partition. O(n log n) avg / O(n²) worst. In-place.
6. **[06-heap-sort](./06-heap-sort.md)** — build max-heap + extract. O(n log n) guaranteed, in-place.

### Data structures (3 files)
7. **[07-binary-search-tree](./07-binary-search-tree.md)** — ordered binary tree; O(log n) avg, O(n) worst (unbalanced).
8. **[08-binary-heap](./08-binary-heap.md)** — complete tree as flat array; powers PQ + heap sort.
9. **[09-min-heap-priority-queue](./09-min-heap-priority-queue.md)** — heap wrapped with `updatePriority`; engine of Dijkstra.

### Trees + graphs (6 files)
10. **[10-n-ary-tree](./10-n-ary-tree.md)** — arbitrary-children tree; backs callstack viz.
11. **[11-graph-adjacency-list](./11-graph-adjacency-list.md)** — `Graph2` class; node → map of edges.
12. **[12-bfs](./12-bfs.md)** — FIFO-queue level-order traversal; shortest unweighted path.
13. **[13-dijkstra](./13-dijkstra.md)** — BFS + priority queue; shortest weighted path (non-negative edges).
14. **[14-state-space-bfs](./14-state-space-bfs.md)** — BFS over implicit graph; river-crossing solver.
15. **[15-grid-graph-construction](./15-grid-graph-construction.md)** — `idx = r*W+c` flattening; substrate for grid + shortest-path.

### Recursion (3 files)
16. **[16-fibonacci-recursion](./16-fibonacci-recursion.md)** — tail-recursive accumulator; O(n) instead of O(2^n).
17. **[17-count-all-subsets-backtracking](./17-count-all-subsets-backtracking.md)** — 2^n include/exclude decision tree.
18. **[18-n-choose-k](./18-n-choose-k.md)** — constrained backtracking; Pascal's identity in code.

## Complexity cheat sheet

```
┌─────────────────────────────────┬───────────────┬───────────────┬─────────────┐
│ Operation                        │ Time          │ Space         │ Holds @10×? │
├─────────────────────────────────┼───────────────┼───────────────┼─────────────┤
│ Selection / bubble / insertion   │ O(n²)         │ O(1)          │ ✗ → fix #1  │
│   sort                           │               │               │             │
│ Merge sort                       │ O(n log n)    │ O(n)          │ ✓           │
│ Quick sort                       │ O(n log n) avg│ O(log n)      │ ✓ (avg)     │
│   (worst O(n²) on bad pivot)     │               │               │             │
│ Heap sort                        │ O(n log n)    │ O(1)          │ ✓           │
│                                  │               │               │             │
│ BST insert / search (balanced)   │ O(log n)      │ O(n)          │ ✓           │
│   (unbalanced — this codebase)   │ O(n) worst    │               │ ✗ → fix #2  │
│ Binary heap insert / extract     │ O(log n)      │ O(n)          │ ✓           │
│ Priority queue enqueue / dequeue │ O(log n)      │ O(n) + heap   │ ✓           │
│                                  │               │               │             │
│ BFS / DFS over Graph2            │ O(V + E)      │ O(V)          │ ✓           │
│ Dijkstra (binary-heap PQ)        │ O((V+E)logV)  │ O(V)          │ ✓           │
│ Grid graph construction          │ O(WH)         │ O(WH)         │ ✓           │
│ State-space BFS (river-crossing) │ O(S+T)        │ O(S)          │ ✓ if S small│
│                                  │               │               │             │
│ Fibonacci recursive (tail)        │ O(n)         │ O(n) stack    │ ✓ for n<1e4 │
│ Count all subsets                │ O(2^n × n)    │ O(n)          │ ✗ → fix #3  │
│ N choose k                       │ O(C(n,k) × k) │ O(k)          │ ✓ if k small│
└─────────────────────────────────┴───────────────┴───────────────┴─────────────┘
```

### Operations that DON'T hold at 10× — and the fix

**Fix #1: elementary sorts at large n.** Selection / bubble / insertion sort are O(n²). At `inputSize=50` (this site's max), they take <1 ms — invisible. At n=5000, ~25M ops = ~50ms. At n=50000, ~2.5G ops = several seconds. Fix is `Array.prototype.sort` (V8 TimSort, O(n log n)) for production, ~5 minutes. The visualizers are tools for *teaching* these sorts; production code never uses them.

**Fix #2: BST degenerating to O(n).** `src/utils/data_structures/BinarySearchTree.ts` doesn't balance. Insert sorted input → linked list. Fix is a red-black or AVL tree — ~200 LOC of rotation logic; ~1–2 days. For production use, swap to a balanced map like `lru-cache` or `sorted-btree`.

**Fix #3: count-all-subsets at n > 25.** 2^n explodes. At n=20, ~1M subsets, ~50ms in JS. At n=30, ~1B subsets, ~minutes. Fix depends on the question being asked — if you only need a count, use a closed-form; if you need them all, no smarter algorithm exists (this is the *cost* of the problem). For "find a subset satisfying X," use backtracking *with pruning* (branch-and-bound), which dramatically reduces the practical search.

## How to use these files

- For a refresher on a specific algorithm: jump to the file, read the trace, work the Level-1 + Level-2 validation.
- For interview prep: read the **Interview defense** section of each — every algorithm has a "[mid] / [senior] / [arch]" Q&A trio.
- For a fix: each Tradeoffs section names the breakpoint where the algorithm stops being the right choice.
