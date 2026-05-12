# Heap sort

**Industry name(s):** Heapsort
**Type:** Industry standard · Language-agnostic

> Build a max-heap from the array, then repeatedly extract the max into the end. Visualized at `/sorting/heap-sort`.

**See also:** → [08-binary-heap](./08-binary-heap.md) · → [04-merge-sort](./04-merge-sort.md) · → [05-quick-sort](./05-quick-sort.md)

---

## Why care

You have an array and you want O(n log n) in-place sort with guaranteed worst case — merge sort needs O(n) memory; quick sort risks O(n²). Heap sort gives you both guarantees. It does this by maintaining a heap (a tree-shaped priority structure) inside the array itself.

Heap sort sits in **O(n log n) comparison-based sorts** as the in-place + guaranteed sibling of merge sort and quick sort. It's slower in practice than quick sort due to cache patterns, but it's the algorithm of choice for "introsort fallback" — when quick sort detects pathological pivots, it switches to heap sort.

---

## How it works

Picture a tournament bracket where the largest player wins each round. Start with a chaotic 100-person bracket: rearrange so the largest is at the root (max-heap). Pluck the root, place it at "last position." The bracket now has 99 people; rearrange so the new largest is at the root. Repeat until 1 player remains.

### The algorithm

```
function heapSort(arr):
  // Build max-heap (O(n))
  for i from floor(n/2) - 1 down to 0:
    siftDown(arr, i, n)

  // Sort by repeated extract-max
  for i from n-1 down to 1:
    swap(arr[0], arr[i])      // largest moves to position i
    siftDown(arr, 0, i)       // re-heapify the first i elements
```

The trick: a binary heap can be stored in an array where node `i`'s children are `2i+1` and `2i+2`. No pointers, no tree allocation — just index arithmetic.

### Execution trace on `[5, 2, 4, 1, 3]`

```
Phase 1 — Build max-heap:
  Initial: [5, 2, 4, 1, 3]
  i=1: siftDown(idx 1): children at 3, 4 → max(2, 1, 3) = 3 → swap 2 and 3
       [5, 3, 4, 1, 2]
  i=0: siftDown(idx 0): children at 1, 2 → max(5, 3, 4) = 5, already heap
       [5, 3, 4, 1, 2]   ← max-heap

Phase 2 — Sort:
  i=4: swap arr[0] and arr[4]  → [2, 3, 4, 1, 5]
       siftDown(0, 4): max(2,3,4)=4 at idx 2 → swap
       [4, 3, 2, 1, 5]
  i=3: swap arr[0] and arr[3]  → [1, 3, 2, 4, 5]
       siftDown(0, 3): max(1,3,2)=3 at idx 1 → swap
       [3, 1, 2, 4, 5]
  i=2: swap arr[0] and arr[2]  → [2, 1, 3, 4, 5]
       siftDown(0, 2): max(2,1)=2 at idx 0, already heap
       [2, 1, 3, 4, 5]
  i=1: swap arr[0] and arr[1]  → [1, 2, 3, 4, 5]

Final: [1, 2, 3, 4, 5]
```

### Complexity

- Build heap: O(n) (counterintuitive — the bottom of the heap is most nodes but only sift-down 0 levels).
- Each extract-max: O(log n).
- Total: O(n log n).
- Space: O(1) — in place.

### "When brute force is fine"

Heap sort is already optimal in big-O terms. The "brute force" comparison: any O(n²) sort. The "production" comparison: quick sort beats heap sort by ~2× on cache locality; merge sort matches heap sort in time but uses more memory. Heap sort's win is *guaranteed worst-case in-place* — niche, but valuable in security-sensitive contexts (sort timing must be input-independent).

### The principle

This is what people mean by *implicit data structures*. A heap conceptually is a tree, but lives in a flat array via index math. The same idea — "the structure is implicit in the position" — underlies suffix arrays, k-d trees in flat arrays, and many GPU-friendly data structures where pointer-chasing is fatal.

The full picture is below.

---

## Heap sort — diagram

