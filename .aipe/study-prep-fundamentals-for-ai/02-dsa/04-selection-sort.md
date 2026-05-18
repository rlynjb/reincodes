# Selection sort

**Industry name(s):** Selection sort, minimum-selection sort
**Type:** Industry standard · Language-agnostic

> Find the minimum in the unsorted suffix, swap it into the front, advance the boundary — exactly one swap per pass, every time, regardless of input shape.

**See also:** → 02-bubble-sort.md · → 03-insertion-sort.md · → 05-merge-sort.md

---

## Why care

You have an array of 50 bars on the page — `[23, 7, 41, 12, 55, ...]` — and you want to write the sort that does the *fewest writes possible* while still being a simple O(n²) algorithm. Bubble sort can fire dozens of swaps in a single pass. Insertion sort shifts whole prefixes around. But selection sort touches the array exactly N times: scan the unsorted suffix, find the smallest, swap it into the front. One swap per pass. Done.

That "find-then-swap" routine is what *selection sort* does. Not "compare adjacent" (bubble), not "slide into place" (insertion) — but "scan the whole remaining suffix, identify the winner, swap once." If you've ever written `const min = array.reduce((a, b) => Math.min(a, b))`, you've already built the inner loop of selection sort. The outer loop just calls that reduction `n` times, on progressively shrinking suffixes.

**Why you need to answer that question at all:** because the right algorithm depends on what the cost ledger looks like. Comparisons are cheap; writes can be expensive. Bubble sort and insertion sort minimize comparisons relative to writes — when the input is near-sorted they both fire few writes. Selection sort goes the other direction: it does the *same* number of comparisons as bubble sort, regardless of input (O(n²) always, no best case), but caps writes at exactly N. On flash memory (where writes wear out cells), on EEPROMs, on environments where every write costs a transaction round-trip — that asymmetry flips the choice.

Without understanding selection sort:
- "O(n²) sort" sounds like a single class with no variation
- "Stable" vs "in-place" trade-offs read as arbitrary
- The "fewest writes" property goes invisible

With it:
- O(n²) splits into "O(n²) writes" (bubble), "O(n²) writes" (insertion), and "O(n) writes" (selection)
- Selection sort earns its place in EEPROM firmware and other write-limited environments
- "Not stable" becomes a concrete cost: equal-key items can swap relative order, breaking some downstream invariants

Selection sort is `for each slot, find the min of what's left, put it here` — the most direct possible translation of "sort" into code.

---

## How it works

**The mental model: a `Math.min` of the unsorted suffix, swapped into the front, repeated N times.**

You've written this pattern. The standard `Math.min(...arr)` finds the smallest value in one pass. Imagine doing that, but you also remember the *index* where the minimum lives. Then you swap that index into position 0. The first slot is now correctly filled. Advance the boundary to position 1; scan the suffix `[1..n-1]` for its minimum; swap into position 1. Done at position `n-1`.

```
selection sort, one pass per slot:

start:  [23, 7, 41, 12, 55, 18]

slot 0: scan [23, 7, 41, 12, 55, 18] → min = 7 at index 1
        swap bars[0] ↔ bars[1]
        →   [7, 23, 41, 12, 55, 18]
              ↑ locked in place

slot 1: scan [23, 41, 12, 55, 18]    → min = 12 at index 3
        swap bars[1] ↔ bars[3]
        →   [7, 12, 41, 23, 55, 18]
              ↑↑ locked

slot 2: scan [41, 23, 55, 18]        → min = 18 at index 5
        swap bars[2] ↔ bars[5]
        →   [7, 12, 18, 23, 55, 41]
              ↑↑↑ locked
... (continues until all slots filled)
```

