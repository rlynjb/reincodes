# Insertion sort

**Industry name(s):** Insertion sort, linear insertion sort
**Type:** Industry standard · Language-agnostic

> Builds a sorted prefix one element at a time by sliding the next element backward through the prefix until it finds its slot — O(n²) in general but O(n) on nearly-sorted input.

**See also:** → 02-bubble-sort.md · → 04-selection-sort.md · → 05-merge-sort.md

---

## Why care

You have an array of 50 bars on the page — `[23, 7, 41, 12, 55, ...]` — and instead of comparing every adjacent pair on every pass like bubble sort, imagine you instead keep growing a "sorted region" at the front of the array. Index 0 is trivially sorted. Then you look at `bars[1]` and slot it into the correct spot among `bars[0..1]`. Then `bars[2]` slides backward through `bars[0..2]` until it lands. By the time the outer loop reaches `bars[n-1]`, the whole array is sorted.

That "grow a sorted prefix by inserting each new element" routine is what *insertion sort* does. Not "compare adjacent in passes" like bubble — it commits to a sorted region and inserts new elements into it. It's the same shape you'd use mentally if you were sorting a stack of physical cards: you don't repeatedly scan the deck; you pick up one new card and slide it into the right place in the cards already in your hand.

**Why you need to answer that question at all:** because insertion sort is the inner loop of every production sort. TimSort (V8, Python) uses insertion sort on small runs. Introsort (C++ `std::sort`) falls back to insertion sort below a threshold. Quick sort implementations cut off recursion and switch to insertion sort for small partitions. The reason is that insertion sort has the same O(n²) asymptotic as bubble sort but a far smaller constant factor — on n ≤ 16 elements, it's measurably faster than every "better" algorithm. Knowing why is the gap between "I memorized algorithm tables" and "I understand what TimSort does."

Without understanding insertion sort:
- TimSort and Introsort are black boxes
- "O(n²) sorts are slow" is the only takeaway
- Near-sorted inputs look like nothing special

With it:
- TimSort's threshold makes sense: small runs are insertion-sort territory
- O(n²) splits into "O(n²) for random input, O(n) for near-sorted input"
- The asymptotic class hides a constant-factor difference that matters

Insertion sort is `cards.sort()` if you were doing it by hand with a physical deck — one card picked up, slid backward through your already-sorted hand until it fits.

---

## How it works

**The mental model: a sorted prefix that grows by one slot per outer iteration, with the new element sliding leftward through the prefix until it finds its place.**

You've built this exact shape before. Render a list with `.map()`, and every time the user inserts an item, you `array.splice(insertIndex, 0, newItem)` to put the new item in the correct slot — the existing items at `insertIndex..end` shift right by one to make room. Insertion sort is that operation iterated: take the next un-inserted item, find where it goes in the already-sorted prefix, shift the larger items right, drop it in.

```
the array, mid-sort:

   sorted prefix    │  unsorted suffix
   ───────────────  │  ───────────────
   [7, 12, 23, 41]  │  55, 18, 33, ...
                    ↑
                 outer-loop boundary

  next step: insert 55 into [7, 12, 23, 41]
    → 55 > 41, lands at the end, prefix becomes [7, 12, 23, 41, 55]
  next step after that: insert 18 into [7, 12, 23, 41, 55]
    → 18 slides left: past 55 (shift right), past 41 (shift right),
       past 23 (shift right), past 12 (no, 18 ≥ 12) → lands at index 2
```

The strategy: maintain the invariant "indices `[0..i-1]` are sorted." On each outer step, extend the invariant by one position.

### The outer loop — the sorted-prefix boundary

The variable `i` in the codebase is the boundary. Before iteration `i`, the slice `bars[0..i-1]` is sorted. The job of iteration `i` is to find the right home for `bars[i]` somewhere within that sorted prefix, extending it to `bars[0..i]`.

```
invariant at the top of each outer iteration:

  i=1:   [7, ?, ?, ?, ?, ?]   sorted prefix is just bars[0]=7
  i=2:   [7, 23, ?, ?, ?, ?]  inserted bars[1]=23 into [7]
  i=3:   [7, 23, 41, ?, ?, ?] inserted bars[2]=41 into [7, 23]
  i=4:   [7, 12, 23, 41, ?, ?] inserted bars[3]=12, slid back to index 1
  ...
```

