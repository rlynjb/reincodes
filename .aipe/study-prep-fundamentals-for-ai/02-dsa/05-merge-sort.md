# Merge sort

**Industry name(s):** Merge sort, mergesort
**Type:** Industry standard · Language-agnostic

> Divide the array in half recursively, sort each half, merge the two sorted halves into one — O(n log n) every time, stable, at the cost of O(n) auxiliary memory.

**See also:** → 03-insertion-sort.md · → 06-quick-sort.md · → 07-heap-sort.md

---

## Why care

You've got an array of 50 bars on the page — `[23, 7, 41, 12, 55, ...]` — and you've watched bubble sort, insertion sort, and selection sort each grind through it in O(n²) steps. Every one of them is doing the same thing: comparing pairs in a single flat array, hoping the right adjacency exists. Now imagine a different shape: split the array in half. Sort the left half. Sort the right half. Now you have two sorted lists. Walk down both with two pointers, picking the smaller front element each time, and you've built a sorted whole.

That "split, sort each half, merge them" routine is what *merge sort* does. The trick is the recursion: to sort each half, you split *those* in half and merge *those*. All the way down to single-element arrays (which are trivially sorted), then unwind the recursion, merging pairs of size 1 into pairs of size 2, into pairs of size 4, into pairs of size 8, until the whole array is sorted.

**Why you need to answer that question at all:** because merge sort is the first algorithm in this section that doesn't have a quadratic worst case. It's O(n log n) on sorted input, O(n log n) on reverse-sorted input, O(n log n) on adversarial input designed to break every other sort. That predictability is the entire reason it ships in production codebases for situations that demand worst-case bounds — sorting linked lists, sorting on-disk data, sorting where stability matters (TimSort uses it for the merge phase). If a server-side job needs to sort 10 million records and guarantee a max latency, merge sort is the safe answer.

Without understanding merge sort:
- "Divide and conquer" is a vague phrase
- O(n log n) is a tag, not a shape
- Stability vs in-place tradeoffs read as arbitrary preferences

With it:
- Divide and conquer becomes a concrete recursion tree with `log n` depth and `n` work per level
- O(n log n) is the area of an `n × log n` rectangle: every level does O(n) merging, there are `log n` levels
- Stability is preserved by the merge step's "left wins on ties" rule; the cost is O(n) auxiliary space for the merge buffer

Merge sort is `[a, b].sort()` for two already-sorted arrays, generalised — except instead of calling it once, you call it `log n` times across a recursion tree.

---

## How it works

**The mental model: a binary tree of recursive splits with a bottom-up merge that pairs sorted halves back together.**

You've already built half of this pattern. When you write a React tree-traversal — `Component → children → child.children → leaf` — you've expressed a recursive structure that bottoms out at leaves. Merge sort does the same: the recursion bottoms out at single-element arrays, then on the way back up, each parent call merges the two sorted children it just got back. The "sort" happens entirely in the merge step; the recursion is just bookkeeping that hands the merge step a guaranteed-sorted left and right.

```
the recursion tree for [23, 7, 41, 12, 55, 18]:

                        [23, 7, 41, 12, 55, 18]
                                 │ divide
                ┌────────────────┴────────────────┐
                ▼                                 ▼
        [23, 7, 41]                       [12, 55, 18]
            │ divide                          │ divide
       ┌────┴────┐                       ┌────┴────┐
       ▼         ▼                       ▼         ▼
    [23, 7]    [41]                   [12, 55]    [18]
       │ divide                          │ divide
   ┌───┴───┐                         ┌───┴───┐
   ▼       ▼                         ▼       ▼
  [23]    [7]                       [12]    [55]
   │  merge │                         │  merge │
   └────┬───┘                         └────┬───┘
        ▼                                  ▼
      [7, 23]                            [12, 55]
        │                                  │
        │  merge with [41]                 │  merge with [18]
        ▼                                  ▼
      [7, 23, 41]                        [12, 18, 55]
        │                                  │
        └──────────────┬───────────────────┘
                       │ merge
                       ▼
              [7, 12, 18, 23, 41, 55]
```

The strategy: keep dividing until you have arrays of length 1 (trivially sorted). Then merge pairs back up the tree. Every merge takes two sorted inputs and produces one sorted output.

### The divide step — recursion to the base case

The outer recursion is structural. Given `bars` and a range `[start, end]`, compute `mid = start + floor((end - start) / 2)`, recurse on `[start, mid]` and `[mid + 1, end]`. Stop when `start === end` (one-element slice, trivially sorted).

```
divide step:
┌────────────────────────────────────┐
│ if start === end:                  │
│   return [bars[start]]    ← leaf   │
│                                    │
│ mid = start + (end - start) / 2    │
│ left  = divide(bars, start, mid)   │
│ right = divide(bars, mid+1, end)   │
│ return combine(left, right, mid)   │
└────────────────────────────────────┘
```

