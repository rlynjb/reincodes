# Selection sort

**Industry name(s):** Selection sort, in-place selection sort
**Type:** Industry standard · Language-agnostic

> Repeatedly find the smallest remaining bar and swap it into position; visualized at `/sorting/selection-sort`.

**See also:** → [02-bubble-sort](./02-bubble-sort.md) · → [03-insertion-sort](./03-insertion-sort.md) · → [04-merge-sort](./04-merge-sort.md)

---

## Why care

You're handed a deck of 100 cards and asked to sort them by hand. The most natural strategy: scan the whole deck, pull out the smallest, put it first; scan what's left, pull out the smallest, put it second; repeat. That's selection sort. It's also the slowest of the natural strategies — but it's the easiest to reason about, which is why every algorithms course starts here.

Selection sort belongs to the family of **comparison-based, in-place sorts** that solve the problem by repeatedly identifying the next correct element. It's in the same family as bubble sort and insertion sort (the three "elementary sorts"), and contrasts with the divide-and-conquer sorts (merge, quick, heap) that achieve O(n log n) by being cleverer about reuse. Here's how it actually runs in this codebase.

---

## How it works

Picture sorting a row of books on a shelf by height. You find the shortest, swap it into the leftmost slot, then ignore that slot and repeat on the rest. After 100 swaps you're done. No book moves more than necessary; you just need to look at every remaining book each pass to find the smallest.

### The algorithm

For an array of length `n`, repeat `n-1` times:
1. Look at positions `[i .. n-1]` (the unsorted suffix).
2. Find the index of the minimum.
3. Swap it into position `i`.

After step `i`, positions `[0 .. i]` are sorted and final.

**If you're coming from frontend, you've probably written code that scans an array for the smallest item — selection sort is that loop done `n` times, advancing the "sorted boundary" by one each time.**

### The data shape

The array in this codebase is `number[]` — produced by `generateArrayOfRandomNumbers(inputSize)` from `src/utils/`. Each element is just a number between 1 and some max; the visualizer renders each as a bar whose height encodes the value.

### Brute-force (and only) version: nested-loop selection

```
// Pseudocode (matches src/utils/notes/Sorting/SelectionSort.ts)
function selectionSort(bars):
  for i from 0 to n-1:
    min_index = i
    for j from i+1 to n-1:
      if bars[j] < bars[min_index]:
        min_index = j
    if min_index != i:
      swap(bars[i], bars[min_index])
```

Outer loop: `n` iterations. Inner loop: scans `n-i` elements. Total comparisons: `n + (n-1) + ... + 1 = n(n+1)/2 ≈ n²/2`. Swaps: at most `n-1`.

### Execution trace on a 5-element input

Input: `[5, 2, 4, 1, 3]`

```
Step                    min_idx  bars              swap?     Note
----                    -------  ----              -----     ----
i=0 scan [5,2,4,1,3]    3        [5,2,4,1,3]       yes       1 ↔ 5
                                  [1,2,4,5,3]
i=1 scan [2,4,5,3]      1        [1,2,4,5,3]       no        min already at i=1
i=2 scan [4,5,3]        4        [1,2,4,5,3]       yes       3 ↔ 4
                                  [1,2,3,5,4]
i=3 scan [5,4]          4        [1,2,3,5,4]       yes       4 ↔ 5
                                  [1,2,3,4,5]
i=4 (single elem)       —        [1,2,3,4,5]       no        sorted
```

Final: `[1, 2, 3, 4, 5]`. Total comparisons ≈ 4+3+2+1 = 10. Three swaps.

### Complexity comparison at multiple scales

```
┌────────┬───────────────┬──────────────┬─────────────┐
│   n    │ Comparisons   │ Swaps        │ Real time*  │
├────────┼───────────────┼──────────────┼─────────────┤
│   10   │ 45            │ ≤ 9          │ ~µs         │
│   100  │ 4,950         │ ≤ 99         │ <1ms        │
│ 1,000  │ 499,500       │ ≤ 999        │ 5–50ms      │
│10,000  │ 49,995,000    │ ≤ 9,999      │ 500ms–5s    │
└────────┴───────────────┴──────────────┴─────────────┘
                                  *In JS, modern CPU
```

