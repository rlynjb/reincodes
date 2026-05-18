# Quick sort

**Industry name(s):** Quicksort, partition-exchange sort
**Type:** Industry standard · Language-agnostic

> Pick a pivot, partition the array so everything less-than sits left and everything greater-than sits right, recurse on each side — O(n log n) average, O(n²) on adversarial input without randomization.

**See also:** → 05-merge-sort.md · → 07-heap-sort.md · → 03-insertion-sort.md

---

## Why care

You've got an array of 50 bars on the page — `[23, 7, 41, 12, 55, ...]` — and you've watched merge sort solve it predictably in O(n log n) but with O(n) auxiliary buffer allocations on every recursion level. Now imagine a different shape: pick one element as a *pivot* (say, 23). Walk the rest of the array. Push everything smaller than 23 to its left. Push everything bigger to its right. Now 23 sits in its final sorted position, with all-smaller on one side and all-bigger on the other. Recurse on each side. Done.

That "pick-pivot, partition-around-it" routine is what *quick sort* does. The radical idea is doing the work *in place* — no auxiliary buffer, no allocation on every recursion. The pivot's final position is determined in one pass. Then you recurse on the two halves, but the halves are just index ranges in the same array. The whole sort happens with O(log n) recursion stack and nothing else.

**Why you need to answer that question at all:** because quick sort is the *fastest* general-purpose sort in practice on random in-memory data. Until TimSort displaced it in V8 around 2018, it was the default sort in every major library — `Array.prototype.sort`, C's `qsort`, Java's `Arrays.sort` on primitives. The win is cache locality: the partition step walks the array sequentially, the CPU prefetcher does its job, the data stays hot in L1. Merge sort allocates a buffer per merge; quick sort doesn't. That constant-factor difference is enough that quick sort *with random pivots* beats merge sort on random input every single time.

Without understanding quick sort:
- "Pivoting" is a vague phrase
- The O(n²) worst case looks like an unjustified asterisk
- "Randomized pivot" sounds optional rather than necessary

With it:
- Pivoting becomes the operation that determines one element's final position per call
- O(n²) worst case becomes the very specific shape "pivot picks the min or max every time" — concrete and avoidable
- Randomized pivot becomes the line of defense against adversarial inputs

Quick sort is "partition around a pivot, recurse on each side" — the closest cousin to binary search the sort world produces.

---

## How it works

**The mental model: a pivot lands at its final position in one pass; everything else gets shoved to whichever side it belongs.**

You've already built half of this pattern. When you write `array.filter(x => x < threshold)` and `array.filter(x => x >= threshold)`, you've partitioned an array into two sub-arrays around a value. Quick sort is the in-place version of that partition, applied recursively. The "threshold" is the pivot. The first pass places the pivot at its final position; the recursion handles the two halves.

```
one partition step on [23, 7, 41, 12, 55, 18] with pivot = 23:

start:                    [23, 7, 41, 12, 55, 18]
                           pivot (at index 0)

walk through indices 1..5, comparing each to pivot=23:
  bars[1]=7  < 23  → moves to "less-than" region
  bars[2]=41 > 23  → stays in "greater-than" region
  bars[3]=12 < 23  → moves to "less-than" region
  bars[4]=55 > 23  → stays
  bars[5]=18 < 23  → moves to "less-than" region

result after partition (one possible layout):
                          [7, 12, 18, 23, 41, 55]
                           less-than | pivot | greater-than

23 is now at its FINAL sorted position. Recurse on [7,12,18] and [41,55].
```

The strategy: each call to `partition` places one element (the pivot) in its final position. After `n` calls, all elements are placed.

### The pivot selection — randomized

The codebase picks the pivot uniformly at random from the range `[start, end]`, then swaps it to `bars[start]`. This is the canonical defense against the O(n²) worst case.

```
pivot selection (src/app/sorting/quick-sort/page.tsx L82–L84):

  pivotIndex = generateRandomNumber(start, end)
  swapHelper(arr, start, pivotIndex)
                    ↑          ↑
              move random      from wherever
              pivot here       it was
```

The bridge from what you know. In React you randomize across renders to avoid stale-data attacks (`useId` for unique keys, random session IDs, etc.). Same principle here: randomize across runs so an attacker who hands you a sorted array can't force the worst case. Without randomization, a sorted array with naive "pivot = first element" gives O(n²); with randomization, the expected depth is O(log n) regardless of input shape.

The practical consequence: every run of `quick-sort/page.tsx` produces a slightly different partition tree, even on identical input. The visualizer reflects this — replay the same input twice and the animation differs.

### The partition step — Lomuto with a small/big walk

The codebase implements the *Lomuto partition*: one walking pointer `big` scans the array left-to-right; a "frontier" pointer `small` tracks where the next less-than-pivot element should land.