The bridge from what you know. In React you write recursive components — `Tree → TreeNode → TreeNode.children.map(child => <Tree node={child} />)`. The recursion bottoms out at leaves where there are no children. Merge sort's recursion is the same shape, with single-element slices as the leaves.

The practical consequence: depth of recursion is `log₂(n)`. For n = 1024, that's 10 levels. For n = 10⁶, that's 20 levels. The call stack stays shallow — no stack overflow risk at any practical size.

### The merge step — two pointers walking sorted halves

The merge step is where the actual sorting work happens. Given two sorted arrays `left` and `right`, allocate an output array `merged_aux` of size `left.length + right.length`. Maintain pointers `i` (into `left`) and `j` (into `right`). At each step, compare `left[i]` and `right[j]`; push the smaller one into `merged_aux` and advance its pointer. When one side is exhausted, drain the rest of the other side.

```
merge step:
[7, 23]  +  [12, 55]
 i=0          j=0

  compare left[0]=7  vs right[0]=12  →  7 wins  → merged=[7]      i=1
  compare left[1]=23 vs right[0]=12  →  12 wins → merged=[7,12]   j=1
  compare left[1]=23 vs right[1]=55  →  23 wins → merged=[7,12,23] i=2
  left exhausted → drain right       →  merged=[7,12,23,55]
```

The bridge from what you know. This is exactly what you do mentally when merging two already-sorted to-do lists. You don't re-sort each one; you walk down both with your finger and pick the smaller next item each time.

The practical consequence: the merge step does O(n) comparisons (where n = `left.length + right.length`). It's the only part of merge sort that does real work — the divide step is bookkeeping.

### The stable-merge rule — "left wins on ties"

Notice the comparison `if (left[i] < right[j])` — strictly less than. When `left[i] === right[j]`, the rule defaults to `right[j]` going next. Wait — that breaks stability. The stable version uses `if (left[i] <= right[j])`, which means equal-key items from the left half are emitted before equal-key items from the right half. Since the left half's items came from an earlier index range in the original array, the relative order of equal keys is preserved.

```
input: [5a, 3, 5b, 1]   (a/b track relative order of equal keys)

stable merge (left wins on ties):
  after divide: left=[3, 5a],  right=[1, 5b]
  merge step:
    left[0]=3 vs right[0]=1   → 1 wins  → [1]
    left[0]=3 vs right[1]=5b  → 3 wins  → [1, 3]
    left[1]=5a vs right[1]=5b → 5a wins (LE) → [1, 3, 5a]
    drain right: → [1, 3, 5a, 5b]
                            ↑
                  5a comes before 5b — stable ✓

unstable merge (right wins on ties):
  left[1]=5a vs right[1]=5b → 5b wins (strict LT fails)
  result: [1, 3, 5b, 5a]  ← order reversed
```

The codebase's `combine` function uses `<` (strict), which is *not* stable. For integer arrays with no secondary key this doesn't matter; for any real-world workload that depends on stability, the comparator must be `<=`.

### The principle

Merge sort is the canonical *divide and conquer*. The problem of size `n` is split into two problems of size `n/2`, solved recursively, and the results combined. The recursion gives you the `log n` factor (depth of the tree). The merge gives you the `n` factor (work per level). Multiply: O(n log n). The same recurrence shape — T(n) = 2·T(n/2) + O(n) — appears in many places: fast Fourier transform, closest-pair-of-points, Karatsuba multiplication. Once you've internalised one example, the rest pattern-match.

The full picture is below.

---

## Merge sort — diagram

```
                  bars = [23, 7, 41, 12, 55, 18]
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ divide(bars, start, end)         │
                  │   if start === end:              │
                  │     return [bars[start]]         │
                  │                                  │
                  │   mid = start + (end-start)/2    │
                  │   left  = divide(bars, start,    │
                  │                       mid)       │
                  │   right = divide(bars, mid+1,    │
                  │                       end)       │
                  │   return combine(left, right,    │
                  │                  mid)            │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ combine(left, right, midIndex)   │
                  │   i = j = 0                      │
                  │   merged_aux = []                │
                  │                                  │
                  │   while i<left.len & j<right.len:│
                  │     if left[i] < right[j]:       │
                  │       push left[i]; i++          │
                  │     else:                        │
                  │       push right[j]; j++         │
                  │                                  │
                  │   drain remaining of either side │
                  │                                  │
                  │   updateOriginalArray(midIndex,  │
                  │     left.len, right.len,         │
                  │     merged_aux)                  │
                  │   return merged_aux              │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ updateOriginalArray:             │
                  │   startIndex = midIndex -        │
                  │                (leftSize - 1)    │
                  │   endIndex   = midIndex +        │
                  │                 rightSize        │
                  │   for i = startIndex..endIndex:  │
                  │     setBars(prev => splice in)   │
                  │     await delayLoop(100)         │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ bars = [7, 12, 18, 23, 41, 55]   │
                  └──────────────────────────────────┘
```