```
Heap stored in array; parent/child by index:

Index:  0  1  2  3  4  5  6
Value: [9, 7, 8, 3, 5, 2, 6]

As tree:
              9 (0)
             /     \
           7 (1)    8 (2)
           /  \    /  \
         3(3) 5(4) 2(5) 6(6)

Heap-sort cycle:
  1. Swap root (9) with last (6) → [6, 7, 8, 3, 5, 2, |9]
  2. siftDown(0, 6) — restore heap in first 6 → [8, 7, 6, 3, 5, 2, |9]
  3. Swap root (8) with last-non-sorted (2) → [2, 7, 6, 3, 5, |8, 9]
  4. siftDown(0, 5) → [7, 5, 6, 3, 2, |8, 9]
  ... repeat until done.
```

---

## In this codebase

**Page:** `src/app/sorting/heap-sort/page.tsx`.
**Heap class:** `src/utils/data_structures/BinaryHeap.ts` — the underlying min/max-heap. See [08-binary-heap](./08-binary-heap.md).

GitHub: `[heap-sort/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/sorting/heap-sort/page.tsx)`.

---

## Elaborate

### Where this pattern comes from
Heap sort was published by J.W.J. Williams in 1964, building on the heap data structure he'd just defined for priority queues. The "sort by repeated extract-max" insight predates the data structure — selection sort is the unoptimised version of the same idea. Heap sort just stores enough state to find the next max in O(log n) instead of O(n).

### The deeper principle
*The same data structure can serve different problems.* A heap is a priority queue *and* the engine of heap sort *and* the priority structure underneath Dijkstra. Once you build one, you get all three.

### Where this breaks down
- Cache locality: heap traversal jumps by `2i+1` steps, defeating the CPU prefetcher. Quick sort's contiguous scans are dramatically faster on cached data.
- Stability: not stable.
- Parallelism: heap operations are inherently sequential.

### What to explore next
- [08-binary-heap](./08-binary-heap.md) — the underlying data structure.
- [09-min-heap-priority-queue](./09-min-heap-priority-queue.md) — priority queue as a heap wrapper.
- [13-dijkstra](./13-dijkstra.md) — heap as the engine for shortest-path.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Heap sort                │ Quick sort               │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time worst       │ O(n log n) guaranteed    │ O(n²)                    │
│ Time avg constant│ ~2× slower than quick    │ Fastest                  │
│ Space            │ O(1)                     │ O(log n) stack           │
│ Stable           │ No                       │ No                       │
│ Cache locality   │ Poor (heap jumps)        │ Excellent                │
│ Adversarial safe │ Yes                      │ No (without random pivot)│
│ Used in          │ Introsort fallback       │ C++ STL primary           │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Speed in practice. Heap sort is ~2× slower than quick sort on cached, random arrays of typical sizes — the heap jumps fight the CPU prefetcher. The guarantee is what you pay for; if you don't need it, you don't want heap sort as your primary sort.

Stability and parallelisability. Equal-key items can be reordered; the heap operations are sequential.

### What the alternative would have cost

Quick sort: faster average but O(n²) worst case. Merge sort: stable but O(n) memory. Heap sort uniquely combines in-place + guaranteed O(n log n) + no adversarial input risk.

### The breakpoint

Fine when you need guaranteed in-place worst-case. That's the niche — security-sensitive code, embedded systems where O(n) memory isn't available, and introsort fallback.

---

## Tech reference (industry pairing)

### Heap sort + array-backed heap

- **Codebase uses:** `BinaryHeap` class + custom heap-sort loop.
- **Why it's here:** demonstrates the heap data structure powering a sort.
- **Leading today:** Introsort fallback — `adoption-leading` for guaranteed O(n log n) when quick sort goes pathological, 2026.
- **Why it leads:** the only common sort with both guaranteed worst-case AND no extra memory.

---

## Summary

### Part 1 — concept recap