The bridge from what you know. In React you maintain invariants every render — "after this `useEffect` runs, `data` matches `query`." Insertion sort maintains the same kind of invariant inside its loop: at every outer iteration, the left half of the array is guaranteed sorted, regardless of what happened to the right half.

### The inner loop — slide backwards through the prefix

The inner loop is where the "insert" actually happens. Take `temp = bars[i]`, then walk left through the sorted prefix, shifting any value larger than `temp` one slot to the right. When you find a value ≤ `temp` (or you reach index 0), drop `temp` into the empty slot.

```
inserting 18 into [7, 12, 23, 41, 55]:

start: temp = 18, red = 4 (pointing at 55)

step 1:  bars[4]=55 > 18  → shift 55 right
         [7, 12, 23, 41, 55, _]    red moves to 3
                          ↑
                       hole

step 2:  bars[3]=41 > 18  → shift 41 right
         [7, 12, 23, 41, 41, 55]
                      ↑ hole

step 3:  bars[2]=23 > 18  → shift 23 right
         [7, 12, 23, 23, 41, 55]
                  ↑ hole

step 4:  bars[1]=12 > 18? no → stop
         drop temp into bars[2]:
         [7, 12, 18, 23, 41, 55]   ← done, prefix extended by one
```

The bridge from what you know. This is the array equivalent of `Array.prototype.splice(insertAt, 0, value)` — shift everything from `insertAt` to the end one slot to the right, drop `value` into the cleared slot. Same shape, hand-rolled into a loop.

The practical consequence: on already-sorted input, the inner loop's condition (`bars[red] > temp`) is false on the very first check every time, so the inner loop fires zero shifts per outer step. The whole algorithm degenerates to a single pass of the outer loop — O(n).

### The early-exit case — sorted or near-sorted input

This is insertion sort's superpower. Bubble sort needs an *added* flag to detect "no work this pass." Insertion sort detects it for free: if `bars[i]` is already in the right place relative to `bars[i-1]`, the `while` condition fails on first iteration and the inner loop is skipped entirely.

```
already-sorted input: bars = [7, 12, 23, 41, 55, 60]

i=1: temp=12, bars[0]=7, 7 > 12? no → no shifts, drop in place
i=2: temp=23, bars[1]=12, 12 > 23? no → no shifts
i=3: temp=41, bars[2]=23, 23 > 41? no → no shifts
i=4: temp=55, bars[3]=41, 41 > 55? no → no shifts
i=5: temp=60, bars[4]=55, 55 > 60? no → no shifts

total work: n-1 comparisons, zero shifts → O(n)
```

This is why TimSort uses insertion sort on small runs and on detected pre-sorted regions. It costs O(n) to "verify" a region is sorted; if it is, you've spent linear time and produced a sorted result.

### The principle

Insertion sort embodies *incremental construction with an invariant*. Each step extends a known-good region by one. The work to extend depends on how far the new element has to travel — zero work if it's already in place, up to `i` shifts if it has to traverse the whole prefix. The total work is the sum of distances every element travels, which is exactly the number of inversions in the input. Sorted input has zero inversions → O(n). Random input has ~n²/4 expected inversions → O(n²). Reverse-sorted input has n(n-1)/2 inversions → worst-case O(n²). The algorithm's runtime is literally a measure of how unsorted the input is.

The full picture is below.

---

## Insertion sort — diagram

```
                  bars = [23, 7, 41, 12, 55, 18]
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ outer loop:  i = 0 .. n-1        │
                  │   invariant: bars[0..i-1] sorted │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ temp = bars[i]                   │
                  │ red  = i - 1                     │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ while (red >= 0 &&               │ ◀─┐
                  │        bars[red] > temp):        │   │
                  │   bars[red+1] = bars[red]        │   │
                  │   red--                          │   │
                  └──────────────┬───────────────────┘   │
                                 │  shift right, walk left
                                 └───────────────────────┘
                                 │  bars[red] <= temp
                                 ▼  OR red < 0
                  ┌──────────────────────────────────┐
                  │ bars[red+1] = temp               │
                  │ (drop temp into the hole)        │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ visualizer:                      │
                  │   setHighlightIndices([i])       │
                  │   setScanIndices(red)            │
                  │   await delayLoop(speed)         │
                  │   setBars([...bars])             │
                  └──────────────┬───────────────────┘
                                 │  i === n
                                 ▼
                  ┌──────────────────────────────────┐
                  │ bars = [7, 12, 18, 23, 41, 55]   │
                  └──────────────────────────────────┘
```