n²-vs-n shows up clearly: 10× the data means 100× the work.

### "When brute force is fine"

When `n ≤ 50` and clarity matters more than speed (teaching tools, small UI sort steps, occasional admin scripts on small datasets). Selection sort is also useful when *swaps are expensive*: it minimises swaps to `n-1`, vs bubble sort which can do `n²` swaps. If your "elements" were 1MB structs you couldn't move cheaply, selection sort wins.

### In this codebase

The visualizer at `/sorting/selection-sort` calls a `selectionSort` async function that:
1. Picks the smallest in the unsorted suffix.
2. Highlights the candidate and current min via `setHighlightIndices` / `setScanIndices`.
3. Awaits `delayLoop(speed)`.
4. Swaps in place and calls `setBars([...bars])`.

Same animation-loop pattern documented in [01-system-design/05-animation-loop-pattern](../01-system-design/05-animation-loop-pattern.md).

### The principle

This is what people mean by *the simplest correct algorithm*. Selection sort is the algorithm you'd reach for if you'd never heard of any other sort — and it's *correct*. O(n²) is the cost of solving a problem without exploiting structure. Better sorts come from noticing structure: "I already know the left side is sorted" (insertion sort), "I can sort halves and merge" (merge sort), "I can partition around a pivot" (quick sort). Every faster sort is selection sort minus a wasted operation.

The full picture is below.

---

## Selection sort — diagram

```
Pass-by-pass view (input [5,2,4,1,3]):

i=0:  [ 5  2  4 (1) 3 ]    ← scanned, min at idx 3
              ↓ swap
      [ 1  2  4  5  3 ]
        ^^^ sorted

i=1:  [ 1 (2) 4  5  3 ]    ← min already at idx 1
              ↓ no swap
      [ 1  2  4  5  3 ]
        ^^^^^^ sorted

i=2:  [ 1  2  4  5 (3) ]   ← min at idx 4
              ↓ swap
      [ 1  2  3  5  4 ]
        ^^^^^^^^^ sorted

i=3:  [ 1  2  3  5 (4) ]   ← min at idx 4
              ↓ swap
      [ 1  2  3  4  5 ]
        ^^^^^^^^^^^^^^ done
```

---

## In this codebase

**Page:** `src/app/sorting/selection-sort/page.tsx` — visualizer route.
**Reference impl:** `src/utils/notes/Sorting/SelectionSort.ts` — clean, non-animated implementation.
**Visualizer:** `src/components/ArrayVisualizer/ArrayVisualizer.tsx` — renders bars.

GitHub: `[sorting/selection-sort/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/sorting/selection-sort/page.tsx)`.

---

## Elaborate

### Where this pattern comes from
Selection sort is one of the oldest algorithms taught — it appears in early computing textbooks because it captures the *idea* of sorting (find the next, place it, repeat) without any clever tricks. Knuth's *The Art of Computer Programming* Volume 3 covers it as the "natural" sort.

### The deeper principle
*Every operation on unsorted data is potentially wasted.* Selection sort scans the whole suffix on every pass even though most of it was scanned the previous pass. Faster sorts exploit reuse: insertion sort assumes the prefix is sorted; merge sort assumes the halves are sorted; heap sort maintains a heap that gives min in O(log n). The selection-sort baseline lets you measure the value of that structure.

### Where this breaks down
- `n > ~1000` with real-time UI — animation slows or stutters because steps per second × inner-loop cost gets large.
- Already-sorted or nearly-sorted input — selection sort does the same work regardless (no early termination).
- Memory-constrained systems can't help here — selection sort is already in-place; no win to be had.