```
after pivot is at bars[start]:

  small  big
   │      │
   ▼      ▼
  [P, 7, 41, 12, 55, 18]
   ↑  ↑
   pivot   start scanning from start+1

step: bars[big] < bars[start] (the pivot)?
  if YES: small++; swap bars[big] with bars[small]
          (advance frontier; bring the small value into the less-than region)
  if NO:  do nothing (big moves on, value stays in greater-than region)

after the scan, swap bars[small] with bars[start]:
  pivot lands at index `small` — its final position
  bars[start..small-1] are all < pivot
  bars[small+1..end]   are all >= pivot
```

The bridge from what you know. In React you maintain a "boundary" all the time — `const [visible, hidden] = useFilteredList(items)`, where `visible` is a growing prefix. The `small` pointer is that boundary, except the boundary is in-place inside `bars` rather than in a separate array.

```
trace through one full partition of [23, 7, 41, 12, 55, 18], pivot=23 picked
randomly and swapped to index 0:

after swap: arr = [23, 7, 41, 12, 55, 18]    (pivot at index 0)
small = 0   (the frontier; the pivot sits at index 0, less-than region is empty)

big=1: arr[1]=7  < arr[0]=23?   yes → small=1, swap arr[1]↔arr[1] (no-op)
       arr = [23, 7, 41, 12, 55, 18]

big=2: arr[2]=41 < 23?   no   → small stays at 1
       arr = [23, 7, 41, 12, 55, 18]

big=3: arr[3]=12 < 23?   yes → small=2, swap arr[3]↔arr[2]
       arr = [23, 7, 12, 41, 55, 18]

big=4: arr[4]=55 < 23?   no
       arr = [23, 7, 12, 41, 55, 18]

big=5: arr[5]=18 < 23?   yes → small=3, swap arr[5]↔arr[3]
       arr = [23, 7, 12, 18, 55, 41]

after loop: swap arr[small=3] with arr[start=0]
       arr = [18, 7, 12, 23, 55, 41]
                       ↑
                       pivot (23) lands at index 3 — its final position
                       arr[0..2] < 23  ;  arr[4..5] >= 23

recursion:
  divide_and_combine(arr, 0, 2)  // [18, 7, 12] — sort this
  divide_and_combine(arr, 4, 5)  // [55, 41]    — sort this
```

The practical consequence: every partition call does O(end - start) comparisons (one pass through the range), and places exactly one element (the pivot) in its final position. Recursion handles the rest.

### The recursion — two ranges per call

After partition, the function recurses on `[start, small-1]` (less-than region) and `[small+1, end]` (greater-than region). The base case is `start >= end` — either an empty or single-element range, both trivially sorted.

```
recursion structure:

divide_and_combine(arr, 0, 5):
  partition → pivot lands at, say, index 3
  ├── divide_and_combine(arr, 0, 2)    // sort the less-than region
  │     partition → pivot lands at, say, index 1
  │     ├── divide_and_combine(arr, 0, 0)  // base case: skip
  │     └── divide_and_combine(arr, 2, 2)  // base case: skip
  └── divide_and_combine(arr, 4, 5)    // sort the greater-than region
        partition → pivot lands at, say, index 4
        ├── divide_and_combine(arr, 4, 3)  // base case: empty range
        └── divide_and_combine(arr, 5, 5)  // base case: skip
```

Stack depth is the recursion depth. On balanced partitions (random input, random pivots) it's `log₂(n)`. On unbalanced partitions (worst case: pivot picks min or max every time) it's `n` — which would blow the stack on a large input.

### The worst case — and why randomization prevents it

If the pivot consistently lands at the minimum or maximum of the current range, the "less-than" or "greater-than" region is empty, and the recursion degenerates to one element per level. Depth becomes `n`, total work becomes `O(n²)`.

```
worst case: pivot always = min of range

start: [1, 2, 3, 4, 5, 6]    pivot=1 → final position index 0
                              less-than: []
                              greater-than: [2, 3, 4, 5, 6]

next:  [2, 3, 4, 5, 6]        pivot=2 → final position index 1
                              less-than: []
                              greater-than: [3, 4, 5, 6]

...continues n-1 times... → O(n²) total work, n deep stack
```

The bridge from what you know. In React you fight predictable failure modes by adding randomization — `cache-buster` query params, `Math.random()` jitter on retry intervals. Same defense here: random pivot makes the worst case statistically impossible regardless of input shape.

### The principle

Quick sort exemplifies *partition then recurse*. The genius is that the partition step does meaningful sort work (one element placed in its final position) while also splitting the remaining problem into two strictly smaller sub-problems. There's no separate "combine" step — once both sub-problems are sorted, the whole array is sorted, because the pivot already sits between them in its final position. This is fundamentally different from merge sort's "divide trivially, do all the work in combine" shape. Quick sort moves the work to the divide step.

The full picture is below.

---

## Quick sort — diagram