---

## In this codebase

**File:** `src/app/sorting/merge-sort/page.tsx`
**Functions:** `mergeSort` (outer kickoff, L53), `divide` (L56), `combine` (L67), `updateOriginalArray` (L112)
**Line range:** L53–L156

The shape, trimmed:

```
const mergeSort = () => {
  if (bars.length === 0) return;

  const divide = async (A, start, end) => {
    if (A.length === 0) return;
    if (start === end) return [A[start]];

    const midIndex = start + Math.floor((end - start) / 2);
    const left  = await divide(A, start, midIndex);
    const right = await divide(A, midIndex + 1, end);

    return await combine(left, right, midIndex);
  }

  const combine = async (left = [], right = [], midIndex) => {
    let i = 0, j = 0;
    const merged_aux = [];

    while (i < left.length && j < right.length) {
      if (left[i] < right[j]) { merged_aux.push(left[i]); i++; }
      else                    { merged_aux.push(right[j]); j++; }
    }
    while (i < left.length)  { merged_aux.push(left[i]); i++; }
    while (j < right.length) { merged_aux.push(right[j]); j++; }

    await updateOriginalArray(midIndex, left.length, right.length, merged_aux);
    return merged_aux;
  }

  divide(bars, 0, bars.length - 1);
}
```

**Called from:** `useEffect` at L159–L163, which runs `mergeSort()` on mount.

**The `updateOriginalArray` step** (L112–L156) is the animation glue. The recursion in `divide`/`combine` produces sorted sub-arrays purely in local variables (`left`, `right`, `merged_aux`); the React state `bars` is never updated by them directly. Instead, after each `combine` finishes, `updateOriginalArray` walks the merged range in `bars` and rewrites it slot-by-slot, calling `await delayLoop(100)` between writes so the user sees the merged region update one bar at a time.

```
animation timing:

combine returns merged_aux = [7, 12, 18]
                  for the range bars[0..2]
↓
updateOriginalArray(midIndex=1, leftSize=2, rightSize=1, merged_aux):
  startIndex = 1 - (2-1) = 0
  endIndex   = 1 + 1     = 2
  for i = 0..2:
    setBars(prev => prev with prev[i] = merged_aux.shift())
    await delayLoop(100)
↓
React renders bars[0]=7, then bars[1]=12, then bars[2]=18,
each with 100ms pause between
```

**Visualizer hooks:**
- `highlightIndices` (state, L50) — the range `[startIndex..endIndex]` of the merged region.
- `scanIndices` (state, L51) — the current slot being written.
- The `await delayLoop(100)` in `updateOriginalArray` is hard-coded — speed control via `setSpeed` doesn't apply here. A small inconsistency with the other sorts.

**Header complexity claim (L171):** `O(n log n) best/avg/best case` — typo (best twice), but the meaning is clear: O(n log n) on every input shape.

---

## Elaborate

### Where this pattern comes from

Merge sort was invented by John von Neumann in 1945 — one of the first non-trivial algorithms in published computer science. He designed it to solve external sorting (sorting data larger than RAM): split the input across multiple tape drives, sort each chunk in memory, then merge the chunks back into one. The "external merge sort" pattern still ships in modern database engines for sorts that don't fit in RAM (Postgres uses it; SQLite uses it).

### The deeper principle

*Divide and conquer with linear combine.* The recurrence T(n) = 2·T(n/2) + O(n) is the canonical D&C shape — split into two halves, solve recursively, combine in linear time. By the Master Theorem, this resolves to O(n log n). The same recurrence describes the Fast Fourier Transform, Karatsuba multiplication, closest-pair-of-points geometry, and many other algorithms. Internalize merge sort's shape and the rest pattern-match.

```
the universal D&C visual:

  n        →           merge step does O(n) work
  ├── n/2  →           merge step does O(n/2 + n/2) = O(n)
  │   ├── n/4 ─┐
  │   └── n/4 ─┤
  ├── n/2  ────┤    each level does O(n) total
  │   ├── n/4  │    log n levels deep
  │   └── n/4  │
  ...          ┘    grand total: O(n) × log n = O(n log n)
```

### Where this breaks down