### What to explore next
- [02-bubble-sort](./02-bubble-sort.md) — same complexity, different invariant ("after pass `i`, the largest `i` items are at the right").
- [03-insertion-sort](./03-insertion-sort.md) — same complexity, exploits *partial* sortedness for adaptive speedup.
- [04-merge-sort](./04-merge-sort.md) — the O(n log n) alternative; teaches divide-and-conquer.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Selection sort           │ Merge sort               │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time complexity  │ O(n²) always             │ O(n log n) always        │
│ Space            │ O(1) in-place            │ O(n) merge buffer        │
│ Stability        │ Not stable (swaps break) │ Stable                   │
│ Implementation   │ ~10 lines, one function  │ ~30+ lines, recursion    │
│ Best case        │ O(n²) — no early exit    │ O(n log n) always        │
│ Swaps            │ ≤ n-1 (minimal)          │ O(n log n) data moves    │
│ Cache locality   │ Excellent                │ Moderate (extra buffer)  │
│ Teaching value   │ Highest — most direct    │ Higher — D&C intuition   │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Speed at any non-trivial scale. The visualizer caps `inputSize` at ~50 in `src/const/options.ts` — at 100 elements the animation finishes faster than the eye can track per-step, but the algorithm itself is still scanning 5000 comparisons. At 10,000 elements selection sort takes ~half a second, which is "too slow to feel snappy."

Stability. If two elements have equal keys, selection sort's swap can move one past the other, changing their relative order. For `number[]` this is invisible; for an array of `{key, payload}` objects it'd matter.

### What the alternative would have cost

If the visualizer page used merge sort instead, the animation would be a divide-and-conquer tree — harder to render, harder to follow on first viewing. Most teaching tools start with selection/bubble/insertion *because* the algorithm shape is easy to animate: one swap at a time, one pass at a time. The cost of the better algorithm is teaching surface, not implementation; both are easy to implement.

### The breakpoint

Fine until `inputSize > ~200` where the visualizer slows down noticeably or the per-step pause becomes too short to follow. At that point you'd want a *summary* visualization (skip frames, show every nth swap) rather than a faster algorithm.

---

## Tech reference (industry pairing)

### TypeScript array + in-place mutation

- **Codebase uses:** Plain `number[]` mutated with bracket-assignment + spread for React re-render trigger.
- **Why it's here:** the simplest data shape; matches what `ArrayVisualizer` expects.
- **Leading today:** TypeScript `Array` — `adoption-leading` for ordered collections in JS, 2026.
- **Why it leads:** built-in, V8-optimised, well-typed.
- **Runner-up:** `Int32Array` / typed arrays — `innovation-leading` for numeric perf at scale; unused here because perf doesn't matter at the visualization scale.

---

## Summary

### Part 1 — concept recap

Selection sort repeatedly scans the unsorted suffix of an array, finds the minimum, and swaps it into the next position. reincodes implements it as an `async` function on `/sorting/selection-sort/page.tsx`, calling `setHighlightIndices` and `await delayLoop` between each swap so the user sees one step at a time. The constraint that forces the choice is "this is a teaching tool, not a benchmark," and the cost paid is O(n²) time regardless of input — which is invisible at the visualizer's small input sizes but would matter at scale.

### Part 2 — key points to remember

- Each pass picks the smallest element from the suffix and swaps it into the next position.
- O(n²) comparisons, O(n) swaps — minimal swap count among elementary sorts.
- In-place, not stable.
- Same animation-loop pattern as every other sort page in this codebase.
- The cost is brute-force time; the benefit is dead-simple code that teaches the *idea* of sorting.

---

## Interview defense

### What an interviewer is really asking

When someone asks about selection sort, they want a sanity check that you understand the *cost* of brute force and can articulate when "brute force is fine." The honest answer is: small inputs, expensive swaps, or pedagogical clarity. They'll probably push you to compare against insertion sort.

### Likely questions

**Q [mid]: Walk me through one pass of selection sort on `[3, 1, 4, 1, 5]`.**

A: Pass `i=0`: scan positions 0..4, the minimum value is 1 at index 1. Swap with index 0 → `[1, 3, 4, 1, 5]`. Pass `i=1`: scan positions 1..4, the minimum value is 1 at index 3. Swap with index 1 → `[1, 1, 4, 3, 5]`. Continue. The first `i` slots are sorted after pass `i`.

```
[3, 1, 4, 1, 5]  scan, min=1@1
swap(0, 1)
[1, 3, 4, 1, 5]  ✓ sorted prefix [1]
scan, min=1@3
swap(1, 3)
[1, 1, 4, 3, 5]  ✓ sorted prefix [1, 1]
```