---

## In this codebase

**File:** `src/app/sorting/insertion-sort/page.tsx`
**Function:** `insertionSort` (inner async function inside `InsertionSort` component)
**Line range:** L53–L74

The shape, trimmed:

```
const insertionSort = async () => {
  for (let i = 0; i < bars.length; i++) {
    const temp = bars[i];
    let red = i - 1;

    while (red >= 0 && bars[red] > temp) {
      bars[red+1] = bars[red];
      red--;
      setHighlightIndices([i]);
      setScanIndices(red);
      await delayLoop(speed);
    }
    bars[red+1] = temp;
    setBars([...bars]);
  }
}
```

**Called from:** `useEffect` at L76–L80, which runs `insertionSort()` on mount.

**Visualizer hooks:**
- `highlightIndices` (state, L50) — `[i]` marks the outer-loop boundary (the element being inserted).
- `scanIndices` (state, L51) — `red` marks the current backward-scan position in the sorted prefix.
- `await delayLoop(speed)` fires *inside* the inner loop, once per shift. So insertion-sort animation speed is proportional to the number of shifts, not the number of outer iterations.

**The `temp` variable is the "card being held in your hand."** Without it, the value at `bars[i]` would be overwritten on the first shift (`bars[red+1] = bars[red]` would clobber it). Saving `temp` first preserves the value across all the shifts in the inner loop.

**Header complexity claim (L88):** `O(n²) avg/worst case`. The page omits the O(n) best-case mention that bubble sort's page has — even though insertion sort's best case is the more impressive of the two (insertion sort hits O(n) intrinsically; bubble sort only hits it with an added flag).

---

## Elaborate

### Where this pattern comes from

Insertion sort is one of the oldest sorting algorithms — pre-dates digital computers, since it's literally what humans do when sorting playing cards by hand. Donald Knuth's *The Art of Computer Programming* Vol. 3 (1973) gave it the formal analysis that established it as the canonical "small-n sort." It survived into modern production code because Tim Peters' TimSort (Python 2002, V8 ~2018, Java 2009) noticed that real-world arrays are full of partially-sorted runs, and insertion sort handles those runs faster than any O(n log n) alternative.

### The deeper principle

*Adaptive algorithms* — algorithms whose runtime depends on the input's existing structure, not just its size. Insertion sort's runtime is proportional to the number of inversions in the input: zero inversions → O(n), maximally unsorted → O(n²). This is the same property that makes naïve diff algorithms adaptive to small changes (O(n + d) where d is the edit distance), and the same reason rope data structures adapt to localized edits.

```
inversions = number of out-of-order pairs

[1, 2, 3, 4, 5]   →  0 inversions  → O(n) work
[5, 4, 3, 2, 1]   →  10 inversions → O(n²) work
[1, 2, 3, 5, 4]   →  1 inversion   → O(n) work + 1 shift
```

The general principle: an algorithm that does no more work than the input demands is *output-sensitive* or *input-adaptive*. Insertion sort is one of the simplest examples.

### Where this breaks down

Past ~50 elements on truly random input, the O(n²) factor dominates and insertion sort gets beaten by any O(n log n) sort. The crossover varies by hardware and language — V8 picks `n = 10` as TimSort's "minrun" threshold; Java's TimSort uses 32–64; Rust's pdqsort uses 24. Below that threshold insertion sort wins; above it, lose.

Insertion sort also struggles with linked lists and on-disk data — the inner loop's shifts are random-access writes, which are fine in RAM but catastrophic on disk or across cache lines.

### What to explore next

- Bubble sort → same complexity, same in-place property, but slower constant factor and no intrinsic best case.
- Selection sort → O(n²) always, but only one swap per pass; useful when writes are expensive.
- Merge sort → O(n log n) always; the trade is auxiliary O(n) space.
- TimSort → the production sort built on top of insertion sort (small runs) + merge sort (large runs).
- Shell sort → insertion sort generalised with gap sequences; O(n^1.3) average without the O(n log n) overhead.