O(n) auxiliary space. Merge sort's stable, predictable runtime comes at the cost of a temporary buffer the size of the input. For 1 MB of integers this is invisible; for 100 GB of records on a server with 16 GB of RAM, it's catastrophic — you can't merge sort the whole thing in RAM. The fix is external merge sort (split, sort chunks to disk, merge from disk), which is what databases do.

In-place merge sort variants exist (Pratt 1971, Kronrod 1969) but their constant factors are 2–3× worse than the standard implementation. The Wikipedia "in-place merge sort" entry exists for completeness; almost no one actually ships it.

### What to explore next

- Quick sort → divide and conquer with in-place partition; O(n log n) average, O(n²) worst (see `06-quick-sort.md`).
- Heap sort → upgrade selection sort by using a heap; O(n log n) always, O(1) space, but not stable (see `07-heap-sort.md`).
- TimSort → V8/Python production sort; uses merge sort for large runs + insertion sort for small runs.
- External merge sort → how databases sort on-disk data larger than RAM.
- The Master Theorem → the general framework for solving D&C recurrences.

---

## How it works — brute force vs optimal

### The data

```
bars: number[] of length n
range: [1, 60] from generateArrayOfRandomNumbers
example: [23, 7, 41, 12, 55, 18]
```

### The problem

Sort `bars` ascending with O(n log n) worst-case time and stable order, accepting O(n) auxiliary memory.

### ── Brute force (run insertion sort) ──

To compare against, treat the O(n²) algorithms (insertion sort) as the "brute force" baseline for getting a sorted array. The brute force solves the problem; merge sort solves it with the same correctness but better worst-case complexity.

**Pseudocode:**

```
for i from 0 to n-1:
    temp = bars[i]
    red = i - 1
    while red >= 0 and bars[red] > temp:
        bars[red+1] = bars[red]
        red--
    bars[red+1] = temp
```

**Complexity:** O(n²) time worst case, O(n) best case · O(1) space

**What goes wrong at scale:** at n = 10,000 random input, insertion sort does ~25 million shifts (~125ms in V8). At n = 1,000,000, it's ~250 billion shifts (~20 minutes). Merge sort's O(n log n) at the same sizes: ~140,000 comparisons (n = 10k) and ~20 million (n = 1M) — under a second.

### ── Optimal (merge sort with linear combine) ──

**The insight:** insertion sort treats the array as one flat region and shifts elements one slot at a time. Merge sort observes that two *already-sorted* halves can be combined in O(n) with two pointers — way faster than O(n²) "merge by repeated insertion." Recursion gets you the sorted halves; the merge step is the new primitive.

**Pseudocode:**

```
divide(arr, start, end):
    if start === end:
        return [arr[start]]
    mid = start + (end - start) / 2
    left  = divide(arr, start, mid)
    right = divide(arr, mid + 1, end)
    return combine(left, right)

combine(left, right):
    i = j = 0
    merged = []
    while i < left.len and j < right.len:
        if left[i] < right[j]:
            merged.push(left[i]); i++
        else:
            merged.push(right[j]); j++
    while i < left.len: merged.push(left[i]); i++
    while j < right.len: merged.push(right[j]); j++
    return merged
```

**Execution trace** — `bars = [23, 7, 41, 12, 55, 18]`, n = 6:

```
divide(bars, 0, 5):
  midIndex = 0 + 2 = 2

  divide(bars, 0, 2):
    midIndex = 0 + 1 = 1

    divide(bars, 0, 1):
      midIndex = 0 + 0 = 0
      divide(bars, 0, 0) → return [23]      (leaf)
      divide(bars, 1, 1) → return [7]       (leaf)
      combine([23], [7]):
        i=0, j=0: 23 < 7? no → push 7,  j=1
        right exhausted; drain left: push 23
        merged_aux = [7, 23]
        updateOriginalArray(midIndex=0, leftSize=1, rightSize=1, [7, 23]):
          startIndex = 0 - 0 = 0, endIndex = 0 + 1 = 1
          bars[0] = 7, bars[1] = 23
        return [7, 23]

    divide(bars, 2, 2) → return [41]        (leaf)
    combine([7, 23], [41]):
      i=0, j=0: 7 < 41? yes → push 7, i=1
      i=1, j=0: 23 < 41? yes → push 23, i=2
      left exhausted; drain right: push 41
      merged_aux = [7, 23, 41]
      updateOriginalArray(midIndex=1, leftSize=2, rightSize=1, [7,23,41]):
        startIndex = 1 - 1 = 0, endIndex = 1 + 1 = 2
        bars[0..2] = [7, 23, 41]
      return [7, 23, 41]

  divide(bars, 3, 5):
    midIndex = 3 + 1 = 4

    divide(bars, 3, 4):
      midIndex = 3 + 0 = 3
      divide(bars, 3, 3) → return [12]      (leaf)
      divide(bars, 4, 4) → return [55]      (leaf)
      combine([12], [55]):
        12 < 55 → push 12
        drain right: push 55
        merged_aux = [12, 55]
        updateOriginalArray(midIndex=3, leftSize=1, rightSize=1, [12,55]):
          startIndex = 3, endIndex = 4
          bars[3] = 12, bars[4] = 55
        return [12, 55]

    divide(bars, 5, 5) → return [18]        (leaf)
    combine([12, 55], [18]):
      i=0, j=0: 12 < 18 → push 12, i=1
      i=1, j=0: 55 < 18? no → push 18, j=1
      right exhausted; drain left: push 55
      merged_aux = [12, 18, 55]
      updateOriginalArray(midIndex=4, leftSize=2, rightSize=1, [12,18,55]):
        startIndex = 4 - 1 = 3, endIndex = 4 + 1 = 5
        bars[3..5] = [12, 18, 55]
      return [12, 18, 55]

  combine([7, 23, 41], [12, 18, 55]):
    i=0, j=0: 7 < 12 → push 7, i=1
    i=1, j=0: 23 < 12? no → push 12, j=1
    i=1, j=1: 23 < 18? no → push 18, j=2
    i=1, j=2: 23 < 55 → push 23, i=2
    i=2, j=2: 41 < 55 → push 41, i=3
    left exhausted; drain right: push 55
    merged_aux = [7, 12, 18, 23, 41, 55]
    updateOriginalArray(midIndex=2, leftSize=3, rightSize=3, [7,12,18,23,41,55]):
      startIndex = 2 - 2 = 0, endIndex = 2 + 3 = 5
      bars[0..5] = [7, 12, 18, 23, 41, 55]
    return [7, 12, 18, 23, 41, 55]
```

Variable state at the end of each combine:

```
combine call            | merged_aux             | bars after updateOriginalArray
────────────────────────┼────────────────────────┼──────────────────────────────
combine([23],[7])       | [7, 23]                | [7, 23, 41, 12, 55, 18]
combine([7,23],[41])    | [7, 23, 41]            | [7, 23, 41, 12, 55, 18]
combine([12],[55])      | [12, 55]               | [7, 23, 41, 12, 55, 18]
combine([12,55],[18])   | [12, 18, 55]           | [7, 23, 41, 12, 18, 55]
combine(left, right)    | [7,12,18,23,41,55]     | [7, 12, 18, 23, 41, 55] ✓
```

**Complexity:** O(n log n) time worst/avg/best case · O(n) auxiliary space

**Why it's faster:** the recursion divides the problem into 2^k sub-problems of size n/2^k at depth k. Total comparisons across all merges at any one depth: O(n). Depth: log₂(n). Grand total: O(n log n). The brute force's O(n²) becomes O(n log n) because each level of the recursion does linear work, not quadratic.

### ── Comparison ──

```
┌─────────────────┬───────────────────┬──────────────────────┐
│                 │ Insertion sort    │ Merge sort           │
│                 │ (brute force)     │ (optimal)            │
├─────────────────┼───────────────────┼──────────────────────┤
│ Worst time      │ O(n²)             │ O(n log n)           │
│ Avg time        │ O(n²)             │ O(n log n)           │
│ Best time       │ O(n)              │ O(n log n)           │
│ Space           │ O(1)              │ O(n) auxiliary       │
│ Stable          │ yes               │ yes (with `<=`)      │
│ In-place        │ yes               │ no                   │
│ At n=50         │ ~625 ops          │ ~282 ops             │
│ At n=10k        │ ~25M ops          │ ~133k ops            │
│ At n=1M         │ ~250B ops         │ ~20M ops             │
│                 │ (20 min in V8)    │ (< 1 sec)            │
└─────────────────┴───────────────────┴──────────────────────┘
```

