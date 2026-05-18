# Bubble sort

**Industry name(s):** Bubble sort, sinking sort, exchange sort
**Type:** Industry standard · Language-agnostic

> Walk the array from one end to the other, swap any adjacent pair that's out of order, repeat until no swap fires — the largest unsorted value "bubbles" to its final position on every pass.

**See also:** → 01-array-of-random-numbers.md · → 03-insertion-sort.md · → 04-selection-sort.md

---

## Why care

You have an array of 50 bars rendered on the page — `[23, 7, 41, 12, 55, ...]` — and you want to watch them sort. The simplest mental model is: look at the first two, swap if they're out of order, look at the next two, swap if they're out of order, keep walking. By the time you reach the end, the biggest value you saw is now at the end. Do that whole walk N times and the array is sorted.

That "compare adjacent, swap if wrong, repeat" routine is what *bubble sort* does. Not a divide-and-conquer trick, not a binary-tree structure — just one nested loop and one swap. It's the algorithm everyone writes when they're given five minutes and a whiteboard, because the only thing you need to remember is "compare next door, swap if needed."

**Why you need to answer that question at all:** because the simplest sort that exists is the baseline every other sort improves on. Every "O(n log n) sort is faster than O(n²) sort" comparison you've seen assumes you understand what an O(n²) sort looks like at execution time — what runs, in what order, how many swaps fire, where the work is wasted. Bubble sort is that O(n²) reference. Until you've watched it touch every pair on every pass, the "log n" in merge sort and quick sort is just notation.

Without understanding bubble sort:
- "O(n²) sort" is an abstract complexity tag
- The animation in `/sorting/bubble-sort` looks like random shuffling
- "Why is merge sort faster" has no shape

With it:
- O(n²) means: every element gets compared against every other element, on average
- The animation has structure: each pass moves the largest unsorted value to the right edge
- Merge sort's win is visible: it avoids comparing pairs that are already in different halves

Bubble sort is the `.sort((a, b) => a - b)` you'd write yourself if `Array.prototype.sort` didn't exist — adjacent-compare in a nested loop, dead simple, and slow.

---

## How it works

**The mental model: an inner walk that drags the smallest value left, repeated until the array is sorted.**

You've already written half of this pattern. When you implement "find the smallest item in a list and put it at the front," you scan the list once. Bubble sort does the same scan, but it doesn't *find* the smallest — it *drags* it. On each step it compares two adjacent values, swaps them if they're wrong, then moves one step over. By the time the scan ends, the smallest value has been shuffled leftward through every comparison, and the largest in that scan has settled to the right.

```
one pass through an array, comparing adjacent pairs:

    [23, 7, 41, 12, 55]
     ^^^^                  compare 23 vs 7 → swap
    [7, 23, 41, 12, 55]
        ^^^^^              compare 23 vs 41 → no swap
    [7, 23, 41, 12, 55]
            ^^^^^          compare 41 vs 12 → swap
    [7, 23, 12, 41, 55]
                ^^^^^      compare 41 vs 55 → no swap
    [7, 23, 12, 41, 55]    ← 55 is now in its final position
                     ^
```

The strategy: one pass guarantees the biggest unsorted value reaches its final spot. Repeat the pass and the next-biggest settles. After N passes, the array is sorted.

### The inner loop — one adjacent comparison

This is the load-bearing line of the algorithm. Look at any two adjacent indices, compare, swap if the left one is larger. In React terms: it's the same kind of `prev > curr` check you'd use in a `useMemo` dependency comparison, except instead of triggering a re-render, it triggers a swap of two array slots.

```
inner loop body:
┌────────────────────────────┐
│ if (bars[r] < bars[r-1]):  │  ← out-of-order pair
│     swap(bars[r], bars[r-1]) │
└────────────────────────────┘
        │
        ▼
  smaller value now at r-1
  larger value now at r
```

The bridge from what you know. In React, you write `array.map((item, i) => array[i] !== array[i-1] && doSomething())` patterns all the time. Bubble sort is that pattern's loop sibling — compare each pair, act on each pair, walk on.