```
                  bars = [23, 7, 41, 12, 55, 18]
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ divide_and_combine(arr, start,   │
                  │                    end)          │
                  │   if start >= end: return        │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ pivot selection:                 │
                  │   pivotIndex = random[start,end] │
                  │   swap arr[start]↔arr[pivotIndex]│
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ Lomuto partition:                │
                  │   small = start                  │
                  │   for big = start+1..end:        │
                  │     if arr[big] < arr[start]:    │
                  │       small++                    │
                  │       swap arr[big]↔arr[small]   │
                  │   swap arr[small]↔arr[start]     │
                  │     (pivot lands at small)       │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ visualizer:                      │
                  │   setHighlightIndices([small])   │
                  │   setHighlightRegion(start+1..end)│
                  │   setScanIndices(big)            │
                  │   await delayLoop(speed)         │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ recurse:                         │
                  │   divide_and_combine(arr,        │
                  │     start, small - 1)            │
                  │   divide_and_combine(arr,        │
                  │     small + 1, end)              │
                  └──────────────┬───────────────────┘
                                 │  base case: start >= end
                                 ▼
                  ┌──────────────────────────────────┐
                  │ bars = [7, 12, 18, 23, 41, 55]   │
                  └──────────────────────────────────┘
```

---

## In this codebase

**File:** `src/app/sorting/quick-sort/page.tsx`
**Functions:** `quickSort` (outer kickoff, L55), `swapHelper` (L58), `divide_and_combine` (L64)
**Line range:** L55–L123

The shape, trimmed:

```
const quickSort = () => {
  if (bars.length === 0) return;

  const swapHelper = (arr, i1, i2) => {
    const temp = arr[i2];
    arr[i2] = arr[i1];
    arr[i1] = temp;
  }

  const divide_and_combine = async (arr, start, end) => {
    if (start >= end) return arr;                            // base case

    // visualizer: highlight the range being partitioned
    const highlightIndices = [];
    for (let i = start + 1; i <= end; i++) highlightIndices.push(i);
    setHighlightRegion(highlightIndices);

    // pivot: pick random index, swap to start
    const pivotIndex = generateRandomNumber(start, end);
    swapHelper(arr, start, pivotIndex);
    await delayLoop(speed);

    // Lomuto partition
    let small = start;
    for (let big = start + 1; big <= end; big++) {
      if (arr[big] < arr[start]) {
        small++;
        swapHelper(arr, big, small);
        setHighlightIndices(prev => [...prev, small]);
        await delayLoop(speed);
      }
      setScanIndices(big);
      await delayLoop(speed);
    }
    swapHelper(arr, small, start);

    setHighlightIndices([]);
    setHighlightRegion([]);
    setScanIndices(null);

    // recurse on both sides
    await divide_and_combine(arr, start, small - 1);
    await divide_and_combine(arr, small + 1, end);

    return arr;
  }

  divide_and_combine(bars, 0, bars.length - 1);
}
```

**Called from:** `useEffect` at L126–L130, which runs `quickSort()` on mount.

**Pivot randomization (L82):** `generateRandomNumber(start, end)` from `src/utils/generateRandomNumber.ts` L1–L5. This is the line that turns "potentially O(n²)" into "expected O(n log n) regardless of input."

**Visualizer hooks:**
- `highlightIndices` (state, L51) — the array of small-frontier positions across the current partition.
- `highlightRegion` (state, L52) — the full range `[start+1..end]` of the current partition call, rendered as a background band.
- `scanIndices` (state, L53) — the current `big` pointer position.
- `await delayLoop(speed)` fires *three times per inner iteration* (after pivot swap, after each small-swap, and after each big advance), so the animation tick rate is dense — the user sees every partition step.

**The mutation pattern is critical.** `swapHelper` mutates `arr` in place. Unlike merge sort, where the algorithm produces a new `merged_aux` array and `updateOriginalArray` copies it into `bars` slot-by-slot, quick sort modifies `bars` directly. The state setters re-render after `await delayLoop(speed)` yields control back to the event loop.

**Wait — does mutating `bars` (the React state) trigger a re-render?** Strictly speaking, no — mutating an object/array doesn't change its reference, so React's reconciler would skip the render. The reason the visualizer works here is that the `setHighlightIndices` and `setHighlightRegion` calls *do* trigger re-renders, and when React re-runs the component, it reads the current (mutated) `bars` array. This is fragile — if those state updates were removed, the visualizer would freeze even though the underlying sort was still progressing.

---

## Elaborate

### Where this pattern comes from

Quick sort was invented by Tony Hoare in 1960 while working on machine translation between English and Russian. The original implementation used the *Hoare partition* (two pointers moving toward each other) rather than the Lomuto partition (one walking pointer with a frontier) that the codebase implements. Hoare's variant is faster in practice but harder to teach; Lomuto's is the standard textbook version because the loop invariant is easier to state.

Quick sort dominated production sorting for ~50 years. Its decline started with TimSort (Tim Peters, 2002, Python) and continued with the rise of stable-sort requirements in modern languages. V8 switched from quick sort to TimSort in 2018; pdqsort displaced it in Rust around 2017. Quick sort still wins on raw throughput for random in-memory data with trusted inputs.

### The deeper principle

*Partition then recurse, in-place.* The algorithm's signature property is that the sort work happens during the *divide* step, not the *combine* step. After partition, the pivot is in its final position and the two halves are independent — no merge needed. This is the same shape as binary search trees, k-d trees, and any "partition by a value, recurse on each side" algorithm. Quick sort is the canonical example.

