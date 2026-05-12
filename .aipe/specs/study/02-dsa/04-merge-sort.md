# Merge sort

**Industry name(s):** Merge sort, divide-and-conquer sort
**Type:** Industry standard · Language-agnostic

> Split the array in half recursively, sort each half, merge the two sorted halves into one. Visualized at `/sorting/merge-sort`.

**See also:** → [05-quick-sort](./05-quick-sort.md) · → [06-heap-sort](./06-heap-sort.md) · → [03-insertion-sort](./03-insertion-sort.md)

---

## Why care

You and a friend each take half a deck of cards and sort your half independently. Now you have two sorted half-decks — and merging two sorted decks into one sorted deck is *easy*: peek at the top card of each, take the smaller one, repeat. That's merge sort. The whole algorithm is "split in half, recurse, merge."

Merge sort is the canonical **divide-and-conquer** sort and the simplest O(n log n) algorithm to reason about. Same family as quick sort (different split strategy) and the underlying engine of TimSort (production JS sort). It's the algorithm with the cleanest correctness proof and the worst space cost — O(n) extra memory for the merge buffer.

---

## How it works

Picture organising files by binder: split a thick binder into two thinner ones, hand each to a helper. The helpers split their binders again. Eventually each helper has a binder with 0 or 1 files (already sorted by definition). They start handing pairs of sorted binders back up the chain; at each merge, two sorted binders combine into one twice-as-big sorted binder. Repeat until you're holding one sorted binder.

### The algorithm

```
function mergeSort(arr):
  if arr.length <= 1: return arr
  mid = arr.length / 2
  left = mergeSort(arr.slice(0, mid))
  right = mergeSort(arr.slice(mid))
  return merge(left, right)

function merge(left, right):
  result = []
  i, j = 0, 0
  while i < left.length and j < right.length:
    if left[i] <= right[j]:
      result.push(left[i]); i++
    else:
      result.push(right[j]); j++
  // append any leftovers
  return result + left.slice(i) + right.slice(j)
```

**If you're coming from frontend, you've zipped two streams together — `merge` is that zip, but it picks the smaller value at each step.** The recursive split builds a balanced binary tree of depth `log n`; each level processes `n` total elements; total work is `n × log n`.

### Brute force comparison

There's no real "brute force" merge sort — it's already O(n log n). The simpler-but-slower counterpart is any O(n²) sort. Vs `selection sort` on n=10000:
- Selection: ~50M operations.
- Merge: ~130k operations.
- 400× speedup. That's what `log n` buys you.

### Execution trace on `[5, 2, 4, 1, 3]`

```
                 [5, 2, 4, 1, 3]
                /               \
            [5, 2]           [4, 1, 3]
            /    \           /        \
          [5]    [2]      [4]      [1, 3]
                                   /     \
                                 [1]      [3]
                  merge ←─────────────────────
        ↓                       ↓
    merge(5,2) → [2,5]      merge(1,3) → [1,3]
                            merge(4, [1,3]) → [1,3,4]
        ↓                            ↓
        └──── merge([2,5], [1,3,4]) → [1,2,3,4,5]

Compares during the final merge:
  i=0,j=0: 2 vs 1 → 1; j=1
  i=0,j=1: 2 vs 3 → 2; i=1
  i=1,j=1: 5 vs 3 → 3; j=2
  i=1,j=2: 5 vs 4 → 4; j=3
  right exhausted → append left[1..] = [5]
  result: [1,2,3,4,5]
```

### Complexity comparison at multiple scales

```
┌────────┬───────────┬───────────┬──────────────┐
│   n    │ O(n²)     │ O(n log n)│ Speedup ratio│
├────────┼───────────┼───────────┼──────────────┤
│  100   │ 10,000    │ 700       │ 14×          │
│ 1,000  │ 1,000,000 │ 10,000    │ 100×         │
│10,000  │ 100M      │ 130,000   │ ~770×        │
│ 100k   │ 10B       │ 1.7M      │ ~5800×       │
└────────┴───────────┴───────────┴──────────────┘
```

### "When brute force is fine"

Never for n > 1000 — that's the whole point of D&C. For tiny n (<16), insertion sort wins because of constant factor. Production sorts hybridise: merge sort for the macro structure, insertion sort for the micro leaves.

### The principle

This is what people mean by *divide-and-conquer*. The key insight: solving two half-size problems plus a linear-time merge is asymptotically faster than solving one full-size problem at quadratic cost. The same idea underlies merge sort's siblings — FFT, Strassen's matrix multiplication, parallel reduce operations.