---

## How it works — brute force vs optimal

### The data

```
bars: number[] of length n
range: [1, 60] from generateArrayOfRandomNumbers
example: [23, 7, 41, 12, 55, 18]
```

### The problem

Sort `bars` ascending, in place. Each insertion of `bars[i]` must end with `bars[0..i]` sorted.

### ── Brute force (linear scan with shifts — the codebase implementation) ──

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

**Execution trace** — `bars = [23, 7, 41, 12, 55, 18]`, n = 6:

```
i=0: temp = 23, red = -1
     while red >= 0: false (skip)
     bars[0] = 23  (no-op)
     bars = [23, 7, 41, 12, 55, 18]

i=1: temp = 7, red = 0
     iter: bars[0]=23 > 7? yes
       shift: bars[1] = 23
       bars = [23, 23, 41, 12, 55, 18], red = -1
     while red >= 0: false → exit
     bars[0] = temp(7)
     bars = [7, 23, 41, 12, 55, 18]    (prefix [7, 23] sorted)

i=2: temp = 41, red = 1
     iter: bars[1]=23 > 41? no → exit
     bars[2] = temp(41)  (no-op, was already 41)
     bars = [7, 23, 41, 12, 55, 18]    (prefix [7, 23, 41] sorted)

i=3: temp = 12, red = 2
     iter: bars[2]=41 > 12? yes
       shift: bars[3] = 41
       bars = [7, 23, 41, 41, 55, 18], red = 1
     iter: bars[1]=23 > 12? yes
       shift: bars[2] = 23
       bars = [7, 23, 23, 41, 55, 18], red = 0
     iter: bars[0]=7 > 12? no → exit
     bars[1] = temp(12)
     bars = [7, 12, 23, 41, 55, 18]    (prefix [7, 12, 23, 41] sorted)

i=4: temp = 55, red = 3
     iter: bars[3]=41 > 55? no → exit
     bars[4] = temp(55)  (no-op)
     bars = [7, 12, 23, 41, 55, 18]    (prefix [7, 12, 23, 41, 55] sorted)

i=5: temp = 18, red = 4
     iter: bars[4]=55 > 18? yes
       shift: bars[5] = 55
       bars = [7, 12, 23, 41, 55, 55], red = 3
     iter: bars[3]=41 > 18? yes
       shift: bars[4] = 41
       bars = [7, 12, 23, 41, 41, 55], red = 2
     iter: bars[2]=23 > 18? yes
       shift: bars[3] = 23
       bars = [7, 12, 23, 23, 41, 55], red = 1
     iter: bars[1]=12 > 18? no → exit
     bars[2] = temp(18)
     bars = [7, 12, 18, 23, 41, 55]    (whole array sorted)
```

Variable state at the end of every outer step:

```
i  | temp | inner shifts | bars after step
───┼──────┼──────────────┼─────────────────────────────
0  |  23  | 0            | [23, 7, 41, 12, 55, 18]
1  |   7  | 1            | [7, 23, 41, 12, 55, 18]
2  |  41  | 0            | [7, 23, 41, 12, 55, 18]
3  |  12  | 2            | [7, 12, 23, 41, 55, 18]
4  |  55  | 0            | [7, 12, 23, 41, 55, 18]
5  |  18  | 3            | [7, 12, 18, 23, 41, 55]
                  total shifts: 6 — equals the number of inversions
```

**Complexity:** O(n²) time worst case · O(n) time best case (sorted input) · O(1) space

**What goes wrong at scale:** at n = 10,000 on random input, ~25 million inner-loop shifts. V8 does these as simple integer writes at ~200M ops/sec, so the sort finishes in ~125ms — borderline acceptable. At n = 100,000, ~2.5 billion shifts, ~12 seconds — tab locks. Past n ≈ 50, any O(n log n) sort wins; the only reason production sorts still call insertion sort is for tiny sub-arrays inside a larger O(n log n) divide-and-conquer.

### ── Optimal (binary-search insertion + shift) ──