```
partition vs merge — where the work lives:

Merge sort:                       Quick sort:
  divide is trivial (bisect)        divide is the WORK (partition)
  combine is the WORK (merge)       combine is trivial (no-op)
  → O(n) work per level             → O(n) work per level
  → log n levels                    → log n levels (on balanced pivots)
  → O(n log n)                      → O(n log n)

The work is the same; it just happens at different ends of the recursion.
```

### Where this breaks down

Adversarial inputs without randomization. The naïve "pivot = first element" implementation has O(n²) on sorted, reverse-sorted, and all-equal inputs. Random pivot fixes the first two but not all-equal — for that you need the *three-way partition* (Dutch National Flag), which splits into less-than, equal-to, and greater-than regions.

Stack overflow on pathological inputs. Even with randomization, an unlucky pivot sequence can produce O(n) recursion depth — at n = 10⁶, that's a million stack frames, which exceeds the V8 default stack. Production implementations use *introspection*: detect when recursion depth exceeds `2 log n` and fall back to heap sort. C++'s `std::sort` does this; that's Introsort.

Cache locality breakdown on very large arrays. The partition step is sequential within a range, but the recursion jumps between left and right sub-ranges, which on arrays bigger than L2 cache produces cache misses on the recursion entry. Merge sort suffers the same problem differently; the two algorithms trade cache profiles depending on hardware.

### What to explore next

- Merge sort → divide-and-conquer with linear combine; predictable O(n log n) always, at the cost of O(n) memory (see `05-merge-sort.md`).
- Heap sort → O(n log n) always with O(1) space, but slower constant factor and not stable (see `07-heap-sort.md`).
- Introsort → hybrid quick + heap sort that detects pathological recursion and switches; the C++ `std::sort` answer.
- Pattern-defeating quicksort (pdqsort) → Rust's `slice::sort_unstable`; adds smart partition heuristics to beat random-pivot quick sort.
- Three-way partition (Dutch National Flag) → quick sort variant that handles all-equal inputs in O(n) instead of O(n²).

---

## How it works — brute force vs optimal

### The data

```
bars: number[] of length n
range: [1, 60] from generateArrayOfRandomNumbers
example: [23, 7, 41, 12, 55, 18]
```

### The problem

Sort `bars` ascending, in place, with O(log n) auxiliary stack space and O(n log n) expected time.

### ── Brute force (naïve quick sort, pivot = first element) ──

**Pseudocode:**

```
quicksort(arr, start, end):
    if start >= end: return
    pivot = arr[start]                 // naïve: no randomization
    small = start
    for big from start+1 to end:
        if arr[big] < pivot:
            small++
            swap(arr[big], arr[small])
    swap(arr[small], arr[start])       // pivot lands at small
    quicksort(arr, start, small - 1)
    quicksort(arr, small + 1, end)
```

**Execution trace** — adversarial input `bars = [1, 2, 3, 4, 5, 6]` (already sorted), n = 6:

```
call quicksort(arr, 0, 5):
  pivot = arr[0] = 1
  small = 0
  big=1: arr[1]=2 < 1? no
  big=2: arr[2]=3 < 1? no
  big=3: arr[3]=4 < 1? no
  big=4: arr[4]=5 < 1? no
  big=5: arr[5]=6 < 1? no
  swap arr[0]↔arr[0] (no-op)
  pivot lands at index 0
  recurse:
    quicksort(arr, 0, -1)   base case
    quicksort(arr, 1, 5)    ← left side EMPTY, all work goes right

call quicksort(arr, 1, 5):
  pivot = arr[1] = 2
  ... (same shape: pivot is min, no swaps, left side empty)
  recurse on (arr, 1, 0) base, (arr, 2, 5)

... continues n-1 levels deep ...

total work: (n-1) + (n-2) + ... + 1 = n(n-1)/2 ≈ n²/2
recursion depth: n
```

Variable state across calls (worst case shape):

```
call           | partition range | comparisons | swaps | recursion left
───────────────┼─────────────────┼─────────────┼───────┼────────────────
qs(0, 5)       | [0..5]          | 5           | 0     | empty + (1,5)
qs(1, 5)       | [1..5]          | 4           | 0     | empty + (2,5)
qs(2, 5)       | [2..5]          | 3           | 0     | empty + (3,5)
qs(3, 5)       | [3..5]          | 2           | 0     | empty + (4,5)
qs(4, 5)       | [4..5]          | 1           | 0     | empty + (5,5)
qs(5, 5)       | base            | 0           | 0     |
────────────────────────────────────────────────────────────────────
                                  total: 15      6 deep recursion
```

**Complexity:** O(n²) time worst case · O(n) recursion stack worst case · O(n) auxiliary

**What goes wrong at scale:** at n = 10,000 with sorted input and naïve pivot, ~50 million comparisons + 10,000-deep recursion = stack overflow in V8 (default stack ~10–15k frames). The algorithm doesn't just slow down — it crashes. This is why every production quick sort randomizes the pivot.

### ── Optimal (randomized pivot, the codebase implementation) ──