**Q [senior]: Selection sort and bubble sort are both O(n²). When would you pick one over the other?**

A: Selection sort does at most n-1 swaps; bubble sort can do up to n² swaps. If swap cost is high (e.g., elements are large structs and you're copying), selection sort wins decisively. If comparison cost is high and the input is nearly sorted, bubble sort (with the optimisation of "no swaps in a pass = done") can finish in O(n). For random data on JS `number[]` neither matters much — the constants are small either way. The choice is usually about *what you want to teach*: selection sort teaches "find then place," bubble sort teaches "neighbour swaps and invariants."

```
┌── Selection sort ─────────┐    ┌── Bubble sort ────────────┐
│  ≤ n-1 swaps              │    │  Up to n² swaps           │
│  No early exit            │    │  Early exit on "no swaps" │
│  Always O(n²)             │    │  Best case O(n) on sorted │
│  Find-then-place idea     │    │  Local-comparison idea    │
└───────────────────────────┘    └───────────────────────────┘
   Win: expensive swap items     Win: nearly-sorted input
```

**Q [arch]: At 10× the data (sorting 500k elements instead of 50k), would you stay with selection sort?**

A: No — selection sort at 500k is ~125 billion comparisons, several seconds in JS. The replacement isn't another elementary sort; it's whatever's `Array.prototype.sort` (V8's TimSort, which is O(n log n)). The breakpoint is roughly "n > 1000 in a production context, ever." For teaching, selection sort scales to ~100 cleanly on the visualizer.

```
At 10× data scale:
┌─ Selection sort ───────┐
│  ✗ unusable (seconds)  │  ← breaks first
└────────────────────────┘
┌─ Array.prototype.sort ─┐
│  ✓ TimSort, O(n log n) │  ← right choice
└────────────────────────┘
```

### The question candidates always dodge

**Q: Why is selection sort even in this codebase? Real apps use the built-in sort.**

A: Right — `Array.prototype.sort` is what production code uses for any real sort. Selection sort is here because the *visualizer* is the product. Showing TimSort would be useful for production engineers, but its loop structure is complex (galloping mode, run detection, merge logic) — hard to animate without obscuring the idea. The elementary sorts demonstrate "what sorting is" in 10 lines each; once a learner internalises that, the more advanced sorts make sense as optimisations. The tradeoff: this codebase teaches teaching algorithms, not the algorithms you'd ship.

```
┌── Teaching (picked) ──────┐    ┌── Production-relevant ────┐
│  Selection / bubble / ins │    │  TimSort / introsort      │
│  Each ~10 LOC             │    │  Each ~500 LOC            │
│  Easy to animate          │    │  Run detection + galloping│
│  Teaches the idea         │    │  Teaches the optimisations│
│  Visualizer-shaped        │    │  Production-shaped        │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Find the smallest in what's left, swap it home, repeat."
- "O(n²) is the cost of not exploiting structure."
- "Minimal swaps — useful when moving elements is expensive."
- "Selection sort is what you'd invent on day one; better sorts come from noticing what it wastes."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Draw a 5-element array and trace each pass. Mark which prefix is sorted after each.

### Level 2 — Explain it out loud

Explain to a colleague: "How does selection sort work?" Under 60 seconds.

Checkpoints:
- Name the file? → `src/app/sorting/selection-sort/page.tsx`.
- Say the complexity? → O(n²) time, O(1) space.
- Name a tradeoff? → minimal swaps; no early exit.

### Level 3 — Apply it to a new scenario

Without looking: "Sort `[7, 7, 3, 5, 7]` using selection sort. Show the array after each pass. Why does the order of the three 7s tell you about stability?"

Write your answer. Then check `src/utils/notes/Sorting/SelectionSort.ts` for the reference implementation.

### Level 4 — Defend the decision you'd change

"If you could replace selection sort on this site with a more interesting elementary sort, which would you pick and why?"

### Quick check — code reference test

- Which page renders selection sort?
- Which folder holds the non-animated reference implementations?
- What's the complexity of selection sort?

✓ Pass: `src/app/sorting/selection-sort/page.tsx`, `src/utils/notes/Sorting/`, O(n²).