**The insight:** insertion sort's inner loop does *two* things on each iteration — it finds the insertion point (a comparison) and it shifts one slot (a write). The find step can be replaced with a binary search, since the prefix is already sorted. The shift step still has to happen — there's no way to make room without moving elements. So binary insertion sort drops the comparison count to O(log n) per outer step (total O(n log n) comparisons) while keeping the shift count at O(n) per outer step worst-case (total O(n²) writes).

**Pseudocode:**

```
for i from 0 to n-1:
    temp = bars[i]
    insertPos = binarySearch(bars, 0, i, temp)  // O(log i)
    for j from i down to insertPos + 1:         // shift right
        bars[j] = bars[j-1]
    bars[insertPos] = temp
```

**Execution trace** — `bars = [7, 23, 41, 55, 12]`, inserting `temp = 12` at i=4:

```
i=4: temp = 12
     binarySearch [7, 23, 41, 55] for 12:
       low=0, high=4
       mid=2, bars[2]=41 > 12 → high=2
       mid=1, bars[1]=23 > 12 → high=1
       mid=0, bars[0]=7 < 12 → low=1
       exit, insertPos=1

     shift j from 4 down to 2:
       bars[4] = bars[3] = 55  → [7, 23, 41, 55, 55]
       bars[3] = bars[2] = 41  → [7, 23, 41, 41, 55]
       bars[2] = bars[1] = 23  → [7, 23, 23, 41, 55]

     bars[1] = temp(12)        → [7, 12, 23, 41, 55]
```

Same result as brute force, but uses ~log₂(4) = 2 comparisons instead of 3.

**Complexity:** O(n log n) comparisons · O(n²) writes · O(1) space

**Why it's faster:** comparisons get cheaper. On platforms where comparison is expensive (string sort with locale-aware compare, deep-equality on objects), binary insertion sort is meaningfully faster than linear. On native integer arrays it barely helps — the shifts dominate.

### ── Comparison ──

```
┌─────────────────┬───────────────────┬──────────────────────┐
│                 │ Linear insertion  │ Binary insertion     │
├─────────────────┼───────────────────┼──────────────────────┤
│ Worst time      │ O(n²)             │ O(n²) writes,        │
│                 │                   │ O(n log n) comps     │
│ Best time       │ O(n)              │ O(n log n)           │
│ Space           │ O(1)              │ O(1)                 │
│ Stable          │ yes               │ yes                  │
│ At n=50 random  │ ~625 ops          │ ~625 writes + 280   │
│                 │                   │ comparisons          │
│ At n=10k random │ ~25M ops          │ ~25M writes +        │
│                 │                   │ ~130k comps          │
│ Useful when     │ cheap compare,    │ expensive compare    │
│                 │ small n           │ (strings, objects)   │
└─────────────────┴───────────────────┴──────────────────────┘
```