The full picture is below.

---

## Merge sort — diagram

```
Split phase (top-down):

                [5, 2, 4, 1, 3]              level 0  (n elements)
               /                \
           [5, 2]              [4, 1, 3]     level 1  (n total)
           /    \              /       \
         [5]   [2]          [4]       [1, 3] level 2  (n total)
                                       /  \
                                     [1]  [3]  level 3  (n total)

Each level: O(n) work for splits.  log₂(5) ≈ 3 levels deep.

Merge phase (bottom-up):

         [5]   [2]    [4]   [1]  [3]
           \   /       │     \   /
          [2, 5]      [4]    [1, 3]
              \        \      /
               \       [1, 3, 4]
                \           /
                 [1, 2, 3, 4, 5]

Each level: O(n) work for merges.   Total: O(n log n).
```

---

## In this codebase

**Page:** `src/app/sorting/merge-sort/page.tsx`.
**Reference impl:** `src/utils/notes/Sorting/MergeSort.ts`.

GitHub: `[merge-sort/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/sorting/merge-sort/page.tsx)`.

---

## Elaborate

### Where this pattern comes from
Invented by John von Neumann in 1945. The merge step itself is one of the oldest tape-based sorting algorithms — used on tape drives where sequential access was free and random access was expensive. The pattern (split, recurse, combine) generalises far beyond sorting: it's the structure of FFT, Strassen's matrix multiplication, and most parallel-reduce algorithms.

### The deeper principle
*Recursive decomposition turns multiplication into addition.* Two halves of size n/2 cost 2 × T(n/2). The merge costs O(n). Recurrence: T(n) = 2T(n/2) + O(n) = O(n log n). That equation says "the work scales sub-quadratically" — which is what makes merge sort tractable on millions of elements.

### Where this breaks down
- Memory: O(n) for the merge buffer. Bad for memory-constrained systems.
- Cache locality: less than quick sort because the merge buffer is a separate region.
- Small n: insertion sort beats it by 2–5× on n<16 due to constants.

### What to explore next
- [05-quick-sort](./05-quick-sort.md) — O(n log n) average, O(1) extra space, opposite memory tradeoff.
- [06-heap-sort](./06-heap-sort.md) — O(n log n) in-place via heap.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Merge sort               │ Quick sort               │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time worst       │ O(n log n) — guaranteed  │ O(n²) — worst case       │
│ Time average     │ O(n log n)               │ O(n log n)               │
│ Space            │ O(n) merge buffer        │ O(log n) recursion stack │
│ Stable           │ Yes                      │ No                       │
│ Cache locality   │ Moderate                 │ Excellent                │
│ Parallel         │ Easy — halves are indep  │ Harder — partition depends│
│ Production use   │ TimSort (V8, Java)        │ Introsort (C++ STL)      │
│ Code complexity  │ ~25 lines                │ ~20 lines                │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

O(n) extra space. For very large arrays this hurts — you can't merge-sort a 4GB file in 8GB of RAM without temp-file dance. Quick sort handles that in-place.

Cache friendliness. The merge step reads from `left` and `right` and writes to `result`, three regions that may or may not be cache-co-located. Quick sort's partition reads and writes the same region, which the CPU prefetcher likes better.

### What the alternative would have cost

Quick sort: O(n²) worst case (if pivots are pathological), randomised quicksort makes that astronomically unlikely but doesn't eliminate it. Merge sort's worst case is the same as its best case — a strong guarantee when you're sorting untrusted input.

### The breakpoint

Fine until memory is constrained or stability isn't needed. In an unbounded-memory JS environment, merge sort is always a safe choice; in a 100MB-RAM embedded system sorting a 50MB file, quick sort or external sort wins.

---

## Tech reference (industry pairing)

### Merge sort + JS Array

- **Codebase uses:** TypeScript implementation in `src/utils/notes/Sorting/MergeSort.ts`.
- **Why it's here:** the cleanest O(n log n) algorithm to teach.
- **Leading today:** TimSort (which uses merge sort + insertion sort) — `adoption-leading` for stable sorts in production (V8, Java, Python), 2026.
- **Why it leads:** combines merge sort's guaranteed O(n log n) with insertion sort's small-n constant factor; adaptive to existing runs in the data.
- **Runner-up:** Introsort — quick sort that falls back to heap sort on bad recursion depth; preferred in C++ STL because it's in-place.

---

## Summary

### Part 1 — concept recap