**The insight:** the worst case depends on the *pivot selection*, not the input. If the pivot is chosen uniformly at random from the range, the expected partition split is 25%/75% or better with high probability — which gives `log₄/₃ n ≈ 2.4 log₂ n` expected depth. The expected total work is O(n log n) regardless of input shape, because no input can force the random pivot to land at the extreme more than once in a while.

**Pseudocode:**

```
quicksort(arr, start, end):
    if start >= end: return
    pivotIndex = randomIntInRange(start, end)   // randomize!
    swap(arr[start], arr[pivotIndex])           // move pivot to start
    small = start
    for big from start+1 to end:
        if arr[big] < arr[start]:
            small++
            swap(arr[big], arr[small])
    swap(arr[small], arr[start])
    quicksort(arr, start, small - 1)
    quicksort(arr, small + 1, end)
```

**Execution trace** — same adversarial input `bars = [1, 2, 3, 4, 5, 6]`, but with random pivot picking index 2 on the first call:

```
call quicksort(arr, 0, 5):
  pivotIndex = random(0, 5) → say 2
  swap arr[0]↔arr[2]
  arr = [3, 2, 1, 4, 5, 6]
  small = 0
  big=1: arr[1]=2 < 3? yes → small=1, swap arr[1]↔arr[1] (no-op)
         arr = [3, 2, 1, 4, 5, 6]
  big=2: arr[2]=1 < 3? yes → small=2, swap arr[2]↔arr[2] (no-op)
         arr = [3, 2, 1, 4, 5, 6]
  big=3: arr[3]=4 < 3? no
  big=4: arr[4]=5 < 3? no
  big=5: arr[5]=6 < 3? no
  swap arr[2]↔arr[0]
  arr = [1, 2, 3, 4, 5, 6]
                ↑
                pivot (3) lands at index 2 — final position

  recurse:
    quicksort(arr, 0, 1):
      pivotIndex = random(0, 1) → say 1
      swap arr[0]↔arr[1]: arr = [2, 1, 3, 4, 5, 6]
      small = 0
      big=1: arr[1]=1 < 2? yes → small=1, swap arr[1]↔arr[1]
      swap arr[1]↔arr[0]: arr = [1, 2, 3, 4, 5, 6]
                                    ↑
                                    2 final
      recurse: qs(0, 0) base, qs(2, 1) base

    quicksort(arr, 3, 5):
      pivotIndex = random(3, 5) → say 4
      swap arr[3]↔arr[4]: arr = [1, 2, 3, 5, 4, 6]
      small = 3
      big=4: arr[4]=4 < 5? yes → small=4, swap arr[4]↔arr[4]
      big=5: arr[5]=6 < 5? no
      swap arr[4]↔arr[3]: arr = [1, 2, 3, 4, 5, 6]
                                          ↑
                                          5 final
      recurse: qs(3, 3) base, qs(5, 5) base

final: arr = [1, 2, 3, 4, 5, 6]
```

Variable state across calls:

```
call           | pivot picked | partition split | depth
───────────────┼──────────────┼─────────────────┼──────
qs(0, 5)       | 3 (random)   | [1,2] | [4,5,6] | 1
qs(0, 1)       | 2 (random)   | [1]   | []      | 2
qs(3, 5)       | 5 (random)   | [4]   | [6]     | 2
qs(0,0)/(2,1)  | base         | —               | 3
qs(3,3)/(5,5)  | base         | —               | 3
                              total: 6 calls, depth 3 ≈ log₂(6)
```

**Complexity:** O(n log n) expected time · O(log n) expected stack · O(1) auxiliary

**Why it's faster:** the random pivot makes the worst case statistically impossible. Even on sorted input — the absolute worst case for naïve quick sort — randomized quick sort produces a balanced partition tree of expected depth `O(log n)`. The expected total work across all levels is `O(n log n)`, same as merge sort, with no auxiliary buffer and better cache locality.

### ── Comparison ──

```
┌─────────────────┬───────────────────┬──────────────────────┐
│                 │ Naïve quick sort  │ Randomized quick     │
│                 │ (pivot=first)     │ sort                 │
├─────────────────┼───────────────────┼──────────────────────┤
│ Worst time      │ O(n²)             │ O(n²) (very rare)    │
│ Avg time        │ O(n log n)        │ O(n log n)           │
│ Expected time   │ depends on input  │ O(n log n) always    │
│ Stack depth     │ O(n) worst        │ O(log n) expected    │
│ Space           │ O(1)              │ O(1)                 │
│ Stable          │ no                │ no                   │
│ At n=10k sorted │ ~50M ops, crash   │ ~133k ops, fine      │
│ At n=10k random │ ~133k ops         │ ~133k ops            │
│ Adversarial     │ collapses to O(n²)│ statistically immune │
│ resistant       │                   │                      │
└─────────────────┴───────────────────┴──────────────────────┘
```