**When brute force is fine:** insertion sort beats merge sort on small inputs (n ≤ ~32) because merge sort's recursion + auxiliary allocation has constant-factor overhead that insertion sort doesn't pay. This is exactly why TimSort uses insertion sort for runs < 32 and merge sort for runs ≥ 32.

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬───────────────────────┬───────────────────────┐
│ Cost dimension   │ Merge sort            │ Quick sort            │
├──────────────────┼───────────────────────┼───────────────────────┤
│ Time worst       │ O(n log n)            │ O(n²)                 │
│ Time avg         │ O(n log n)            │ O(n log n)            │
│ Time best        │ O(n log n)            │ O(n log n)            │
│ Space            │ O(n) auxiliary        │ O(log n) recursion    │
│ Stable           │ yes                   │ no                    │
│ In-place         │ no                    │ yes                   │
│ Cache locality   │ poor (alloc per merge)│ excellent (partition) │
│ Adversarial      │ immune                │ degrades to O(n²)     │
│                  │                       │ without randomization │
│ Used in          │ TimSort merge phase   │ V8 sort (pre-TimSort) │
└──────────────────┴───────────────────────┴───────────────────────┘
```

### Sub-block 1 — what we gave up

O(n) auxiliary memory. Every merge allocates a new `merged_aux` array. At n = 1 million, that's ~8 MB of int32s allocated, freed, allocated, freed across every level of the recursion. The garbage collector has work to do. Compare to quick sort, which partitions in-place and uses only O(log n) stack space.

The codebase implementation goes further: the `updateOriginalArray` function rewrites the `bars` state slot-by-slot after every merge, calling `await delayLoop(100)` between writes. This means n total React state updates per merge, n total awaits per merge — the animation overhead is O(n²) total even though the algorithm is O(n log n). For 50 bars × ~6 levels × ~50 slots = ~3000 React state updates per sort run, with 100ms between each = 5 minutes of animation. A real production merge sort would skip the per-slot animation entirely.

### Sub-block 2 — what the alternative would have cost

If the visualizer used quick sort, the auxiliary memory disappears (O(log n) stack vs O(n) buffer), the animation becomes in-place (no `updateOriginalArray` glue), and the average runtime is faster by a constant factor. But quick sort's O(n²) worst case appears on adversarial inputs (sorted, all-equal) — for a random visualizer this is rare but possible. And quick sort isn't stable, so any future "sort objects by primary then secondary key" workload would need rewriting.

If the visualizer used heap sort, the memory drops to O(1) and the time stays O(n log n) — strictly better on two dimensions. The cost is no stability (heap sort isn't stable) and worse constant factor (~2× slower than merge sort in practice due to non-sequential memory access).

### Sub-block 3 — the breakpoint

Merge sort is the right choice when (a) worst-case latency must be bounded — financial systems, real-time pipelines, anything with SLAs; (b) stability matters — sorting objects by secondary keys, sorting UI rows that the user has previously rearranged; or (c) data size exceeds RAM and external merge sort is needed.

It's the wrong choice when (a) data fits in cache and you want raw speed — quick sort wins; or (b) memory is constrained — heap sort wins.

For the visualizer specifically: merge sort is the right choice because it's the first algorithm in the section that introduces divide-and-conquer, recursion trees, and O(n log n). The pedagogical value outweighs the implementation cost.

### Sub-block 4 — what wasn't actually a tradeoff

In-place merge sort variants (Kronrod 1969, Pratt 1971) were not real alternatives. They exist as algorithmic curiosities but have 2–3× the constant factor of standard merge sort and aren't shipped in any major library. The "you can have stable + O(n log n) + O(1) space" claim is technically true but practically false — the implementations are too slow to use.

---

## Tech reference (industry pairing)

### Recursion + closure (JavaScript)

- **Codebase uses:** `divide` and `combine` are nested `async` functions inside `mergeSort` at `src/app/sorting/merge-sort/page.tsx` L56–L99. They close over `setHighlightIndices`, `setScanIndices`, `setBars`, `speed`.
- **Why it's here:** recursion is the natural way to express the divide step; closures let the recursive helpers access React state setters without prop-drilling.
- **Leading today:** named function declarations inside the component — adoption-leading idiom in React for closure-captured recursion, 2026.
- **Why it leads:** simple to reason about, no extra files, the closure capture is automatic — the cost is re-creating the function on every render (negligible here, since it only runs once).
- **Runner-up:** `useCallback`-wrapped functions or extracting to module-level helpers with explicit dependency injection — both common in larger codebases but overkill for a single-call recursive sort.

### Array.prototype.shift (used in updateOriginalArray)

- **Codebase uses:** `copyCombineArray.shift()` at `src/app/sorting/merge-sort/page.tsx` L141 — pops the first element of the merged array for slot-by-slot animation.
- **Why it's here:** the simplest way to dequeue from the merged-aux array as the animation walks the destination range.
- **Leading today:** `Array.prototype.shift` — adoption-leading for FIFO dequeue, 2026.
- **Why it leads:** ubiquitous, idiomatic, available since ES1. V8 implements it as O(n) (re-indexes the array), but for arrays under ~1000 elements the constant is negligible.
- **Runner-up:** index-based traversal (`const item = arr[i++]`) — innovation-leading on perf-critical hot paths because it avoids the O(n) re-index, but reads less clearly than `shift()`.

---

## Summary

Merge sort divides the array in half recursively until single-element slices, then merges sorted pairs back up the recursion tree using a linear-time two-pointer walk. In this codebase it lives in `src/app/sorting/merge-sort/page.tsx` L53–L156, with `divide` and `combine` as nested async functions producing sorted `merged_aux` arrays, and a separate `updateOriginalArray` writing slot-by-slot into the React `bars` state with `await delayLoop(100)` between writes. The constraint that made it the right call here is O(n log n) worst-case predictability — every input shape sorts in the same time, no quadratic surprises. The cost is O(n) auxiliary memory (every merge allocates a buffer) and a more complex animation glue (the `updateOriginalArray` step) because the sort doesn't mutate `bars` directly.

- Divide step: recursive bisection, depth O(log n), no real "sort" work happens here.
- Merge step: two pointers walking sorted halves; this is where the O(n) per level comes from.
- Stable with `<=` ("left wins on ties"); the codebase uses `<` (strict), which is NOT stable — equal keys can reorder.
- O(n log n) every time — best, average, worst — no input shape produces quadratic behavior.
- O(n) auxiliary memory is the cost paid for predictability; in-place variants exist but are 2–3× slower in practice.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about merge sort, they're testing whether you understand divide and conquer as a recurrence (T(n) = 2T(n/2) + O(n)) and whether you can name the tradeoffs that distinguish it from quick sort and heap sort. A weak answer recites "O(n log n) divide and conquer." A strong answer names the O(n) auxiliary memory cost, the stability property, the external-sort generalization, and at least one place merge sort ships in production (TimSort, on-disk DB sorts).

### Likely questions

[mid] Q: Walk me through merge sort on `[5, 2, 4, 6, 1, 3]`.

A: Recursive bisection bottoms out at single-element arrays. The recursion tree: `[5,2,4]` and `[6,1,3]` at level 1; `[5,2]+[4]` and `[6,1]+[3]` at level 2; singletons at level 3. Then merge back up: `[5]+[2] = [2,5]`; `[2,5]+[4] = [2,4,5]`; `[6]+[1] = [1,6]`; `[1,6]+[3] = [1,3,6]`; finally `[2,4,5]+[1,3,6] = [1,2,3,4,5,6]`. The merge step is two pointers, picking the smaller front element each time.

Diagram:
```
                [5, 2, 4, 6, 1, 3]
                       │
        ┌──────────────┴──────────────┐
   [5, 2, 4]                     [6, 1, 3]
        │                             │
   ┌────┴────┐                   ┌────┴────┐
  [5,2]    [4]                  [6,1]    [3]
   │                              │
   merges bottom-up:
   [5,2] → [2,5]                [6,1] → [1,6]
   [2,5]+[4] → [2,4,5]          [1,6]+[3] → [1,3,6]
                       │
   [2,4,5] + [1,3,6] → [1,2,3,4,5,6]