Heap sort builds a max-heap from the array, then repeatedly swaps the root (max) to the end and re-heapifies the shrinking front. reincodes implements it on `/sorting/heap-sort/page.tsx` using the `BinaryHeap` class. The constraint that earns heap sort its place is "in-place + guaranteed O(n log n)," and the cost is ~2× constant-factor slowdown vs quick sort due to cache patterns.

### Part 2 — key points to remember

- Build max-heap in O(n); extract max n times in O(log n) each → total O(n log n).
- In-place — O(1) extra memory.
- Not stable, not parallel-friendly.
- Production niche: introsort fallback when quick sort's recursion depth gets too deep.
- The cost is cache unfriendliness; the benefit is the only in-place worst-case-guaranteed sort.

---

## Interview defense

### What an interviewer is really asking

When someone asks "why heap sort?", they want to hear about the *guaranteed in-place* niche. If you say "because it's O(n log n)," they'll counter with merge or quick. The right answer names what heap sort uniquely provides.

### Likely questions

**Q [mid]: What's the relationship between heap sort and a priority queue?**

A: A priority queue *is* a heap (typically). Heap sort uses the same heap operations: insert (or build-heap), extract-max. If you have a priority queue, you can heap-sort by extract-max-ing into a list. The flat-array form of the heap is what makes it work in-place — you don't need a separate priority queue data structure; the heap lives in the array you're sorting.

**Q [senior]: Why is heap sort 2× slower than quick sort in practice if both are O(n log n)?**

A: Cache locality. Quick sort's partition scans the array left-to-right and right-to-left — the CPU's prefetcher loves that pattern. Heap sort's `siftDown` jumps from index `i` to `2i+1` and `2i+2`, which means jumping ahead by O(n) addresses at deeper levels of the heap. Cache misses pile up. The big-O is the same but the *constant* hides a 2× cache miss tax.

```
Quick sort partition:        Heap sort siftDown:
  i → i+1 → i+2 → ...        i → 2i+1 → 4i+3 → 8i+7 ...
  cache hit                  cache miss after first few hops
```

**Q [arch]: Why does introsort use heap sort as fallback specifically?**

A: Three constraints introsort needs from its fallback: (1) O(n log n) guaranteed worst case (rules out quick), (2) in-place (rules out merge), (3) implementable as a "kick in at recursion depth N" without restarting (heap sort and merge sort both qualify, but merge sort needs memory; heap sort is in-place). So heap sort is the unique answer. The performance hit is acceptable because the fallback rarely triggers — only on pathological input.

### The question candidates always dodge

**Q: Heap sort is theoretically optimal yet practically slower. What does that teach you?**

A: That *asymptotic complexity is a floor, not a ceiling*. The constant factors matter — and constant factors come from how the algorithm interacts with hardware. Heap sort's complexity analysis assumes uniform memory access; modern hardware doesn't have that. The lesson generalises: when picking between algorithms with the same big-O, the question is "how does each interact with the cache, the branch predictor, and the prefetcher?" — not "which has lower constant in the paper."

```
┌── Asymptotic view ────────┐    ┌── Hardware reality ───────┐
│  Both O(n log n)          │    │  Quick: cache friendly    │
│  "Should be equal"        │    │    ~50ns/op               │
│                           │    │  Heap: cache hostile      │
│                           │    │    ~100ns/op              │
│                           │    │  Big-O equal; constants 2× │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Build heap, extract max n times, sort done."
- "In-place + guaranteed worst case — the heap sort niche."
- "Slower in practice due to cache jumps."
- "Introsort fallback when quick sort goes pathological."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a 7-element array as a heap and trace the first two extract-max steps.

### Level 2 — Explain it out loud
"What does heap sort give you that merge sort and quick sort don't?"

### Level 3 — Apply it to a new scenario
"I have a stream of 1M items and want the top 100 at any moment. Heap sort or something else?"
(Answer: min-heap of size 100, not a full sort.)

### Level 4 — Defend the decision you'd change
"Would you replace heap sort with another sort in this visualizer?"

### Quick check
- File? → `src/app/sorting/heap-sort/page.tsx`.
- Complexity? → O(n log n) worst.
- Space? → O(1).

✓ Pass: all three.