**When brute force is fine:** never in production — the randomization adds two lines (`pivotIndex = random(start, end); swap`) for an enormous robustness gain. Naïve quick sort only "works" on inputs you control; ship it on a public API and someone will hand you a sorted array.

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬───────────────────────┬───────────────────────┐
│ Cost dimension   │ Quick sort            │ Merge sort            │
├──────────────────┼───────────────────────┼───────────────────────┤
│ Time worst       │ O(n²) — rare with     │ O(n log n) always     │
│                  │ randomization         │                       │
│ Time avg         │ O(n log n)            │ O(n log n)            │
│ Time best        │ O(n log n)            │ O(n log n)            │
│ Space            │ O(log n) stack        │ O(n) auxiliary buffer │
│ Stable           │ no                    │ yes (with `<=`)       │
│ In-place         │ yes                   │ no                    │
│ Cache locality   │ excellent             │ poor                  │
│ Adversarial      │ immune w/ random      │ immune always         │
│ Used in          │ C qsort, V8 (pre-     │ TimSort merge phase,  │
│                  │ TimSort), Rust pdqsort│ DB external sorts     │
│ Lines of code    │ ~25                   │ ~40 (with combine)    │
└──────────────────┴───────────────────────┴───────────────────────┘
```

### Sub-block 1 — what we gave up

Stability. Quick sort's partition step moves equal-key elements across the pivot boundary unpredictably. If you sort a list of `{ name, priority }` objects by priority, you cannot also preserve `name` order within the same priority. For visualizer integers this is invisible; for any object-sort workload it's a hard constraint.

Worst-case guarantee. Even with randomization, an *adversarially chosen* pivot sequence can in theory produce O(n²). The expected runtime is O(n log n) and the probability of degradation is astronomically small at large n, but it's not zero. If you need a worst-case bound (financial systems, real-time pipelines, audited SLAs), use merge sort or heap sort instead.

### Sub-block 2 — what the alternative would have cost

If the visualizer used merge sort, the algorithm would be worst-case O(n log n) (no probabilistic asterisk), stable by default, and easier to reason about pedagogically because every level does the same work. The cost is O(n) auxiliary memory and a more complex animation glue (the `updateOriginalArray` step in merge sort's implementation), plus a constant-factor slowdown on random input.

If the visualizer used heap sort, the algorithm would be worst-case O(n log n) with O(1) space — better than both quick and merge on memory. The cost is no stability, a more complex data structure (the heap itself), and a constant factor ~2× slower than quick sort on random input.

### Sub-block 3 — the breakpoint

Quick sort is the right choice when (a) the input is random or trusted (not adversarial), (b) stability isn't required, and (c) memory is constrained. It's the wrong choice when (a) inputs can be attacker-controlled, (b) stability is required, or (c) worst-case latency must be bounded.

The visualizer fits case (a) perfectly — the input comes from `generateArrayOfRandomNumbers`, so it's random by construction. Quick sort earns its place here as the "fast practical sort" example.

### Sub-block 4 — what wasn't actually a tradeoff

Median-of-three pivot selection was not a real alternative for the visualizer. The technique (pick three random indices, use the median as the pivot) is the standard optimization for production quick sort — it reduces the probability of bad splits even further. But the visualizer's job is to teach the *core idea* of partition + recurse; adding median-of-three would obscure the basic shape without changing the learning. Save it for a footnote.

---

## Tech reference (industry pairing)

### Math.random + uniform integer sampling

- **Codebase uses:** `generateRandomNumber(start, end)` at `src/utils/generateRandomNumber.ts` L1–L5, called from `src/app/sorting/quick-sort/page.tsx` L82.
- **Why it's here:** randomizes the pivot to defend against adversarial inputs that would trigger O(n²).
- **Leading today:** `Math.random()` + `Math.floor(rand * (max-min+1)) + min` — adoption-leading for non-cryptographic uniform integer sampling, 2026.
- **Why it leads:** built into every JS runtime, fast, uniform-enough for randomization (not security-critical here).
- **Runner-up:** `crypto.getRandomValues(new Uint32Array(1))[0] % range` — adoption-leading when bias-free distribution is required (security-critical randomization, large ranges).

### Lomuto partition (vs Hoare partition)

- **Codebase uses:** Lomuto partition at `src/app/sorting/quick-sort/page.tsx` L95–L109 — one walking `big` pointer, one frontier `small` pointer.
- **Why it's here:** simpler to teach and animate than Hoare's two-pointer-converging variant.
- **Leading today:** Lomuto — adoption-leading in teaching contexts and most introductory textbooks, 2026.
- **Why it leads:** loop invariant is easier to state ("everything left of `small` is < pivot"), animation is more linear.
- **Runner-up:** Hoare partition — innovation-leading in production code; faster constant factor (~3× fewer swaps on average) but harder to reason about. Used by Introsort and pdqsort.

---

## Summary

Quick sort picks a random pivot, partitions the array so less-than sits left and greater-than sits right (Lomuto-style), then recurses on each side — placing one element in its final position per call. In this codebase it lives in `src/app/sorting/quick-sort/page.tsx` L55–L123, with `generateRandomNumber(start, end)` at L82 selecting the pivot uniformly to defend against the O(n²) worst case. The constraint that made it the right call here is teaching the divide-and-conquer-with-in-place-partition shape — the algorithm is fast, fully in-place, and contrasts cleanly with merge sort's O(n) auxiliary buffer. The cost is O(n²) worst-case (statistically impossible with random pivots, but still possible) and no stability, neither of which matters for the visualizer's integer bars.

- Pivot selection happens once per call; the partition step places that pivot in its final position.
- Lomuto partition: walking `big` pointer + frontier `small` pointer; one swap per "less-than-pivot" element found.
- Random pivot is the difference between O(n²) worst case (naïve) and O(n log n) expected (production).
- Not stable — partition swaps equal-key elements across the pivot boundary unpredictably.
- O(log n) expected recursion stack, O(1) auxiliary memory — the most space-efficient O(n log n) sort that isn't heap sort.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about quick sort, they're testing whether you can explain *why* the O(n²) worst case exists and what randomization buys you. They're also checking whether you know when to pick quick sort over merge sort — specifically, the memory/stability tradeoff. A weak answer recites the average complexity. A strong answer names the worst case, the randomization defense, and the production variants (Introsort, pdqsort) that go further.

### Likely questions

[mid] Q: Walk me through one partition of `[5, 2, 8, 1, 9, 3]` with pivot = 5.

A: After swapping the pivot to `arr[0]` (no-op since 5 is already there), small = 0. Walk big from 1 to 5: bars[1]=2 < 5 → small = 1, swap arr[1]↔arr[1]. bars[2]=8 < 5? no. bars[3]=1 < 5 → small = 2, swap arr[3]↔arr[2] giving `[5, 2, 1, 8, 9, 3]`. bars[4]=9 < 5? no. bars[5]=3 < 5 → small = 3, swap arr[5]↔arr[3] giving `[5, 2, 1, 3, 9, 8]`. Final swap: arr[3]↔arr[0] giving `[3, 2, 1, 5, 9, 8]`. Pivot 5 lands at index 3, less-than region is `[3, 2, 1]`, greater-than region is `[9, 8]`. Recurse on each.

Diagram:
```
[5, 2, 8, 1, 9, 3]    pivot=5 at idx 0, small=0
big=1: 2 < 5 → small=1, swap(1,1)  → [5, 2, 8, 1, 9, 3]
big=2: 8 < 5? no
big=3: 1 < 5 → small=2, swap(3,2)  → [5, 2, 1, 8, 9, 3]
big=4: 9 < 5? no
big=5: 3 < 5 → small=3, swap(5,3)  → [5, 2, 1, 3, 9, 8]
final: swap(3, 0)                  → [3, 2, 1, 5, 9, 8]
                                          ↑ pivot final