```

[senior] Q: Why O(n log n) regardless of input?

A: Two reasons combined. First, the divide step always bisects evenly — depth is `log₂(n)` regardless of values. Second, the merge step at any level does O(n) total work (across all sub-merges at that level, the total elements processed equals `n`). Multiply: `n × log n`. Sorted input, reverse input, adversarial input — they all hit the same `log n` depth and the same `O(n)` per-level work. Compare quick sort, where partition imbalance on sorted input gives O(n²) — merge sort is immune to that because it bisects on index, not value.

Diagram:
```
Recursion shape (n = 8):

depth 0:    [_ _ _ _ _ _ _ _]   merge step here: 8 elements
                │
depth 1: [_ _ _ _] | [_ _ _ _]   merge step here: 4 + 4 = 8
                │
depth 2: [_ _] [_ _] | [_ _] [_ _]   merge: 2+2+2+2 = 8
                │
depth 3: singletons                merge: 1+1+1+1+1+1+1+1 = 8

  every level: O(n) merge work
  log₂(n) levels
  total: O(n × log n)
```

[arch] Q: I'm building a server-side job that sorts 100 GB of records. RAM available is 16 GB. Which sort?

A: External merge sort, which is merge sort generalized for data larger than RAM. Phase 1: read 16 GB chunks into memory, sort each in-memory (TimSort), write back to disk. Phase 2: merge the sorted chunks N-ways using a heap — keep N file handles open, take the smallest current front element across all chunks. The "merge" is the same two-pointer (or k-pointer) idea as merge sort's inner step, just reading from disk instead of arrays. Postgres and SQLite both implement this for ORDER BY queries that don't fit in `work_mem`. Quick sort and heap sort can't do this — they assume the data fits in RAM.

Diagram:
```
External merge sort, 100 GB / 16 GB RAM:

Phase 1: chunk-sort (7 chunks of ~14 GB)
  read chunk1 → sort in RAM → write sorted1.tmp
  read chunk2 → sort in RAM → write sorted2.tmp
  ...
  read chunk7 → sort in RAM → write sorted7.tmp