**When brute force is fine:** for integer arrays under n ≈ 50, the linear scan is faster than the binary scan because the constant overhead of binary search (the loop, the bounds, the mid calculation) exceeds the savings on so few comparisons. Below that, just use the linear version.

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬───────────────────────┬───────────────────────┐
│ Cost dimension   │ Insertion sort        │ Selection sort        │
├──────────────────┼───────────────────────┼───────────────────────┤
│ Time worst       │ O(n²)                 │ O(n²)                 │
│ Time best        │ O(n) intrinsic        │ O(n²) always          │
│ Space            │ O(1)                  │ O(1)                  │
│ Writes per pass  │ varies (0 to i)       │ exactly 1 swap        │
│ Cache locality   │ excellent (sequential │ poor (whole-array     │
│                  │ inner walk)           │ scan per pass)        │
│ Stable           │ yes                   │ no                    │
│ Lines of code    │ ~7                    │ ~8                    │
│ Used in          │ TimSort small runs    │ rare in production    │
└──────────────────┴───────────────────────┴───────────────────────┘
```

### Sub-block 1 — what we gave up

Worst-case O(n²) writes. On reverse-sorted input, every outer iteration shifts the entire sorted prefix one slot to the right — n(n-1)/2 ≈ n²/2 total writes. At n = 10,000 on the visualizer, that's 50 million writes, plus 50 million awaits of `delayLoop(speed)` interleaved. The animation would run for hours.

The codebase implementation calls `await delayLoop(speed)` *inside* the inner loop (L64), once per shift, instead of once per outer iteration. This makes the animation accurate (you see every shift) but means runtime grows with the number of inversions, not with `n`. A user running the visualizer on a reverse-sorted input of 50 bars sees ~1,225 shifts; at `speed = 100ms`, that's two full minutes of animation.

### Sub-block 2 — what the alternative would have cost

If the visualizer batched the shifts inside one outer iteration and called `delayLoop` only once per `i`, the animation would show the *result* of the insertion but not the slide. The user would see "23 was here, now it's there" without seeing the journey. Same complexity, very different educational experience.

If the visualizer used binary insertion sort, comparisons would drop to O(log n) per insertion but writes would stay O(n²). The animation would feel slightly faster on the comparison side and identical on the write side — not a clear win for educational value.

If the visualizer used merge sort (O(n log n) always, see `05-merge-sort.md`), the user would learn a fundamentally different algorithm shape (divide-and-conquer) instead of a tighter O(n²). Worth it for variety; not a substitute for insertion sort.

### Sub-block 3 — the breakpoint

Insertion sort is the right choice for n ≤ 16 in production code (TimSort, Introsort, pdqsort all confirm this). Above that, switch to an O(n log n) sort. For the visualizer the breakpoint is different: the algorithm stays educational up to ~100 bars; above that, the time spent watching shifts on a reverse-sorted input exceeds anyone's attention span.

### Sub-block 4 — what wasn't actually a tradeoff

Counting sort / radix sort were not real alternatives for this visualizer. Both are O(n + k) (where k is the value range), so they beat insertion sort asymptotically on the codebase's `[1, 60]` integer range. But they have no comparison-based "shape" to visualize — the work happens in a counting array, not in the bars themselves. They'd produce a sorted result with no observable algorithmic steps. The visualizer needs an algorithm where every step is *visible in the bars*; insertion sort qualifies, counting sort doesn't.

---

## Tech reference (industry pairing)

### TimSort (V8 Array.prototype.sort)

- **Codebase uses:** not used by the visualizer — `Array.prototype.sort` is the production answer this page deliberately avoids to keep the algorithm visible.
- **Why it's here:** the canonical production sort the codebase's insertion sort exists to teach the foundation of.
- **Leading today:** TimSort — adoption-leading for general-purpose sorting in V8, Python, Java 7+, 2026.
- **Why it leads:** hybrid merge + insertion sort; insertion sort handles small runs (≤ 32–64 elements) where its O(n²) constant is dominated; merge sort handles the rest with stable O(n log n).
- **Runner-up:** Pattern-defeating quicksort (pdqsort, used in Rust `slice::sort_unstable`) — innovation-leading on truly random inputs, sacrifices stability for throughput.

### React useEffect for animation kickoff

- **Codebase uses:** `useEffect(() => { insertionSort(); }, [])` at L76–L80 to start the sort on mount.
- **Why it's here:** the visualizer should start sorting as soon as the page renders. `useEffect` with empty deps fires once after mount, which is exactly the right timing.
- **Leading today:** `useEffect` — adoption-leading for mount/unmount side effects in React, 2026.
- **Why it leads:** stable since React 16.8, well-understood, integrates with the React render cycle so async work like the insertion sort doesn't block the initial paint.
- **Runner-up:** `useEffectEvent` (React experimental) for non-reactive event handlers; `useSyncExternalStore` for syncing to an external animation library — neither applies cleanly here.

---

## Summary

Insertion sort builds a sorted prefix one element at a time: for each `bars[i]`, save it as `temp`, then walk left through the sorted prefix shifting larger values right, and drop `temp` into the gap. In this codebase it lives in `src/app/sorting/insertion-sort/page.tsx` L53–L74, with `await delayLoop(speed)` firing once per inner-loop shift so the user can see every backward slide. The constraint that made it the right call here is the same as for bubble sort — show every step — but with the bonus that the algorithm has an *intrinsic* O(n) best case, which the visualizer demonstrates the moment a near-sorted input is fed in. The cost is O(n²) writes on random or reverse input, which is fine at n = 50 but unsustainable past n ≈ 100 for animated runs.

- One outer loop building the sorted prefix; one inner loop sliding the new element backward into its slot.
- `temp` is the "card in hand" — the value saved from `bars[i]` before any shifts so it isn't clobbered.
- O(n) on already-sorted input is *intrinsic* — no flag needed; the inner loop just doesn't fire.
- Total work equals the number of inversions in the input — sorted input has zero, reverse-sorted has n(n-1)/2.
- Production sorts (TimSort, Introsort, pdqsort) all use insertion sort on small sub-arrays for its tight constant factor.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about insertion sort, they're checking whether you understand *adaptivity* — that an algorithm's runtime can depend on the input's structure, not just its size. They're also checking whether you know why TimSort and Introsort use insertion sort at the bottom of their recursion. A weak answer gives the O(n²) tag and stops. A strong answer says "O(n²) worst case, O(n) best case, and this is exactly why every production sort calls it for small runs."

### Likely questions

[mid] Q: Walk me through insertion sort on `[5, 2, 4, 6, 1, 3]`.

A: Outer loop iterates `i = 0..5`. For each `i`, save `temp = bars[i]`, then slide leftward through the sorted prefix, shifting any larger value right. At `i = 1`, `temp = 2` slides past 5 → `[2, 5, 4, 6, 1, 3]`. At `i = 2`, `temp = 4` slides past 5 → `[2, 4, 5, 6, 1, 3]`. At `i = 3`, `temp = 6` stays → no shift. At `i = 4`, `temp = 1` slides all the way to index 0 → `[1, 2, 4, 5, 6, 3]`. At `i = 5`, `temp = 3` slides past 6, 5, 4 → `[1, 2, 3, 4, 5, 6]`.

Diagram:
```
[5, 2, 4, 6, 1, 3]
i=1: 2 slides past 5  → [2, 5, 4, 6, 1, 3]
i=2: 4 slides past 5  → [2, 4, 5, 6, 1, 3]
i=3: 6 stays          → [2, 4, 5, 6, 1, 3]
i=4: 1 slides all way → [1, 2, 4, 5, 6, 3]
i=5: 3 slides 3 slots → [1, 2, 3, 4, 5, 6]
```

[senior] Q: Bubble sort and insertion sort are both O(n²). When does the constant factor matter, and which one is faster in practice?

A: Insertion sort is faster on real inputs, by a measurable margin. Two reasons. First, insertion sort's inner loop is one comparison and one shift; bubble sort's inner loop is one comparison and potentially one swap (three writes). Per inner iteration, insertion sort does fewer writes. Second, insertion sort hits O(n) intrinsically on near-sorted input; bubble sort needs an explicit `swapped` flag to detect the same case. In production code, TimSort uses insertion sort on runs under 32 elements; nobody uses bubble sort. So the constant factor matters: same big-O, very different real-world speed.

Diagram:
```
Per inner iteration:

bubble (swap):                insertion (shift):
  tmp = bars[r-1]               bars[red+1] = bars[red]
  bars[r-1] = bars[r]           red--
  bars[r] = tmp
  → 3 writes per swap           → 1 write per shift

near-sorted input:
  bubble: walks every pair      insertion: while loop exits
  → O(n²) without flag          immediately → O(n) intrinsic
```

[arch] Q: You're building a real-time leaderboard that gets new score updates every second. The leaderboard is mostly sorted, with one or two scores changing position per update. Which sort do you use?

A: Insertion sort, hands down. The leaderboard is the textbook "near-sorted" case. After every update, you have one element that's out of place by some small distance d. Insertion sort handles that in O(n + d) — re-verify the sorted prefix (n comparisons that all succeed) and shift the one out-of-place element into its new slot (d shifts). At n = 1000 with d = 5, that's ~1,005 operations per update. A naive "sort the whole leaderboard" with TimSort is O(n log n) ≈ 10,000 ops — 10× slower for this exact case. The lesson is that asymptotic analysis ignores the structure of real inputs; for this workload, the O(n²) sort is faster than the O(n log n) sort.

Diagram:
```
Leaderboard, n = 1000, one score moved 5 positions:

Insertion sort:               TimSort full re-sort:
verify prefix:    1000 ops    full sort: ~10,000 ops
shift one item:      5 ops    ← always full work
total:           1005 ops