```

[senior] Q: Why is the worst case O(n²), and what does the codebase do to prevent it?

A: The worst case occurs when the pivot consistently lands at the min or max of the current range — then one of the two recursive sub-problems is empty and the other is size n-1, producing a degenerate tree of depth n. Total work is `n + (n-1) + (n-2) + ... = n²/2`. The naïve "pivot = first element" implementation hits this on sorted input. The codebase prevents it by calling `generateRandomNumber(start, end)` at L82 to pick the pivot uniformly at random. The probability of consistently picking extremes is astronomically small — expected depth becomes O(log n), expected total work O(n log n), regardless of input shape. Production implementations go further with introspection (fall back to heap sort if depth exceeds 2 log n) — that's Introsort.

Diagram:
```
Worst case shape (pivot always picks min):

depth 0: [P, ..., ..., ...]              ← n elements, partition cost n
depth 1: [],  [P, ..., ..., ...]         ← n-1 elements, partition cost n-1
depth 2: [],  [],  [P, ..., ...]         ← n-2 elements, partition cost n-2
...
depth n: []

total work: n + (n-1) + ... + 1 = O(n²)
recursion depth: n  ← stack overflow risk

Random pivot makes this shape statistically impossible:
  with random pivot, expected split is roughly balanced
  expected depth: O(log n)
  expected work:  O(n log n)
```

[arch] Q: I'm building a backend service that accepts user-submitted lists to sort and returns them sorted. Should I use quick sort?

A: Not without protection. Even with randomized pivots, an attacker who can submit many requests could craft an input that — combined with the predictable PRNG seed of `Math.random()` — triggers the O(n²) worst case. On a service with 100k req/sec, even a tiny fraction of n² sorts on n = 10k inputs is enough to DoS the server. Three options: (1) use merge sort or heap sort, which are O(n log n) guaranteed; (2) use Introsort (Heap sort fallback), which guarantees O(n log n) by detecting bad recursion depth; (3) seed the pivot RNG with a per-request secret so the attacker can't predict pivot choices. Option 2 is what production sort libraries do — `std::sort` in C++ is Introsort precisely for this reason.

Diagram:
```
What breaks first under adversarial input:

naïve quicksort:       O(n²) on sorted input  ◀── BREAKS immediately
random quicksort:      O(n²) very rare, but   ◀── BREAKS with effort
                       attacker can probe Math.random state
introsort (heap fallback): O(n log n) hard cap ◀── safe
merge sort:            O(n log n) always       ◀── safe
heap sort:             O(n log n) always       ◀── safe