Merge sort splits the array recursively in half until each piece is trivially sorted (size 0 or 1), then merges the pieces back up the call tree. reincodes implements it on `/sorting/merge-sort/page.tsx` with the standard `delayLoop` animation between merge steps. The constraint is "guaranteed O(n log n) regardless of input," and the cost is O(n) extra memory for the merge buffer.

### Part 2 — key points to remember

- O(n log n) — guaranteed best/average/worst.
- O(n) extra space — the only common O(n log n) sort that's not in-place.
- Stable.
- Easy to parallelise (halves are independent).
- The cost is memory; the benefit is the strongest worst-case guarantee of the practical sorts.

---

## Interview defense

### What an interviewer is really asking

When someone asks merge vs quick, they want you to articulate the *worst-case guarantee* vs *constant-factor* tradeoff. Merge: guaranteed O(n log n), worse constants. Quick: better constants, O(n²) worst case.

### Likely questions

**Q [mid]: Walk through merging `[1, 3, 5]` and `[2, 4]`.**

A:
```
i=0,j=0: 1 vs 2 → take 1, i=1
i=1,j=0: 3 vs 2 → take 2, j=1
i=1,j=1: 3 vs 4 → take 3, i=2
i=2,j=1: 5 vs 4 → take 4, j=2
right exhausted → append left[2..] = [5]
result: [1, 2, 3, 4, 5]
```

**Q [senior]: Why does TimSort prefer merge sort over quick sort?**

A: Stability and worst-case guarantee. TimSort is the standard sort in Python, Java, V8 — when sorting user-facing data (objects with multiple fields), stability matters: equal-keyed items keep their relative order. Quick sort is unstable. Also, TimSort exploits *runs* — pre-existing sorted subsequences — by detecting them and merging them, which makes already-sorted-ish input run near O(n). Quick sort doesn't get that benefit. The cost is O(n) memory, which production systems can pay.

```
┌── TimSort (merge-based) ──┐    ┌── Introsort (quick-based) ┐
│  Stable                   │    │  Unstable                 │
│  Worst case O(n log n)    │    │  Worst case O(n²) (rare)  │
│  Detects runs → O(n) best │    │  No run detection         │
│  O(n) memory              │    │  O(log n) memory          │
│  Used in: Python, Java,V8 │    │  Used in: C++ STL         │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: External merge sort — what changes when the input doesn't fit in memory?**

A: External merge sort streams data through buffer-sized chunks. Read a buffer-full, sort it in memory (any internal algorithm), write it to a temp file. Repeat for all chunks. Then k-way merge the temp files, reading the head of each, writing the smallest to the output, refilling that file's buffer. This is how `sort -m` works on Unix and how database query engines sort billion-row datasets. The algorithm shape doesn't change; the I/O strategy does.

```
External merge sort:
  Phase 1: read chunk → in-memory sort → write to temp
  Phase 2: k-way merge from k temp files → output
            (priority queue holds head of each file)
```

### The question candidates always dodge

**Q: Why is merge sort the only "easy to parallelise" sort?**

A: It's not the only one, but it's the cleanest. The split phase has zero dependencies between halves — you can dispatch them to different threads. The merge phase has more inter-process coordination (k-way merge across threads), but it's still simpler than quick sort's partition (which depends on a pivot that needs to be agreed on across threads). Parallel quick sort exists but the speedup curve isn't as flat. Heap sort isn't naturally parallel at all — the heap operations are inherently sequential.

```
Merge sort parallel:                Quick sort parallel:
  split → 2 threads → merge          partition (1 thread) → 2 threads
  perfect 2× speedup at log n        partition is the bottleneck
```

### One-line anchors

- "Split, recurse, merge."
- "T(n) = 2T(n/2) + O(n) → O(n log n)."
- "Guaranteed worst case; O(n) memory cost."
- "TimSort uses merge sort for production reasons."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the recursion tree for `[8, 3, 6, 1, 7, 2, 5, 4]`.

### Level 2 — Explain it out loud
"How does merge sort achieve O(n log n)?" Under 60 seconds.

### Level 3 — Apply it to a new scenario
"You have 10 sorted lists of 1000 elements each. What's the cheapest way to combine them into one sorted list?"

(Hint: k-way merge with a priority queue is O(n log k).)

### Level 4 — Defend the decision you'd change
"Would you use merge sort or quick sort to sort a 10GB log file on a server with 4GB RAM?"

### Quick check
- File? → `src/app/sorting/merge-sort/page.tsx`.
- Complexity? → O(n log n) all cases.
- Extra space? → O(n).

✓ Pass: all three.