→ insertion sort wins on adaptive inputs
→ this is exactly what TimSort does internally for small runs
```

### The question candidates always dodge

Q: Insertion sort is O(n²). Why is it the inner loop of TimSort, which is supposed to be O(n log n)?

A: Because asymptotic complexity hides a constant factor that flips the comparison below a threshold. For arrays under ~32 elements, insertion sort's tight inner loop (one comparison, one write, sequential memory access) beats merge sort's recursive calls + temporary array allocation + merge step. The crossover varies by hardware and language, but every production sort confirms it: TimSort uses 32–64 as the minrun, Introsort uses 16, pdqsort uses 24. The reason "O(n²) inside O(n log n)" isn't a contradiction is that O(n²) on n = 16 is 256 operations, while merge sort's overhead on the same 16 elements is dominated by recursion and allocation — much higher than 256 even though the asymptotic class is better. The lesson is that big-O is a tool for reasoning about scale, not for picking algorithms at small n.

Diagram:
```
Crossover between insertion and merge sort:

  n      | insertion (≈ n²/2) | merge (≈ n log n + overhead)
  ───────┼────────────────────┼──────────────────────────────
   8     |        32 ops      |    ~80 ops (overhead-heavy)
  16     |       128 ops      |    ~200 ops
  32     |       512 ops      |    ~500 ops      ← crossover
  64     |     2,048 ops      |  ~1,200 ops
  128    |     8,192 ops      |  ~2,700 ops      merge wins
  1000   |   500,000 ops      | ~30,000 ops      merge dominates
```

### One-line anchors

- "Insertion sort is what every production sort uses for small sub-arrays — TimSort, Introsort, pdqsort all confirm it."
- "O(n²) worst case, O(n) intrinsic best case — total work equals number of inversions."
- "The `temp` variable is the card in your hand; without it, the first shift clobbers the value."
- "Same asymptotic class as bubble sort, smaller constant factor, intrinsic best case — strictly better on the same problem."
- "Adaptive: runtime depends on input structure, not just input size."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the insertion-sort control flow: the outer loop (the sorted-prefix boundary), the inner `while` loop (the backward slide), the role of `temp`, and the final drop into `bars[red+1]`.

Open the file. Check:
- Did you mark the invariant ("`bars[0..i-1]` is sorted") at the top of each outer iteration?
- Did you show `temp = bars[i]` saved *before* any shifts?
- Did you show the inner-loop exit conditions (`red < 0` OR `bars[red] <= temp`)?
- Did you show the final `bars[red+1] = temp` drop?

### Level 2 — Explain it out loud

Explain insertion sort to a colleague who just asked "why is this in V8's source code if it's O(n²)?" No notes. Under 90 seconds.

Checkpoints:
- Did you reference `src/app/sorting/insertion-sort/page.tsx` L53–L74?
- Did you say O(n²) worst case but O(n) intrinsic best case?
- Did you mention TimSort uses it for small runs and explain why (constant-factor crossover below n ≈ 32)?
- Did you contrast with bubble sort (insertion has intrinsic best case; bubble needs a flag)?

### Level 3 — Apply it to a new scenario

You're given a function `addScoreToLeaderboard(scores, newScore)` that keeps `scores` sorted descending. The leaderboard has 1,000 entries. Walk through how you'd use the insertion-sort inner loop pattern (without doing a full re-sort) to insert `newScore` in O(n) worst case. Reference `src/app/sorting/insertion-sort/page.tsx` L58–L66 — that's the inner loop shape you'd reuse.

Write your answer in 3–5 sentences. Then open the file and verify whether the shape transfers directly (push the new score to the end, then run the inner loop once with `i = n-1`).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the visualizer calls `await delayLoop(speed)` inside the inner loop, once per shift. This makes the animation accurate but means reverse-sorted input of 50 bars takes ~2 minutes at speed = 100ms. If you were starting today and wanted the visualizer usable up to n = 200, how would you change the animation timing without losing the "show every step" property?

Reference `src/app/sorting/insertion-sort/page.tsx` L58–L66 to support your answer.

### Quick check — code reference test

Without opening any files:
- What file does the implementation live in?
- What's the variable that holds the value being inserted?
- What direction does the inner loop walk?

Open and verify.

Pass: you named `src/app/sorting/insertion-sort/page.tsx`, `temp`, and right-to-left (decreasing `red`).
Fail on direction: re-read L58 — the inner loop walks `red` leftward through the sorted prefix.