→ ship Introsort or merge sort for public APIs
→ ship random quicksort only for trusted inputs
```

### The question candidates always dodge

Q: V8's `Array.prototype.sort` used to be quick sort. It's TimSort now. Why did they switch?

A: Two reasons, neither of which is "quick sort is bad." First, ECMAScript 2019 mandated that `Array.prototype.sort` be stable — meaning equal-key elements must preserve their relative order. Quick sort is not stable; TimSort (merge sort + insertion sort hybrid) is. The standard forced the change. Second, real-world JS data is often partially sorted (UI lists where the user has rearranged some items, log streams ordered by timestamp with occasional out-of-order entries) and TimSort's adaptive run detection runs in O(n) on such inputs, while quick sort doesn't adapt. So the switch wasn't "TimSort is asymptotically better" — both are O(n log n) — it was "stability is required by spec, and the constant-factor difference favors TimSort on the actual shape of JS workloads." Quick sort is still the right answer in C++ (`std::sort`, where stability isn't required and integer arrays dominate the use case), in Rust's `sort_unstable`, and in any context where you control the input.

Diagram:
```
What V8 picked (TimSort)                What V8 used to use (quicksort)
┌──────────────────────────────┐        ┌────────────────────────────┐
│ stable:        yes           │        │ stable:        no           │
│ adaptive:      yes (runs)    │        │ adaptive:      no           │
│ worst case:    O(n log n)    │        │ worst case:    O(n²)        │
│ space:         O(n)          │        │ space:         O(log n)     │
│ wins on:       UI lists,     │        │ wins on:       random in-   │
│                partial sort  │        │                memory data  │
│                stability spec│        │                no spec req  │
└──────────────────────────────┘        └────────────────────────────┘

→ V8 switched because ECMAScript spec required stability (2019)
→ C++ kept Introsort (no stability requirement)
→ Rust offers BOTH: sort (stable, like TimSort) + sort_unstable (pdqsort)
```

### One-line anchors

- "Quick sort: pick a pivot, partition around it, recurse — one element placed per call, in place, no buffer."
- "Random pivot is the difference between O(n²) worst case and O(n log n) expected. Not optional in production."
- "Not stable — partition shuffles equal-key items across the pivot boundary."
- "Wins on raw throughput for random in-memory data; loses to TimSort when stability or adaptivity matters."
- "Production variants (Introsort, pdqsort) detect bad recursion depth and fall back to heap sort — that's why `std::sort` is always O(n log n)."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the quick sort flow: pivot selection, the Lomuto partition with `small`/`big` pointers, the final pivot-swap into position, and the two recursive calls.

Open the file. Check:
- Did you show the pivot being randomly picked and swapped to `bars[start]` before the scan?
- Did you mark the `small` pointer as the frontier between less-than and greater-than regions?
- Did you show the final `swap(arr[small], arr[start])` placing the pivot at its final index?
- Did you show two recursive calls on the two sub-ranges?

### Level 2 — Explain it out loud

Explain quick sort to a colleague who asked "why isn't this V8's default sort anymore?" No notes. Under 90 seconds.

Checkpoints:
- Did you reference `src/app/sorting/quick-sort/page.tsx` L55–L123?
- Did you name the partition step as "one element placed per call"?
- Did you explain why random pivot prevents O(n²)?
- Did you mention that quick sort isn't stable (and why that matters for the V8 spec change)?

### Level 3 — Apply it to a new scenario

A user reports that on inputs with many duplicates — like sorting an array of `[5, 5, 5, 5, 5, 5]` — your quick sort visualizer "feels weirdly slow." Walk through what's happening using only what's in `src/app/sorting/quick-sort/page.tsx` L95–L109. What's the algorithmic name for the fix?

Write your answer in 3–5 sentences. Then verify: with all-equal inputs, every comparison `arr[big] < arr[start]` is false, so every element ends up in the "greater-than" region. The partition is maximally unbalanced (all n-1 elements right of pivot, none on left), reproducing the O(n²) worst case even with randomized pivot selection. The fix is the *three-way partition* (Dutch National Flag), which separates less-than, equal-to, and greater-than into three regions.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the codebase uses two-way Lomuto partition, which degrades to O(n²) on all-equal inputs even with random pivots. If you were starting today and the visualizer needed to handle inputs from `generateArrayOfRandomNumbers` with `min = max` (a degenerate case that returns all-equal arrays), would you keep Lomuto or switch to three-way partition? What does the visualizer animation look like for each?

Reference `src/app/sorting/quick-sort/page.tsx` L95–L109 to support your answer.

### Quick check — code reference test

Without opening any files:
- What file does the implementation live in?
- What helper picks the pivot index?
- What are the two pointer variables in the partition loop?

Open and verify.

Pass: you named `src/app/sorting/quick-sort/page.tsx`, `generateRandomNumber` (from `src/utils/generateRandomNumber.ts`), and `small` / `big`.
Fail on pointer names: re-read L95–L108 — the codebase uses `small` for the frontier and `big` for the walking pointer.