The practical consequence: after one full pass over the array, the largest value has moved as far right as it can. The next pass needs only to walk the *unsorted prefix* — the last position is locked.

### The outer loop — repeated passes until done

The outer loop says "do that whole inner pass `n` times." The `i` index counts the number of completed passes; after pass `i`, the rightmost `i` positions are locked (they hold the `i` largest values).

```
outer iteration counter:
┌────────────────────────────────────────────────┐
│ pass i=0: bubble largest of [0..n-1] to n-1    │
│ pass i=1: bubble largest of [0..n-2] to n-2    │
│ pass i=2: bubble largest of [0..n-3] to n-3    │
│  ...                                           │
│ pass i=n-1: trivially done                     │
└────────────────────────────────────────────────┘
```

The codebase implementation in `src/app/sorting/bubble-sort/page.tsx` L55–L75 inverts the inner walk — it walks *right to left*, comparing `bars[r]` against `bars[r-1]`. This sinks the *smallest* unsorted value to the *left edge* on each pass, instead of bubbling the largest to the right. The asymptotic behavior is identical; only the direction differs. The header comments still say `time complexity: O(n^2) avg/worst case · O(n) best case` (L90–L92).

```
codebase variant (smallest-to-left):

inner loop walks r from n-1 down to i+1:
  compare bars[r] vs bars[r-1], swap if bars[r] < bars[r-1]

  [23, 7, 41, 12, 55]    pass i=0, r walks 4 → 1
  → 12 vs 55  (no swap)
  → 41 vs 12  (swap)  [23, 7, 12, 41, 55]
  → 7  vs 12  (no swap)
  → 23 vs 7   (swap)  [7, 23, 12, 41, 55]
                       ^                       7 (smallest) sunk to index 0
```

### The principle