The strategy: one swap per outer iteration, never more, never fewer (except the no-op case where the min is already in place — and even then, the swap fires; it's just a swap with itself).

### The outer loop — the slot-being-filled pointer

The variable `t` in the codebase is the slot currently being filled. Before iteration `t`, indices `[0..t-1]` hold the `t` smallest values in sorted order. The job of iteration `t` is to find the minimum of `bars[t..n-1]` and place it at `bars[t]`.

```
invariant at the top of each outer iteration:

  t=0:   [?, ?, ?, ?, ?, ?]   nothing yet
  t=1:   [7, ?, ?, ?, ?, ?]   smallest of [23,7,41,12,55,18] = 7
  t=2:   [7, 12, ?, ?, ?, ?]  smallest of [23,41,12,55,18]   = 12
  t=3:   [7, 12, 18, ?, ?, ?] smallest of [41,23,55,18]      = 18
  ...
```

The bridge from what you know. In React you write reducers that build up a result one item at a time — `array.reduce((acc, item) => [...acc, transform(item)], [])`. Selection sort is the same shape: build a sorted prefix by appending one minimum at a time. The difference is that selection sort does it *in place*, swapping into position rather than building a new array.

### The inner loop — `Math.min`-with-index over the suffix

The inner loop walks the unsorted suffix `[t+1..n-1]`, tracking `(minVal, minIndex)` as it goes. Any new value smaller than the current minimum updates both. At the end of the walk, `minIndex` points at the smallest value in the suffix.

```
inner loop body:
┌────────────────────────────┐
│ if (bars[a] < minVal):     │  ← scan vs running min
│     minVal   = bars[a]     │
│     minIndex = a           │
└────────────────────────────┘
        │
        ▼
(after scan): minIndex points at the smallest
              value in bars[t..n-1]
```

The bridge from what you know. This is `array.reduce((minSoFar, item, idx) => item < minSoFar.val ? { val: item, idx } : minSoFar, { val: Infinity, idx: -1 })`. Same logic. The selection-sort version uses two scalar variables instead of an object accumulator because in-place mutation is the whole point.

The practical consequence: the inner loop runs `n - 1 - t` times for each outer step. Total comparisons summed over the outer loop: `(n-1) + (n-2) + ... + 1 + 0 = n(n-1)/2 ≈ n²/2`. Same as bubble sort, same as insertion sort. Selection sort doesn't save on comparisons — it saves on writes.

### The swap — exactly one per outer iteration

After the inner loop finishes, `minIndex` is the location of the winner. One swap brings the winner to position `t`:

```
[bars[t], bars[minIndex]] = [bars[minIndex], bars[t]];
```

This is the only mutation per outer iteration. If `minIndex === t` (the minimum was already at the boundary), it's a no-op swap-with-self, but it still runs. Across the whole sort: exactly `n` swaps (counting the no-ops), or `n - k` real position changes (where k is the number of times the min was already in place).

```
total writes across the sort:

  bubble sort:    up to n(n-1)/2 swaps × 3 writes  = ~3n²/2 writes
  insertion sort: sum of inversions × 1 write each = up to n²/2 writes
  selection sort: exactly n swaps × 3 writes       = 3n writes
                                                     ^^^
                                          linear in n, not quadratic
```

### The instability — why this isn't a stable sort

Selection sort is *not stable*. Equal-key items can have their relative order reversed by the swap step. Example:

```
input: [5a, 3, 5b, 1]    (5a and 5b are equal keys; 'a' and 'b' label them
                          so we can track their relative order)

t=0: scan, min = 1 at index 3
     swap bars[0] ↔ bars[3]
     → [1, 3, 5b, 5a]    ← 5a and 5b have swapped relative order!

t=1: scan, min = 3 at index 1
     swap bars[1] ↔ bars[1]   (no-op)
     → [1, 3, 5b, 5a]

t=2: scan, min = 5b at index 2
     swap bars[2] ↔ bars[2]   (no-op)
     → [1, 3, 5b, 5a]

t=3: trivially done
     → [1, 3, 5b, 5a]

5a came before 5b in input but ends up after. NOT stable.
```

The bridge from what you know. Stability matters when you sort by a *secondary* key — e.g. sort tasks by priority *while preserving original creation order* within the same priority. With a stable sort, you can sort by `createdAt` first, then by `priority`, and the secondary order survives. With selection sort, the second sort wipes out the first.

### The principle

Selection sort is the *write-minimizing* O(n²) sort. It pays full O(n²) comparison cost to extract the property that no element ever moves more than once. This is the asymptotic version of "measure twice, cut once" — spend more on observation, less on the irreversible action. In environments where writes are the expensive operation (flash, EEPROM, distributed-DB updates), selection sort is the right O(n²) choice. In environments where writes are free (in-memory arrays in V8), it's strictly dominated by insertion sort.

The full picture is below.

---

## Selection sort — diagram

```
                  bars = [23, 7, 41, 12, 55, 18]
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ outer loop:  t = 0 .. n-1        │
                  │   invariant: bars[0..t-1] holds  │
                  │   the t smallest values, sorted  │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ minVal   = bars[t]               │
                  │ minIndex = t                     │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ inner loop:  a = t+1 .. n-1      │
                  │   if bars[a] < minVal:           │
                  │     minVal   = bars[a]           │
                  │     minIndex = a                 │
                  └──────────────┬───────────────────┘
                                 │  inner done
                                 ▼
                  ┌──────────────────────────────────┐
                  │ swap bars[t] ↔ bars[minIndex]    │
                  │ (exactly one swap per outer)     │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ visualizer:                      │
                  │   setHighlightIndices([t, min])  │
                  │   setScanIndices(a)              │
                  │   await delayLoop(speed)         │
                  │   setBars([...bars])             │
                  └──────────────┬───────────────────┘
                                 │  t === n-1
                                 ▼
                  ┌──────────────────────────────────┐
                  │ bars = [7, 12, 18, 23, 41, 55]   │
                  └──────────────────────────────────┘
```

---

## In this codebase

**File:** `src/app/sorting/selection-sort/page.tsx`
**Function:** `selectionSort` (inner async function inside `SelectionSort` component)
**Line range:** L53–L77

The shape, trimmed:

```
const selectionSort = async () => {
  for (let t = 0; t < bars.length; t++) {
    let minVal = bars[t];
    let minIndex = t;

    for (let a = t + 1; a < bars.length; a++) {
      if (bars[a] < minVal) {
        minVal = bars[a];
        minIndex = a;
      }
      setHighlightIndices([t, minIndex]);
      setScanIndices(a);
      await delayLoop(speed);
    }

    [bars[t], bars[minIndex]] = [bars[minIndex], bars[t]];
    setBars([...bars]);
  }
}
```

**Called from:** `useEffect` at L79–L83, which runs `selectionSort()` on mount.

**Visualizer hooks:**
- `highlightIndices` (state, L50) — `[t, minIndex]` marks both the boundary (current slot being filled) and the current minimum candidate. `ArrayVisualizer` renders both bars distinctly.
- `scanIndices` (state, L51) — `a` marks the bar currently being compared to the running minimum.
- `await delayLoop(speed)` fires *inside* the inner loop after every comparison (L66), not on each swap. So selection sort's animation rhythm is steady — one tick per comparison — regardless of how many swaps actually fire.

**Header complexity claim (L91):** `O(n²) best/avg/best case` — there's a typo ("best" twice), but the meaning is clear: no input shape gets a faster runtime. This is what makes selection sort distinct: no best case, no early exit, no adaptive behavior.

**Stability note (not in the codebase):** the implementation is not stable, which is fine for the visualizer (the values are integers; no secondary key exists). If the visualizer ever sorted objects with a primary and secondary key, this implementation would silently reorder equal keys.

---

## Elaborate

### Where this pattern comes from

Selection sort is one of the earliest sorting algorithms — pre-dates electronic computers, appears in mechanical tabulating machine designs from the 1880s (Hollerith punch-card sorters). It survived in textbooks for the same reason bubble sort did: it's the most direct possible translation of "sort by repeatedly finding the smallest" into a procedure. Donald Knuth's analysis in *The Art of Computer Programming* placed it precisely: the O(n²) algorithm whose write count is O(n), making it the choice when writes are the binding constraint.

### The deeper principle

*Asymmetric cost models*. Selection sort is the first sorting algorithm a learner encounters that highlights the difference between comparison cost and write cost. In a uniform-cost model (in-memory ints), comparisons and writes cost the same and selection sort loses to insertion sort. In a non-uniform model (writes 1000× more expensive than reads, as in EEPROM or flash with write-amplification), selection sort wins decisively.

```
cost model: writes cost K× as much as comparisons

  K = 1:   selection sort total cost ≈ n²/2 + 3n     ≈ n²/2     loses to insertion
  K = 10:  selection sort total cost ≈ n²/2 + 30n    ≈ n²/2     still loses
  K = n:   selection sort total cost ≈ n²/2 + 3n²    ≈ 3.5n²
           insertion sort total cost ≈ n²/2 + n²·K/2 ≈ n²·n/2 = n³/2  ← worse
                                                                ↑
                                  selection sort wins when writes are expensive
```

This is the same principle behind log-structured storage (LSM trees), copy-on-write filesystems, and append-only databases: when writes are expensive, restructure the algorithm to do fewer of them, even if you have to do more reads to compensate.

### Where this breaks down

Selection sort has no best case. On an already-sorted input it still does the full n²/2 comparisons. On a near-sorted input, same. It's the only one of the three "small sorts" (bubble, insertion, selection) that can't benefit from input structure. In any context where input is *often* near-sorted (real-world data, leaderboards, log streams), insertion sort dominates.

Selection sort is also unstable, which rules it out anywhere stability matters (multi-key sorts, displaying ordered lists where original order should be preserved within equal keys). The instability isn't fundamental — a "selection sort that shifts the prefix instead of swapping" would be stable but lose the one-swap-per-pass property, which is the whole point.

### What to explore next

- Heap sort → upgrade selection sort by replacing the O(n) "find min" with an O(log n) heap extract; total complexity drops from O(n²) to O(n log n). See `07-heap-sort.md`.
- Cycle sort → a variant of selection sort with provably-minimum write count (each element ends up at its destination after exactly one write).
- LSM trees → the database equivalent of "minimize writes, accept more reads."
- Stable selection sort variants → demonstrate the tradeoff (you can keep the find-then-place shape and gain stability by shifting instead of swapping, but you lose the O(n) write count).

---

## How it works — brute force vs optimal

### The data

```
bars: number[] of length n
range: [1, 60] from generateArrayOfRandomNumbers
example: [23, 7, 41, 12, 55, 18]
```

### The problem

Sort `bars` ascending, in place, using the minimum number of writes among comparison sorts.

### ── Brute force (linear-scan selection sort — the codebase implementation) ──

**Pseudocode:**

```
for t from 0 to n-1:
    minVal   = bars[t]
    minIndex = t
    for a from t+1 to n-1:
        if bars[a] < minVal:
            minVal   = bars[a]
            minIndex = a
    swap(bars[t], bars[minIndex])
```

**Execution trace** — `bars = [23, 7, 41, 12, 55, 18]`, n = 6:

```
t=0: minVal=23, minIndex=0
     a=1: bars[1]=7  < 23   → minVal=7,  minIndex=1
     a=2: bars[2]=41 < 7?    no
     a=3: bars[3]=12 < 7?    no
     a=4: bars[4]=55 < 7?    no
     a=5: bars[5]=18 < 7?    no
     swap bars[0] ↔ bars[1]
     bars = [7, 23, 41, 12, 55, 18]

t=1: minVal=23, minIndex=1
     a=2: bars[2]=41 < 23?   no
     a=3: bars[3]=12 < 23    → minVal=12, minIndex=3
     a=4: bars[4]=55 < 12?   no
     a=5: bars[5]=18 < 12?   no
     swap bars[1] ↔ bars[3]
     bars = [7, 12, 41, 23, 55, 18]

t=2: minVal=41, minIndex=2
     a=3: bars[3]=23 < 41    → minVal=23, minIndex=3
     a=4: bars[4]=55 < 23?   no
     a=5: bars[5]=18 < 23    → minVal=18, minIndex=5
     swap bars[2] ↔ bars[5]
     bars = [7, 12, 18, 23, 55, 41]

t=3: minVal=23, minIndex=3
     a=4: bars[4]=55 < 23?   no
     a=5: bars[5]=41 < 23?   no
     swap bars[3] ↔ bars[3]  (no-op)
     bars = [7, 12, 18, 23, 55, 41]

t=4: minVal=55, minIndex=4
     a=5: bars[5]=41 < 55    → minVal=41, minIndex=5
     swap bars[4] ↔ bars[5]
     bars = [7, 12, 18, 23, 41, 55]

t=5: minVal=55, minIndex=5
     (inner loop doesn't fire — a starts at 6, n is 6)
     swap bars[5] ↔ bars[5]  (no-op)
     bars = [7, 12, 18, 23, 41, 55]
```

Variable state at the end of every outer step:

```
t  | minIndex | swap?       | bars after step
───┼──────────┼─────────────┼─────────────────────────────
0  |    1     | yes         | [7, 23, 41, 12, 55, 18]
1  |    3     | yes         | [7, 12, 41, 23, 55, 18]
2  |    5     | yes         | [7, 12, 18, 23, 55, 41]
3  |    3     | no-op       | [7, 12, 18, 23, 55, 41]
4  |    5     | yes         | [7, 12, 18, 23, 41, 55]
5  |    5     | no-op       | [7, 12, 18, 23, 41, 55]
                            total real swaps: 4 (of 6 outer iters)
                            total comparisons: 15
```

**Complexity:** O(n²) time · O(1) space · O(n) writes

**What goes wrong at scale:** at n = 10,000, the inner loop fires ~50 million comparisons regardless of input. V8 does these at ~200M ops/sec, so the sort takes ~250ms — a visible jank but not catastrophic. What's *not* catastrophic, and the algorithm's selling point: writes total exactly 10,000 (one swap per pass), so on a write-limited medium you've paid 10,000 × write-cost, not 50 million × write-cost. The asymmetry is the whole point.

### ── Optimal (heap-backed selection sort = heap sort) ──

**The insight:** the brute force spends O(n) every outer iteration to find the minimum of the suffix. A min-heap finds the minimum in O(1) and removes it in O(log n). Build the heap once (O(n)), extract `n` times (each O(log n)), and the total drops from O(n²) to O(n log n) — at the cost of either O(n) auxiliary space (separate heap) or in-place heap maintenance.

**Pseudocode:**

```
build_min_heap(bars)              // O(n)
for t from 0 to n-1:
    bars[t] = extract_min(bars)   // O(log n)
```

Or, more practically, the in-place variant (max-heap → swap to end → re-heapify), which is exactly what `iterative_heap_sort` does in `src/utils/data_structures/BinaryHeap.ts` L395–L415. See `07-heap-sort.md` for the full walkthrough.

**Execution trace** — `bars = [23, 7, 41, 12, 55, 18]`, n = 6, using a min-heap:

```
build min-heap from bars (~n comparisons total):
  heap state: [7, 12, 18, 23, 55, 41]
  (heap-ordered: parent ≤ children; not the same as sorted)

extract t=0: pull 7 off heap (O(log n) heapify-down)
  heap = [12, 23, 18, 41, 55]
  output so far: [7]

extract t=1: pull 12 off heap
  heap = [18, 23, 55, 41]
  output: [7, 12]

extract t=2: pull 18
  heap = [23, 41, 55]
  output: [7, 12, 18]

extract t=3: pull 23
  heap = [41, 55]
  output: [7, 12, 18, 23]

extract t=4: pull 41
  heap = [55]
  output: [7, 12, 18, 23, 41]

extract t=5: pull 55
  heap = []
  output: [7, 12, 18, 23, 41, 55]
```

For this input the linear-scan version did 15 comparisons; the heap version does ~10 (build) + 6 × ~3 (extracts) ≈ 28. *Heap is slower on small n.* The crossover is around n = 50.

**Complexity:** O(n log n) time · O(1) space (in-place heap) or O(n) (separate heap) · O(n log n) writes

**Why it's faster:** the "find min" step drops from O(n) to O(log n). The "place min" step is the same. The total drops by a factor of n / log n — at n = 10,000, that's ~750×. The cost is constant-factor overhead from the heap operations.

### ── Comparison ──

```
┌─────────────────┬───────────────────┬──────────────────────┐
│                 │ Linear selection  │ Heap selection (heap │
│                 │ sort (brute)      │ sort)                │
├─────────────────┼───────────────────┼──────────────────────┤
│ Worst time      │ O(n²)             │ O(n log n)           │
│ Best time       │ O(n²)             │ O(n log n)           │
│ Space           │ O(1)              │ O(1) in-place        │
│ Total writes    │ O(n)              │ O(n log n)           │
│ Stable          │ no                │ no                   │
│ Best small n    │ ≤ 50              │ — (overhead loses)   │
│ At n=50 random  │ ~1,225 comps      │ ~300 comps           │
│ At n=10k random │ ~50M comps        │ ~140k comps          │
│ Used in         │ write-limited     │ guaranteed O(n log   │
│                 │ embedded systems  │ n), no auxiliary mem │
└─────────────────┴───────────────────┴──────────────────────┘
```

**When brute force is fine:** for very small `n` (say, n ≤ 30 in JavaScript) where the heap's constant factor overhead exceeds its asymptotic savings, and in write-limited environments where the O(n) write count is the binding constraint. Outside those cases, prefer heap sort or insertion sort.

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬───────────────────────┬───────────────────────┐
│ Cost dimension   │ Selection sort        │ Insertion sort        │
├──────────────────┼───────────────────────┼───────────────────────┤
│ Time worst       │ O(n²)                 │ O(n²)                 │
│ Time best        │ O(n²) — no best case  │ O(n) intrinsic        │
│ Space            │ O(1)                  │ O(1)                  │
│ Total writes     │ O(n) — capped         │ O(n²) — sum of        │
│                  │                       │ inversions            │
│ Comparisons      │ O(n²) always          │ O(n²) worst, O(n)     │
│                  │                       │ best                  │
│ Stable           │ no                    │ yes                   │
│ Cache locality   │ poor (suffix scan)    │ excellent (local)     │
│ Used in          │ write-limited memory  │ small runs of TimSort │
│ Lines of code    │ ~8                    │ ~7                    │
└──────────────────┴───────────────────────┴───────────────────────┘
```

### Sub-block 1 — what we gave up

No best case. Sorted input runs in the same O(n²) time as reverse input — the inner loop has no way to know it's not finding anything useful. For the visualizer this means the animation never speeds up: a sorted array of 50 bars takes exactly as long to "sort" (verify) as a reverse-sorted one.

Stability. The implementation swaps `bars[t]` with `bars[minIndex]` regardless of whether other equal-key elements lie between them. For integer arrays this is invisible; for any real-world dataset with stable-sort dependencies (sort by name within priority, etc.) this would silently reorder.

Cache locality. The inner loop scans the whole unsorted suffix every iteration — `bars[t..n-1]` — which on large arrays means walking past the L1 cache boundary. Insertion sort, by contrast, touches a local window of `bars` per inner iteration, which fits in cache. At small `n` this is invisible; at n = 100,000 it's a measurable factor.

### Sub-block 2 — what the alternative would have cost

If the visualizer used insertion sort instead, the algorithm would adapt to near-sorted input (O(n) best case) and provide a more dramatic teaching contrast with merge/quick sort. The cost: the inner loop's "slide everything right" shape is harder to visualize than the "scan-find-swap" shape of selection sort. Selection sort's animation is the cleanest: highlight two bars (the current slot and the running minimum), scan a third bar (`a`), update the min indicator if needed, swap at the end. Every step is a discrete observable event.

If the visualizer used heap sort, the algorithm would be O(n log n) — closer to production sorts — but the animation would require a *second* visualizer (the heap tree itself) to make sense. The page would no longer be "sort an array of bars" but "build a heap, then drain it," which is conceptually different.

### Sub-block 3 — the breakpoint

Selection sort is the right choice when (a) writes are expensive relative to comparisons (EEPROM, flash with write-amplification), and (b) input size is bounded — say, n ≤ 1000 — so the O(n²) comparison count is still tractable. Above n ≈ 1000 with cheap writes, heap sort (or any O(n log n) sort) wins. Above n ≈ 100 with cheap writes, insertion sort wins. Selection sort's window is narrow.

For the visualizer specifically: fine up to ~200 bars. Beyond that, the O(n²) comparison count makes the animation drag — at speed = 100ms per comparison, n = 200 is 20,000 comparisons × 100ms = ~33 minutes per sort.

### Sub-block 4 — what wasn't actually a tradeoff

Counting sort was not a real alternative for this visualizer. The codebase's array values are integers in `[1, 60]`, which counting sort handles in O(n + k) ≈ O(n) — strictly faster than any comparison sort. But counting sort produces a sorted result in *one move* (assemble the output array from counts); there's no per-step shape to visualize. The page's job is to show "what selection sort does," not "what the fastest possible sort does." Counting sort would be the wrong tool for this page even though it's the right tool for the underlying data.

---

## Tech reference (industry pairing)

### Destructuring swap (ES2015)

- **Codebase uses:** `[bars[t], bars[minIndex]] = [bars[minIndex], bars[t]]` at `src/app/sorting/selection-sort/page.tsx` L69 — modern in-place swap idiom.
- **Why it's here:** swaps two array elements in one statement without an explicit `temp` variable. Cleaner than the bubble-sort variant's `const highval = bars[r-1]; ...` shape.
- **Leading today:** Array destructuring assignment — adoption-leading idiom in modern JavaScript, 2026.
- **Why it leads:** native syntax since ES2015, V8 optimizes the temporary-array allocation away in monomorphic call sites, reads more like math than C-style swap.
- **Runner-up:** classic `const temp = a; a = b; b = temp;` — adoption-leading in legacy or perf-critical code where V8's destructuring optimization isn't guaranteed (e.g. polymorphic call sites).

### Math.min via running-minimum loop

- **Codebase uses:** the inner loop tracks `(minVal, minIndex)` manually — `Math.min` would return the value but not the index, so the loop has to be explicit.
- **Why it's here:** the algorithm needs the index of the minimum, not just the value. `Math.min(...bars)` won't suffice.
- **Leading today:** explicit running-min loop — adoption-leading for "find min and its index" patterns, 2026.
- **Why it leads:** `Math.min(...arr)` plus `arr.indexOf(min)` is two passes; the running-min loop is one pass with a tighter inner body.
- **Runner-up:** `arr.reduce((acc, val, idx) => val < acc.val ? { val, idx } : acc, { val: Infinity, idx: -1 })` — innovation-leading functional shape, slower in practice because of the per-iteration object allocation.

---

## Summary

Selection sort finds the minimum of the unsorted suffix and swaps it into the front, repeated `n` times until the whole array is sorted. In this codebase it lives in `src/app/sorting/selection-sort/page.tsx` L53–L77, with `await delayLoop(speed)` firing once per inner comparison so the user sees the running-minimum tracker advance through each suffix scan. The constraint that made it the right call here is visibility of the "find then swap" shape — every step is a discrete observable event, perfect for a teaching animation. The cost is no best case (sorted input takes the same time as reverse) and instability (equal keys can reorder), neither of which matters for the visualizer's integer bars but both of which would matter in any real-world deployment.

- One outer loop choosing the slot; one inner loop scanning the suffix for its minimum; one swap per outer iteration.
- Exactly `n` swaps total — the lowest write count among comparison sorts of this complexity class. This is selection sort's distinguishing property.
- No best case — every input shape takes O(n²) comparisons. Bubble sort and insertion sort both have intrinsic O(n) best cases; selection sort does not.
- Not stable — equal-key items can have their relative order reversed by the swap step.
- The right choice when writes are expensive (flash memory, EEPROM, write-amplified storage). The wrong choice almost everywhere else — beaten by insertion sort on small n and by heap sort on large n.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about selection sort, they're testing whether you understand that asymptotic complexity is a single dimension of cost, and that real-world choices depend on the cost ledger of the environment. A weak answer treats selection sort as "the same as bubble sort." A strong answer names its distinguishing property — O(n) writes, no best case, unstable — and identifies the environments where it's the right call.

### Likely questions

[mid] Q: Walk me through selection sort on `[5, 2, 4, 6, 1, 3]`.

A: Outer loop iterates `t = 0..5`. At each `t`, scan `bars[t+1..n-1]`, track the running minimum and its index, then swap the minimum into `bars[t]`. At `t = 0`, scan `[2, 4, 6, 1, 3]`, find min = 1 at index 4, swap → `[1, 2, 4, 6, 5, 3]`. At `t = 1`, scan `[4, 6, 5, 3]`, find min = 2, no swap → `[1, 2, 4, 6, 5, 3]` (wait, 2 is already at index 1) — let me redo. Actually at t=1, `minVal = bars[1] = 2`, the scan finds nothing smaller, so swap-with-self at index 1. At t=2, scan `[6, 5, 3]` and 5, find min = 3 at index 5, swap → `[1, 2, 3, 6, 5, 4]`. Continue similarly until `[1, 2, 3, 4, 5, 6]`.

Diagram:
```
[5, 2, 4, 6, 1, 3]
t=0: min=1 at idx 4    → swap → [1, 2, 4, 6, 5, 3]
t=1: min=2 at idx 1    → no-op → [1, 2, 4, 6, 5, 3]
t=2: min=3 at idx 5    → swap → [1, 2, 3, 6, 5, 4]
t=3: min=4 at idx 5    → swap → [1, 2, 3, 4, 5, 6]
t=4: min=5 at idx 4    → no-op
t=5: trivially done
```

[senior] Q: Bubble sort, insertion sort, and selection sort are all O(n²). When does selection sort win?

A: When writes are expensive and reads are cheap. Selection sort caps total writes at O(n) regardless of input — exactly one swap per outer pass. Bubble sort and insertion sort both have O(n²) writes worst case. On flash memory or EEPROM, where every write wears out a cell, that asymmetry matters. The other place selection sort shows up is in algorithms that build on it — heap sort is literally "selection sort with a heap for the find-min step," which drops the comparison cost from O(n²) to O(n log n) while keeping the O(n) write count.

Diagram:
```
Total writes across the sort (worst case):

bubble:    up to n(n-1)/2 swaps × 3 writes ≈ 1.5n²
insertion: up to n(n-1)/2 shifts × 1 write ≈ 0.5n²
selection: exactly n swaps × 3 writes      = 3n

n = 1000:
  bubble:    ~1.5M writes
  insertion: ~500k writes
  selection: ~3k writes      ← 500× fewer than insertion
```

[arch] Q: I'm designing firmware for an EEPROM-backed configuration store with 10,000 keys. Updates need to keep the keys sorted by ID. EEPROMs have a write-cycle limit of ~100k. Which sort do I use?

A: Selection sort or a variant of it. Each write costs you one cycle from the EEPROM's lifetime budget; sorting 10,000 keys with insertion sort worst case is ~25 million writes, which would burn through the entire EEPROM budget 250× over on a single sort. Selection sort caps at ~10,000 writes — well within budget for many sorts. Even better: cycle sort, which provably achieves the absolute minimum write count (each element gets written to its final position exactly once, so n writes total, no swaps). Both are O(n²) in time, which is acceptable because EEPROM read speeds are slow anyway — the binding constraint is write cycles, not comparison count.

Diagram:
```
EEPROM cost model: comparisons are ~free (reads), writes cost 1 cycle each
budget: 100k cycles total

bubble sort on 10k items:  ~1.5M writes  ◀── BURNS through 15 EEPROMs
insertion sort on 10k:     ~25M writes   ◀── BURNS through 250 EEPROMs
selection sort on 10k:     ~30k writes   ◀── fits in budget
cycle sort on 10k:         ~10k writes   ◀── best possible

→ ship selection or cycle sort, not the others
```

### The question candidates always dodge

Q: Selection sort has the same asymptotic class as bubble and insertion sort. If insertion sort beats it on small n (no best case, worse cache locality, equal asymptotic), and heap sort beats it on large n (O(n log n) vs O(n²)), why does selection sort exist at all in production code?

A: For exactly two reasons: (1) write-limited environments (EEPROM, flash, write-amplified storage) where the O(n) write count outweighs the O(n²) comparison count, and (2) as the algorithmic kernel of heap sort, where replacing the linear "find min" with a logarithmic "extract from heap" upgrades selection sort from O(n²) to O(n log n). In a plain in-memory sort of integers in V8, selection sort is genuinely never the right choice — insertion sort wins on small n, TimSort wins on large n. The reason selection sort survives in textbooks isn't that it's useful as-is; it's that understanding it is the prerequisite to understanding heap sort. So the honest answer is: as a standalone algorithm in modern application code, almost never. As a teaching tool and a stepping stone to heap sort, indispensable.

Diagram:
```
What we picked (selection sort)         What heap sort upgrades to
┌──────────────────────────────┐        ┌────────────────────────────┐
│ outer t = 0..n-1             │        │ outer t = 0..n-1            │
│   inner: linear scan O(n)    │        │   inner: heap extract O(log │
│   to find min                │        │   n) to find min            │
│   swap into bars[t]          │        │   place into bars[t]        │
└──────────────────────────────┘        └────────────────────────────┘
   O(n²) total                            O(n log n) total
   keep this for write-limited            keep this for general-purpose
   environments only                      O(n log n) sorting
```

### One-line anchors

- "Selection sort is the write-minimizing O(n²) sort — exactly n swaps, no matter what the input looks like."
- "No best case — sorted input runs in the same time as reverse-sorted. Bubble and insertion both have O(n) best cases; selection does not."
- "Not stable — equal keys can swap relative order via the long-distance swap step."
- "The right call in write-limited environments (EEPROM, flash). Almost never the right call in V8."
- "The algorithmic kernel of heap sort — replace the O(n) find-min with an O(log n) heap-extract and you get O(n log n)."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the selection-sort control flow: the outer loop with `t`, the inner loop with `a`, the `(minVal, minIndex)` tracking, and the single swap at the end of each outer iteration.

Open the file. Check:
- Did you show the outer-loop invariant ("`bars[0..t-1]` holds the t smallest values, sorted")?
- Did you show `minVal` initialized to `bars[t]` and `minIndex = t` *before* the inner loop?
- Did you show the inner loop only updating both when a new minimum is found?
- Did you show the swap happening exactly once per outer iteration?

### Level 2 — Explain it out loud

Explain selection sort to a colleague who asked "isn't this just bubble sort?" No notes. Under 90 seconds.

Checkpoints:
- Did you reference `src/app/sorting/selection-sort/page.tsx` L53–L77?
- Did you name selection sort's distinguishing property: O(n) writes, exactly?
- Did you mention "no best case" — sorted input takes the same time as reverse?
- Did you mention instability (equal keys can swap relative order)?

### Level 3 — Apply it to a new scenario

You're writing a function that sorts 50 user-defined keyboard shortcuts (struct: `{ key: string, command: string }`) by `key`. The data is stored in browser localStorage and rewritten on every modification. Should you use selection sort? Walk through the comparison with insertion sort using `src/app/sorting/selection-sort/page.tsx` L53–L77.

Write your answer in 3–5 sentences. Then verify: localStorage writes are JSON-serialized whole-blob writes, so the "writes are expensive" argument for selection sort doesn't translate — you rewrite the whole array on every change regardless of swap count. Insertion sort wins here for its O(n) best case on near-sorted data and its stability if `key` ties happen.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: selection sort has no best case. If you were starting today and the visualizer needed to demonstrate the *difference* between near-sorted and random inputs, would you keep selection sort or swap it for insertion sort? What does the page lose if you swap, and what does it gain?

Reference `src/app/sorting/selection-sort/page.tsx` L53–L77 vs `src/app/sorting/insertion-sort/page.tsx` L53–L74 to support your answer.

### Quick check — code reference test

Without opening any files:
- What file does the implementation live in?
- What two variables track the running minimum?
- How many swaps per outer iteration?

Open and verify.

Pass: you named `src/app/sorting/selection-sort/page.tsx`, `(minVal, minIndex)`, and exactly one swap per outer iteration.
Fail on swap count: re-read L69 — there's only one `[bars[t], bars[minIndex]] = ...` per outer iteration, even when it's a no-op swap-with-self.