Phase 2: k-way merge (k = 7)
  open all 7 sorted files
  maintain a min-heap of (currentValue, fileIdx)
  pop min, write to output, advance fileIdx's pointer
  repeat until all files drained

  RAM use: 7 buffered reads + heap of 7 entries — well under 16 GB
```

### The question candidates always dodge

Q: Merge sort needs O(n) auxiliary memory. Quick sort doesn't. Why would I ever pick merge sort if I can get O(n log n) average with quick sort and pay only O(log n) recursion stack?

A: For three reasons that quick sort can't match. First, worst-case guarantee: quick sort can degrade to O(n²) on adversarial or pathological inputs; merge sort cannot. If you're sorting user-controlled data (search query results, sort-by-column tables in a SaaS app) where an attacker can shape the input, you'd rather have a guaranteed bound than an average-case promise. Second, stability: merge sort is stable; quick sort isn't. If you're sorting objects by a secondary key while preserving primary-key order, merge sort gets it right by default. Third, external sorting: merge sort generalizes to data larger than RAM; quick sort doesn't. That's why every database engine uses external merge sort for big ORDER BY operations, and why TimSort (which is mostly merge sort with insertion sort for small runs) won out in V8, Python, Java, and Rust standard libraries. The O(n) memory cost is the price of those three properties, and it's the right price most of the time. Quick sort wins in tight memory budgets with trusted inputs — a narrower window than people think.

Diagram:
```
What we picked (merge sort)          What quick sort offers
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ time:       O(n log n) always│    │ time:       O(n log n) avg   │
│ space:      O(n) auxiliary   │    │ time:       O(n²) worst      │
│ stable:     yes              │    │ space:      O(log n) stack   │
│ external:   yes              │    │ stable:     no               │
└──────────────────────────────┘    │ external:   no               │
                                    └──────────────────────────────┘
   ship for: SLA-bound, stable-      ship for: in-memory, trusted-
   sort-needed, or large-than-RAM    input, perf-critical hot loops
```

### One-line anchors

- "Merge sort: O(n log n) every time, stable, O(n) auxiliary memory — the predictable choice."
- "The recurrence T(n) = 2T(n/2) + O(n) is the canonical D&C shape; merge sort is its sorting incarnation."
- "Stable iff the merge step uses `<=` (left wins on ties); strict `<` makes it unstable."
- "Used in TimSort's merge phase, in every database engine's external sort, and in Java's `Arrays.sort` on objects."
- "Quick sort beats it in cache locality and memory; merge sort beats it in worst-case bound and stability."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the merge-sort recursion tree for an array of length 6. Label each leaf, each merge step, and the order in which merges fire (bottom-up, left subtree first).

Open the file. Check:
- Did you show single-element leaves at the bottom?
- Did you draw the merge as a two-pointer walk producing a sorted output?
- Did you label the levels as `log₂(n)` deep?
- Did you note that each level does O(n) total work?

### Level 2 — Explain it out loud

Explain merge sort to a colleague who asked "why does V8 use it instead of quick sort?" No notes. Under 90 seconds.

Checkpoints:
- Did you reference `src/app/sorting/merge-sort/page.tsx` L53–L156?
- Did you name the O(n log n) worst-case guarantee?
- Did you name stability as a load-bearing property for production sorts?
- Did you mention the O(n) auxiliary memory cost?

### Level 3 — Apply it to a new scenario

You're building a search-results table where users can click column headers to sort. The user has previously sorted by `created_at` descending and now clicks `priority` ascending. They expect the secondary order (creation time within the same priority) to be preserved. Which property of merge sort makes this work, and which property of quick sort would break it? Reference `src/app/sorting/merge-sort/page.tsx` L72 (the comparator).

Write your answer in 3–5 sentences. Then verify: the strict `<` comparator at L72 is unstable. To preserve secondary order, the codebase would need to change the comparator to `<=`. Quick sort's partition step inherently swaps equal-key elements across the pivot boundary — no comparator change can fix that.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the codebase's `combine` function uses `<` instead of `<=`, which makes the implementation NOT stable. If you were starting today and the visualizer would later be repurposed to sort objects by primary/secondary keys, would you fix the comparator? What other change would you make to expose the stability property visually?

Reference `src/app/sorting/merge-sort/page.tsx` L72 to support your answer.

### Quick check — code reference test

Without opening any files:
- What file does the implementation live in?
- What are the three inner functions inside `mergeSort`?
- What's the auxiliary memory complexity?

Open and verify.

Pass: you named `src/app/sorting/merge-sort/page.tsx`, `divide` / `combine` / `updateOriginalArray`, and O(n).
Fail on memory complexity: re-read the merge step at L67–L99 — every call allocates a new `merged_aux` array, so the peak total auxiliary memory is O(n).