Bubble sort is what every comparison sort looks like with zero cleverness applied. You compare adjacent values; if they're wrong, you fix them. You do that until you can't find anything to fix. That guarantee — "if no swap fired this pass, the array must be sorted" — is the algorithmic property that lets early-exit shave it down to O(n) on already-sorted input. Every faster comparison sort builds on this baseline by either skipping comparisons (insertion sort's binary search), comparing across halves (merge sort), or partitioning around pivots (quick sort).

The full picture is below.

---

## Bubble sort — diagram

```
                  bars = [23, 7, 41, 12, 55, 18]
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ outer loop:  i = 0 .. n-1        │
                  │   "pass i locks rightmost i+1    │
                  │    largest values"               │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ inner loop:  r = n-1 .. i+1      │
                  │   compare bars[r] vs bars[r-1]   │
                  │   if bars[r] < bars[r-1]: swap   │
                  └──────────────┬───────────────────┘
                                 │  every pass
                                 ▼
                  ┌──────────────────────────────────┐
                  │ visualizer:                      │
                  │   setHighlightIndices([i])       │
                  │   setScanIndices(r)              │
                  │   await delayLoop(speed)         │
                  │   setBars([...bars])             │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ after pass i:                    │
                  │   bars[0..i] holds the i+1       │
                  │   smallest values, sorted        │
                  │   (codebase walks right-to-left, │
                  │    so smallest sinks left)       │
                  └──────────────┬───────────────────┘
                                 │  i === n-1
                                 ▼
                  ┌──────────────────────────────────┐
                  │ bars = [7, 12, 18, 23, 41, 55]   │
                  └──────────────────────────────────┘
```

---

## In this codebase

**File:** `src/app/sorting/bubble-sort/page.tsx`
**Function:** `bubbleSort` (inner async function inside `BubbleSort` component)
**Line range:** L54–L76

The shape, trimmed:

```
const bubbleSort = async () => {
  for (let i = 0; i < bars.length; i++) {
    for (let r = bars.length - 1; r > i; r--) {
      if (bars[r] < bars[r-1]) {
        const highval = bars[r-1];
        bars[r-1] = bars[r];
        bars[r] = highval;

        setHighlightIndices([i]);   // parent pointer
        setScanIndices(r);          // current comparison
        await delayLoop(speed);
        setBars([...bars]);
      }
    }
    // when last pass completes, clear the highlight
  }
}
```

**Called from:** `useEffect` at L78–L82, which runs `bubbleSort()` on mount.

**Visualizer hooks:**
- `highlightIndices` (state, L51) — the `[i]` value marks the current outer-loop boundary; `ArrayVisualizer` renders these bars in a distinct color.
- `scanIndices` (state, L52) — the `r` value marks the bar currently being compared; renders as the "scan cursor."
- `setBars([...bars])` — forces React to re-render. Without spreading into a new array, React's reference-equality check would skip the update and the user would see nothing animate.

**The complete data flow per swap:**

```
1. compare bars[r] < bars[r-1]
2. swap in-place (mutate the existing array)
3. setHighlightIndices([i])  → React schedules re-render
4. setScanIndices(r)         → React schedules re-render
5. await delayLoop(speed)    → yields to the event loop for `speed` ms
6. setBars([...bars])        → spread forces a new reference
```

The `await delayLoop(speed)` is the heart of the visualizer pattern — without it, all the swaps would batch into one frame and the animation would never play.

**No early-exit optimization.** The textbook bubble sort has an `if (!swapped) break` after each pass to drop to O(n) on already-sorted input. The codebase doesn't track that flag — every run is the full O(n²) regardless of input. For a visualizer of 50 bars this is invisible. For real usage it'd be the first thing to add.

---

## Elaborate

### Where this pattern comes from

Bubble sort dates to the 1950s — one of the first sorting algorithms taught in computer-science courses because it requires no auxiliary data structures and the swap step generalizes to any type with a comparator. Edsger Dijkstra famously called it "a sorting algorithm that has nothing to recommend it." It survived in textbooks not as a production tool but as the pedagogical baseline — the algorithm against which all other sorts are introduced.

### The deeper principle

Local exchange. Bubble sort fixes only adjacent pairs and trusts that repeated local fixes eventually compose into a globally sorted order. This is the same idea behind cellular automata, lattice-based numerical methods, and gradient descent — make small local corrections, repeat, converge. The cost of pure locality is that information moves slowly: a value at index 0 that belongs at index N takes N passes to reach its destination, one swap at a time.

```
how a small value at the right edge travels left:

  pass 0:  ..., 41, 55, 7  →  ..., 41, 7, 55
  pass 1:  ..., 41, 7, ..  →  ..., 7, 41, ..
  pass 2:  .. 7, .. ..     →  7, .. .. ..

  K passes to traverse K positions — purely local moves
```

### Where this breaks down

Past a few thousand elements bubble sort becomes embarrassingly slow. At n = 10,000, it runs ~50 million comparisons on random input — visible as a hang in a browser tab. Any production code uses `Array.prototype.sort` (TimSort in V8, ~O(n log n) with O(n) on near-sorted input). The only place bubble sort survives is: (1) tiny arrays where the constant factor matters more than the asymptotic; (2) teaching contexts where the simplicity is the point; (3) embedded systems where binary size is constrained.

### What to explore next

- Insertion sort → the same O(n²) class, but builds a sorted prefix instead of bubbling a sorted suffix; faster constant factor on near-sorted inputs.
- Selection sort → same O(n²) class, but does only one swap per pass; useful when writes are expensive.
- Cocktail-shaker sort → bidirectional bubble sort, faster on inputs where small values sit at the right edge.
- TimSort → the V8 / Python production sort, hybrid merge + insertion sort, O(n log n) worst case, O(n) on near-sorted input.

---

## How it works — brute force vs optimal

### The data

```
bars: number[] of length n
ranges: [1, 60] (from generateArrayOfRandomNumbers)
example: [23, 7, 41, 12, 55, 18]
```

### The problem

Sort `bars` ascending, in place, so `ArrayVisualizer` re-renders the bars in increasing-height order.

### ── Brute force (current implementation, no early exit) ──

**Pseudocode:**

```
for i from 0 to n-1:
    for r from n-1 down to i+1:
        if bars[r] < bars[r-1]:
            swap(bars[r], bars[r-1])
```

**Execution trace** — `bars = [23, 7, 41, 12, 55, 18]`, n = 6:

```
pass i=0 (inner r: 5 → 1):
  r=5:  bars[5]=18, bars[4]=55  →  18<55 swap  →  [23, 7, 41, 12, 18, 55]
  r=4:  bars[4]=18, bars[3]=12  →  18<12? no
  r=3:  bars[3]=12, bars[2]=41  →  12<41 swap  →  [23, 7, 41, 12, 18, 55]
                                                   wait — values shifted earlier
        recompute after prior swap: [23, 7, 41, 12, 18, 55]
        actually after the r=5 swap the array is [23, 7, 41, 12, 18, 55]
        r=4: 18 vs 12 → no swap
        r=3: 12 vs 41 → swap → [23, 7, 12, 41, 18, 55]
        but wait, r=4 was 18 vs 12; after the r=3 swap r=4 isn't revisited.
        Let's restart this trace carefully — the loop decrements r each step.

restart pass i=0:
  bars = [23, 7, 41, 12, 55, 18]
  r=5: compare bars[5]=18, bars[4]=55 → 18 < 55 → swap
       bars = [23, 7, 41, 12, 18, 55]
  r=4: compare bars[4]=18, bars[3]=12 → 18 < 12 false → no swap
  r=3: compare bars[3]=12, bars[2]=41 → 12 < 41 → swap
       bars = [23, 7, 12, 41, 18, 55]
  r=2: compare bars[2]=12, bars[1]=7  → 12 < 7 false → no swap
  r=1: compare bars[1]=7,  bars[0]=23 → 7 < 23 → swap
       bars = [7, 23, 12, 41, 18, 55]

  end of pass i=0:
  bars = [7, 23, 12, 41, 18, 55]
  smallest value (7) is sunk to index 0 ✓

pass i=1 (inner r: 5 → 2):
  bars = [7, 23, 12, 41, 18, 55]
  r=5: 55 < 18? no
  r=4: 18 < 41? yes → swap → [7, 23, 12, 18, 41, 55]
  r=3: 18 < 12? no
  r=2: 12 < 23? yes → swap → [7, 12, 23, 18, 41, 55]
  end: [7, 12, 23, 18, 41, 55]    (12 sunk to index 1)

pass i=2 (inner r: 5 → 3):
  r=5: 55 < 41? no
  r=4: 41 < 18? no
  r=3: 18 < 23? yes → swap → [7, 12, 23, 18, 41, 55]  wait
       actually [7, 12, 23, 18, 41, 55] after the swap becomes [7, 12, 18, 23, 41, 55]
  end: [7, 12, 18, 23, 41, 55]    (18 sunk to index 2)

pass i=3 (inner r: 5 → 4):
  r=5: 55 < 41? no
  r=4: 41 < 23? no
  end: [7, 12, 18, 23, 41, 55]    (no swaps — array is already sorted)

pass i=4 (inner r: 5 → 5):
  r=5: 55 < 41? no
  end: same

pass i=5 (inner r: empty, r > i required, r=5 > 5 false):
  loop body skipped

final: [7, 12, 18, 23, 41, 55]  ✓
```

Variable state at the end of every pass:

```
pass i  |  bars after pass                  |  comparisons  |  swaps
────────┼───────────────────────────────────┼───────────────┼────────
i=0     | [7, 23, 12, 41, 18, 55]           | 5             | 3
i=1     | [7, 12, 23, 18, 41, 55]           | 4             | 2
i=2     | [7, 12, 18, 23, 41, 55]           | 3             | 1
i=3     | [7, 12, 18, 23, 41, 55]           | 2             | 0
i=4     | [7, 12, 18, 23, 41, 55]           | 1             | 0
i=5     | [7, 12, 18, 23, 41, 55]           | 0             | 0
────────┴───────────────────────────────────┴───────────────┴────────
                                       total | 15            | 6
```

**Complexity:** O(n²) time · O(1) space

**What goes wrong at scale:** at n = 10,000, comparisons total ~50 million regardless of input shape. A modern V8 engine does ~100 million simple integer comparisons per second, so a single sort takes ~500ms — visible as a UI jank. At n = 100,000, it's ~5 billion comparisons, ~50 seconds. The browser tab locks.

### ── Optimal (bubble sort with early-exit flag) ──

**The insight:** if a full pass completes with zero swaps, the array is already sorted — every adjacent pair is in order, which means every pair (adjacent or not) is in order. Track a `swapped` flag per pass; bail when it stays false. This doesn't help worst-case (reversed input), but it drops near-sorted and already-sorted inputs to O(n).

**Pseudocode:**

```
for i from 0 to n-1:
    swapped = false
    for r from n-1 down to i+1:
        if bars[r] < bars[r-1]:
            swap(bars[r], bars[r-1])
            swapped = true
    if not swapped:
        break
```

**Execution trace** — `bars = [7, 12, 18, 23, 41, 55]` (already sorted), n = 6:

```
pass i=0 (inner r: 5 → 1):
  swapped = false
  r=5: 55 < 41? no
  r=4: 41 < 23? no
  r=3: 23 < 18? no
  r=2: 18 < 12? no
  r=1: 12 < 7?  no
  end of pass: swapped is still false
  break out of outer loop

final: [7, 12, 18, 23, 41, 55]   (one pass, no swaps)
```

For the same already-sorted input, the brute force does 5 + 4 + 3 + 2 + 1 = 15 comparisons. The optimal does 5 and exits.

**Complexity:** O(n²) time worst case · O(n) time best case (already sorted) · O(1) space

**Why it's faster:** the algorithm reads its own progress. If a pass produced no swaps, the work is done — no point doing the next pass. The insight: the algorithm has a *termination signal* baked into its inner loop's behavior, the brute force just isn't reading it.

### ── Comparison ──

```
┌─────────────────┬───────────────────┬──────────────────────┐
│                 │ Brute (no flag)   │ Optimal (early-exit) │
├─────────────────┼───────────────────┼──────────────────────┤
│ Worst time      │ O(n²)             │ O(n²)                │
│ Average time    │ O(n²)             │ O(n²)                │
│ Best time       │ O(n²)             │ O(n)                 │
│ Space           │ O(1)              │ O(1)                 │
│ Stable          │ yes               │ yes                  │
│ In-place        │ yes               │ yes                  │
│ At n=50 random  │ ~1,225 comps      │ ~1,000–1,200 comps   │
│ At n=50 sorted  │ ~1,225 comps      │ ~49 comps            │
│ At n=10k random │ ~50M comps        │ ~50M comps           │
│ At n=10k sorted │ ~50M comps        │ ~10k comps           │
└─────────────────┴───────────────────┴──────────────────────┘
```

**When brute force is fine:** when input size is bounded small (n ≤ 100) and the input is arbitrary — the early-exit savings only show up on near-sorted data. For the 50-bar visualizer the user can't tell the difference; both finish in well under one frame.

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬───────────────────────┬───────────────────────┐
│ Cost dimension   │ Bubble sort           │ Insertion sort        │
├──────────────────┼───────────────────────┼───────────────────────┤
│ Time worst       │ O(n²)                 │ O(n²)                 │
│ Time best        │ O(n) with flag        │ O(n) intrinsic        │
│ Space            │ O(1)                  │ O(1)                  │
│ Writes per pass  │ many (every swap)     │ many (every shift)    │
│ Cache locality   │ poor (random pairs)   │ good (sequential)     │
│ Stable           │ yes                   │ yes                   │
│ Lines of code    │ ~6 (no flag)          │ ~7                    │
│ Pedagogical use  │ canonical             │ canonical             │
│ Production use   │ never                 │ TimSort inner loop    │
└──────────────────┴───────────────────────┴───────────────────────┘
```

### Sub-block 1 — what we gave up

The codebase implementation has no `swapped` flag, so every run does full O(n²) work regardless of input. For 50 bars this is invisible (≈1,225 comparisons, finishes in microseconds without the deliberate `await delayLoop(speed)`). For the visualizer's purposes, the early-exit would *hide* the work — the user is here to watch the comparisons happen, not to finish faster. So the missing flag is feature, not bug.

Constant-factor cost is the bigger issue. Bubble sort does many swaps per pass — every out-of-order pair triggers a write. Compare to selection sort, which scans the whole unsorted suffix but performs exactly one swap per pass. On a hardware level (flash memory, where writes are expensive) bubble sort burns through write cycles for no asymptotic benefit. In the browser this doesn't matter; in an embedded system it would rule the algorithm out.

### Sub-block 2 — what the alternative would have cost

If the visualizer used insertion sort instead, the inner loop would be slightly more complex (slide a value backward through the sorted prefix) but the *animation* would look almost identical — both touch adjacent indices, both swap-or-shift, both run in O(n²). The pedagogical clarity of bubble sort would be replaced by a slightly tighter inner loop and the same complexity story. Net: insertion sort is the better educational choice for "this is what O(n²) looks like in practice" because it has the same asymptotic but a noticeably faster constant factor. Bubble sort wins on one axis only: the inner step is one comparison plus one swap, no inner variable, no insertion logic. Easier to recite from memory.

If the visualizer used `Array.prototype.sort`, the bars would be sorted in one V8-internal call — no animation, no visible work. The whole point of the page disappears.

### Sub-block 3 — the breakpoint

Bubble sort is fine for the visualizer up to ~200 bars. Beyond that, the `delayLoop(speed)` between every swap stretches the animation to multiple minutes, which is no longer educational, just slow. If the `inputSizeOptions` ever exceeds 200, the visualizer needs either a faster sort, a coarser animation (animate every K-th swap), or a different rendering mode.

### Sub-block 4 — what wasn't actually a tradeoff

`Array.prototype.sort` was not a real alternative for this page. The visualizer's job is to show *how* a sort works — the moment you delegate to V8's TimSort, the page becomes a "look at sorted bars" demo with no instructional value. The whole reason to write your own bubble sort here is to expose every comparison and every swap.

---

## Tech reference (industry pairing)

### Array.prototype.sort (V8 TimSort)

- **Codebase uses:** not used by the visualizer — would defeat the animation pattern.
- **Why it's here:** named as the production alternative the codebase deliberately avoids on this page.
- **Leading today:** TimSort — adoption-leading for general-purpose sorting in JavaScript (V8), Python, Java 7+, Rust slice::sort, 2026.
- **Why it leads:** hybrid merge + insertion sort, O(n log n) worst case, O(n) on near-sorted input, stable, with adaptive run detection that fits real-world data (which is usually partially sorted).
- **Runner-up:** Pattern-defeating quicksort (pdqsort) — innovation-leading in Rust's `slice::sort_unstable`, faster than TimSort on truly random input at the cost of stability.

### React useState + spread re-render

- **Codebase uses:** `setBars([...bars])` at `src/app/sorting/bubble-sort/page.tsx` L66 to force a re-render after each in-place mutation.
- **Why it's here:** React reconciliation uses reference equality on state — mutating `bars` in place doesn't trigger a re-render without the spread.
- **Leading today:** `useState` — adoption-leading for component-local state in React, 2026.
- **Why it leads:** ships with React, no library, minimal API surface (`[state, setState]`), composes with `useEffect` for side-effects like animation timing.
- **Runner-up:** Zustand / Valtio for stores that need cross-component reads of the same bars array; useReducer for state machines where every animation step is a discrete action.

---

## Summary

Bubble sort walks the array in pairs, swapping any out-of-order adjacent pair, and repeats until the array is sorted. In this codebase it runs inside `src/app/sorting/bubble-sort/page.tsx` L54–L76, walking right-to-left to sink the smallest unsorted value to the left edge on each pass and calling `await delayLoop(speed)` between swaps so the user can watch the animation. The constraint that made it the right call here is pedagogical visibility — the algorithm has to *show* its work, which means every comparison and every swap must be a separate React render. The cost is O(n²) every time (no early-exit flag) and visible jank above ~200 bars; both are acceptable for the visualizer's role as a learning tool.

- One inner loop, one swap per out-of-order pair, repeated N times — six lines of logic, no auxiliary data.
- The codebase variant walks right-to-left, so the smallest value sinks left on each pass (textbook bubble sort walks left-to-right and bubbles the largest right; same asymptotic, opposite direction).
- No `swapped` early-exit flag, so every run does full O(n²) work regardless of input shape — a feature for the visualizer, a bug for production.
- Animation timing comes from `await delayLoop(speed)` between mutations; without it, all swaps would batch into one frame.
- Stable and in-place — same-value items keep their relative order, no auxiliary array needed.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about bubble sort, they're not asking you to derive its complexity. They're checking whether you can name *when* you'd use it (almost never), what its single redeeming property is (simplicity), and what the right answer would be in production (`Array.prototype.sort`). A good answer treats bubble sort as a baseline reference: "this is the dumbest correct sort, here's its shape, here's why I'd never ship it."

### Likely questions

[mid] Q: Walk me through bubble sort on `[5, 2, 4, 6, 1, 3]`.

A: Outer loop iterates `i = 0..5`. Inner loop walks adjacent pairs, swapping any out-of-order one. After pass 0, the largest value reaches the right edge. After each subsequent pass, the next-largest settles. Six passes total, ending in `[1, 2, 3, 4, 5, 6]`. The implementation in `src/app/sorting/bubble-sort/page.tsx` walks right-to-left to sink smallest-left instead — same algorithm, opposite direction.

Diagram:
```
[5, 2, 4, 6, 1, 3]
pass 0: bubble 6 to end → [2, 4, 5, 1, 3, 6]
pass 1: bubble 5 → [2, 4, 1, 3, 5, 6]
pass 2: bubble 4 → [2, 1, 3, 4, 5, 6]
pass 3: bubble 3 → [1, 2, 3, 4, 5, 6]
done.
```

[senior] Q: Why doesn't your implementation have an early-exit flag?

A: For this visualizer, the whole point is to show every comparison happening. If the algorithm early-exits on a near-sorted array, the animation stops mid-pass and the user learns nothing about what bubble sort *would* do on a worse input. So the missing flag is deliberate. In production code I'd never write bubble sort at all — I'd call `Array.prototype.sort`, which is TimSort, O(n log n) worst case with O(n) on near-sorted input.

Diagram:
```
With early-exit (production shape):     Without (visualizer shape):
┌──────────────────────────┐            ┌──────────────────────────┐
│ pass i:                  │            │ pass i:                  │
│   swapped = false        │            │   (no flag)              │
│   inner loop             │            │   inner loop             │
│   if !swapped: break ✓   │            │   always continue        │
└──────────────────────────┘            └──────────────────────────┘
  O(n) on sorted input                    O(n²) always
```

[arch] Q: I have a stream of 50k events arriving sorted-by-timestamp 99% of the time, occasionally out of order. Bubble sort is fine here, right?

A: Bubble sort *with early-exit* is fine. Without the flag, you do 50,000² ≈ 2.5 billion comparisons every time, which freezes any reasonable runtime. With the flag and near-sorted input, you do roughly O(n × d) where d is the number of out-of-order pairs — for a mostly-sorted stream with a handful of swaps, that's a few passes of n comparisons each, well under a second. But in real code I'd still use TimSort, which adapts to the same near-sorted shape via its run-detection without me having to remember to add a flag.

Diagram:
```
What breaks first at 50k stream events:

bubble (no flag): 2.5B comps  ◀── BREAKS: blocks the event loop
bubble (with flag): ~50k–500k  ◀── works, but fragile
TimSort: ~50k–500k             ◀── works, adapts automatically
                                    ← this is what to ship
```

### The question candidates always dodge

Q: Bubble sort is a "bad algorithm." Why is it in textbooks at all?

A: Because it's the simplest *correct* sort, and being able to recognize that distinction is a real skill. The honest answer is that bubble sort exists in education for the same reason scales exist in music — not because you'll perform them in a concert, but because they're the substrate every more advanced thing is built on. You watch it touch every pair. You watch the largest value walk to the right edge. You count comparisons by hand on a 6-element array. Then merge sort makes sense ("it avoids comparing across halves") and quick sort makes sense ("it partitions instead of pairwise compares"). Skip bubble sort and the asymptotic improvements of every other algorithm read as black-box magic. Use it in production once and you've made a mistake. That's two different statements and they're both true.

Diagram:
```
What bubble sort earns its place doing:

learner's mental ladder:
  bubble  →  insertion  →  merge  →  quick  →  TimSort
  (O(n²))   (O(n²) but   (O(n log    (avg     (hybrid,
            tighter)     n) always)  O(n log  adaptive,
                                     n))      ship this)

each rung makes sense because the rung below is there.
remove bubble: the ladder still works but the first rung is missing.
```

### One-line anchors

- "Bubble sort is the simplest correct sort — pedagogical, never production."
- "Without an early-exit flag, every run is O(n²) regardless of input — fine for a 50-bar demo, fatal for anything else."
- "The codebase walks right-to-left to sink smallest-left; textbook bubble walks left-to-right to bubble largest-right. Same asymptotic, opposite direction."
- "Always stable, always in-place — its two real virtues."
- "Production answer is always `Array.prototype.sort` (TimSort). Bubble sort is the thing TimSort is faster than."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the bubble sort flow: outer loop, inner loop, the swap step, the visualizer hooks (`setHighlightIndices`, `setScanIndices`, `delayLoop`, `setBars`). Label what each variable represents.

Open the file. Check:
- Did you show the outer loop incrementing `i`?
- Did you show the inner loop decrementing `r` from `n-1` down to `i+1`?
- Did you include `await delayLoop(speed)` between the swap and the `setBars` call?
- Did you note that `setBars([...bars])` requires a new reference for React to re-render?

### Level 2 — Explain it out loud

Explain bubble sort to a colleague who just asked "why is it slow?" No notes. Under 90 seconds.

Checkpoints:
- Did you reference `src/app/sorting/bubble-sort/page.tsx` L54–L76?
- Did you say it's O(n²) because every pair gets compared on every pass?
- Did you mention the missing early-exit flag — and why it's deliberate for the visualizer?
- Did you name the production alternative (`Array.prototype.sort`, TimSort)?

### Level 3 — Apply it to a new scenario

A user reports that when they set `inputSize` to 500 in the bubble-sort visualizer, the page locks up for several seconds before the animation starts. Walk through what's happening using only what's in `src/app/sorting/bubble-sort/page.tsx` L54–L76. Where would you intervene?

Write your answer in 3–5 sentences. Then verify by opening the file: notice that the algorithm starts mutating `bars` immediately, and `await delayLoop(speed)` only fires inside the swap branch — so passes with no swaps run synchronously through the inner loop. At n = 500 with mostly-sorted-ish input, that's hundreds of thousands of comparisons before the first paint.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the implementation has no early-exit flag. If you were starting today and wanted both visual clarity *and* a sensible upper bound on input size, would you add the flag? What would the visualizer have to do differently to keep showing "what bubble sort does on a sorted input" without the flag silently skipping it?

Reference `src/app/sorting/bubble-sort/page.tsx` L55–L75 to support your answer.

### Quick check — code reference test

Without opening any files:
- What file does this implementation live in?
- What's the inner function name?
- What direction does the inner loop walk?

Open and verify.

Pass: you named `src/app/sorting/bubble-sort/page.tsx`, `bubbleSort`, and right-to-left (descending `r`).
Fail on direction: re-read L56 (the `r=bars.length-1; r>i; r--` loop) and re-trace pass 0.
