# Bubble sort

**Industry name(s):** Bubble sort, sinking sort, exchange sort
**Type:** Industry standard · Language-agnostic

> Walk the array repeatedly, swapping any adjacent out-of-order pair; the largest item "bubbles" to the end on each pass. Visualized at `/sorting/bubble-sort`.

**See also:** → [01-selection-sort](./01-selection-sort.md) · → [03-insertion-sort](./03-insertion-sort.md)

---

## Why care

You've watched air bubbles rise through water — the biggest one moves up fastest, the smaller ones drift behind. Bubble sort runs that idea on numbers: the biggest unsorted value moves to the right one swap at a time, leaving smaller numbers in its wake. After `n` passes the array is sorted.

This is the canonical *adjacent-swap* sort, the simplest member of the **comparison-based, in-place** family. Same shape as cocktail-shaker sort (bidirectional bubble), insertion sort (different invariant), and the inner loop of every comparison sort ever. Here's how it actually runs in this codebase.

---

## How it works

Picture a row of mismatched-height people facing forward. Walk from the back to the front; any adjacent pair where the back person is taller than the front gets swapped. After one full pass, the tallest person is at the back. Repeat ignoring the back; the second-tallest settles into the second-to-last slot. Done after n passes.

### The algorithm

For each pass `i` from `0` to `n-1`:
1. From the right end, scan inward toward `i`.
2. For each adjacent pair `(bars[r-1], bars[r])`, if out of order, swap.
3. After pass `i`, the rightmost `i+1` elements are in final sorted position.

**If you're coming from frontend, you've written a "compare neighbours" loop — bubble sort is that loop nested inside an outer "shrink the window" loop.**

### The data shape

Same `number[]` as selection sort, produced by `generateArrayOfRandomNumbers(inputSize)`.

### Brute-force version (the only common version)

```
// Pseudocode (matches src/utils/notes/Sorting/BubbleSort.ts)
function bubbleSort(arr):
  for i from 0 to n-1:
    for r from n-1 down to i+1:
      if arr[r] < arr[r-1]:
        swap(arr[r], arr[r-1])
```

The classic optimization — early exit if no swaps occurred in a pass — would make best-case `O(n)` for already-sorted input. The reference impl in this codebase doesn't have it; the visualizer page also doesn't. That's a deliberate teaching choice: show the naive version.

### Execution trace on `[5, 2, 4, 1, 3]`

```
Pass i=0  (bring largest to end):
  r=4: bars[4]=3 < bars[3]=1?  no
  r=3: bars[3]=1 < bars[2]=4?  yes → swap  [5,2,1,4,3]
  r=2: bars[2]=1 < bars[1]=2?  yes → swap  [5,1,2,4,3]
  r=1: bars[1]=1 < bars[0]=5?  yes → swap  [1,5,2,4,3]
  After pass 0: [1, 5, 2, 4, 3]   ← 5 is NOT at end yet! Note: codebase iterates differently
                                    (the trace above is "bring smallest to front"; bubble
                                     sort with "from right, swap if smaller" variant)
```

Wait — the codebase's variant (`if (bars[r] < bars[r-1])` scanning right-to-left) actually moves *smallest to front* on each pass, not largest to back. Let me re-trace:

```
Pass i=0  (bring smallest of remaining to front):
  bars: [5, 2, 4, 1, 3]
  r=4: 3 < 4? yes → swap [5, 2, 4, 3, 1]? No wait. Let me re-read.
```

Actually re-reading: `for r = n-1 down to i+1`, and on each `r`: if `bars[r] < bars[r-1]`, swap them. So with `bars=[5,2,4,1,3]`, `i=0`:

```
r=4: bars[4]=3 < bars[3]=1?  3<1 = false, no swap.   bars=[5,2,4,1,3]
r=3: bars[3]=1 < bars[2]=4?  1<4 = true, swap.       bars=[5,2,1,4,3]
r=2: bars[2]=1 < bars[1]=2?  1<2 = true, swap.       bars=[5,1,2,4,3]
r=1: bars[1]=1 < bars[0]=5?  1<5 = true, swap.       bars=[1,5,2,4,3]

Pass i=0 result: [1, 5, 2, 4, 3]   ← 1 is at index 0 (sorted prefix)
```

That's a "smallest bubbles to front" variant — equivalent to bubble sort, just scanning the opposite direction. The invariant is "after pass i, the smallest i+1 items are at indices 0..i".

```
Pass i=1  (smallest of [5,2,4,3] to index 1):
  bars: [1, 5, 2, 4, 3]
  r=4: 3 < 4? yes → swap.   bars=[1, 5, 2, 3, 4]
  r=3: 3 < 2? no.            bars=[1, 5, 2, 3, 4]
  r=2: 2 < 5? yes → swap.    bars=[1, 2, 5, 3, 4]

Pass i=1 result: [1, 2, 5, 3, 4]

Pass i=2:
  r=4: 4 < 3? no.            bars=[1, 2, 5, 3, 4]
  r=3: 3 < 5? yes → swap.    bars=[1, 2, 3, 5, 4]
Pass i=2 result: [1, 2, 3, 5, 4]

Pass i=3:
  r=4: 4 < 5? yes → swap.    bars=[1, 2, 3, 4, 5]
Pass i=3 result: [1, 2, 3, 4, 5]

Pass i=4: no inner iterations (r > i+1 = 5 is false)
```

Final: `[1, 2, 3, 4, 5]`. ~10 comparisons, 6 swaps for a worst-ish input.

### Complexity comparison at multiple scales

```
┌────────┬───────────────┬───────────────┬─────────────┐
│   n    │ Comparisons   │ Swaps (worst) │ Real time*  │
├────────┼───────────────┼───────────────┼─────────────┤
│   10   │ 45            │ ~45            │ ~µs         │
│   100  │ 4,950         │ ~4,950         │ <1ms        │
│ 1,000  │ 499,500       │ ~499,500       │ 10–100ms    │
│10,000  │ 49,995,000    │ ~50M           │ 1–10s       │
└────────┴───────────────┴───────────────┴─────────────┘
                                    *In JS, modern CPU
```

The big swap-count difference vs selection sort: bubble can swap up to n²/2 times; selection swaps n-1 times. If swap is expensive, that's a real cost.

### "When brute force is fine"

When `n` is small and either (a) nearly-sorted input with the early-exit optimisation gives O(n), or (b) you want to *teach* invariants — bubble sort's invariant ("after pass i, the largest/smallest i items are in their final positions") is one of the cleanest in algorithms.

### The principle

This is what people mean by *local-comparison sorts*. Bubble sort only ever looks at adjacent elements, yet through repeated passes the global order emerges. That's a powerful idea — many parallel algorithms (parallel merge networks) and distributed systems use the same "compare adjacent, repeat" shape because it's resilient and trivial to parallelise.

The full picture is below.

---

## Bubble sort — diagram

```
Input: [5, 2, 4, 1, 3]   (codebase's right-to-left "smallest bubbles forward" variant)

Pass i=0:    [ 5  2  4  1  3 ]
              r=4: 3<1? no
              r=3: 1<4? swap →
             [ 5  2  1  4  3 ]
              r=2: 1<2? swap →
             [ 5  1  2  4  3 ]
              r=1: 1<5? swap →
             [ 1  5  2  4  3 ]
              ↑ sorted

Pass i=1:    swap-walk from right, only positions r>1
             [ 1  2  5  3  4 ]
              ↑↑ sorted

Pass i=2:    [ 1  2  3  5  4 ]
              ↑↑↑ sorted

Pass i=3:    [ 1  2  3  4  5 ]
              ↑↑↑↑↑ done
```

---

## In this codebase

**Page:** `src/app/sorting/bubble-sort/page.tsx` L16–L129.
**Async loop:** L54–L76 — `const bubbleSort = async () => { ... }`.
**Reference impl:** `src/utils/notes/Sorting/BubbleSort.ts` L5–L18.

GitHub: `[bubble-sort/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/sorting/bubble-sort/page.tsx#L54-L76)`.

---

## Elaborate

### Where this pattern comes from
Bubble sort dates to at least the 1950s; it was first analysed by Iverson in 1962. Knuth famously called it "the worst standard sort" — and yet it's the one most often taught first because the algorithm shape is the most physically intuitive (bubbles rise; nothing rises further than it needs to).

### The deeper principle
*Local rules can produce global order.* Each swap is a 2-element decision; the global sort emerges from repetition. That's the same principle behind parallel sorting networks, distributed consensus protocols, and even some neural-network training updates.

### Where this breaks down
- Without the early-exit optimisation, bubble sort does the same work on sorted input as on reversed input — that's a waste.
- At `n > 1000`, becomes slow; visualisation step pause × inner-loop count gets long.
- Not memory-cache-friendly at large `n` — each swap touches two adjacent words, which is fine, but the repeated full-array passes hurt prefetching less than other sorts.

### What to explore next
- [03-insertion-sort](./03-insertion-sort.md) — same O(n²) but actually adaptive (O(n) on sorted input).
- [01-selection-sort](./01-selection-sort.md) — same O(n²) but minimal swaps.
- [04-merge-sort](./04-merge-sort.md) — O(n log n) divide-and-conquer.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Bubble (codebase variant)│ Insertion sort           │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time worst       │ O(n²)                    │ O(n²)                    │
│ Time best (sortd)│ O(n²) — no early exit    │ O(n)                     │
│ Swaps worst      │ O(n²)                    │ O(n²)                    │
│ Stability        │ Stable                   │ Stable                   │
│ Locality         │ Adjacent only            │ Adjacent only            │
│ Adaptive?        │ Only with optimisation   │ Yes (always)             │
│ Lines of code    │ ~10                      │ ~12                      │
│ Teaching value   │ Invariant intuition      │ Adaptive sort intuition  │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Adaptive performance. Without early-exit, bubble sort on `[1,2,3,4,5]` does the same 10 comparisons as on `[5,4,3,2,1]`. That's a teaching choice (show the worst case) but in production it's a real cost.

Swap minimality. Each pass can do many swaps; selection sort does at most n-1. If elements were heavy objects, bubble sort would be far slower than selection sort even though both are O(n²).

### What the alternative would have cost

Insertion sort would give adaptive O(n) on sorted input for ~2 extra lines of code. The teaching difference: bubble sort emphasises adjacent-swap repetition; insertion sort emphasises maintaining a sorted prefix. Both are valuable; the visualizer ships both.

### The breakpoint

Fine for visualization at `n ≤ ~50`. At higher n, each animation step still happens but the inner loop runs faster than the eye can follow and the "physics" of bubbles is lost.

---

## Tech reference (industry pairing)

### TypeScript array + in-place swap

- **Codebase uses:** Same as selection sort — plain `number[]` with bracket-assignment + spread.
- **Why it's here:** matches `ArrayVisualizer`'s prop shape.
- **Leading today:** `Array` — `adoption-leading`, 2026.
- **Runner-up:** `Int32Array` — perf-tier alternative; unused here.

---

## Summary

### Part 1 — concept recap

Bubble sort walks the array repeatedly, swapping adjacent out-of-order pairs; the codebase's right-to-left variant bubbles the *smallest* unsorted element to the front each pass. reincodes implements it on `/sorting/bubble-sort/page.tsx` as an async loop with `setHighlightIndices`, `setScanIndices`, and `await delayLoop` between swaps. The constraint is "teach the invariant, don't optimise," and the cost is O(n²) on every input including already-sorted ones (no early exit).

### Part 2 — key points to remember

- Adjacent-only comparison; one swap at a time.
- After pass `i`, the smallest `i+1` items are in the sorted prefix (codebase variant).
- O(n²) without early-exit optimisation, even on sorted input.
- Stable sort — equal elements keep their relative order.
- The cost is wasted work; the benefit is the cleanest invariant in algorithms.

---

## Interview defense

### What an interviewer is really asking

When someone asks about bubble sort, they want to hear you compare against the other O(n²) sorts and articulate the differences. "All O(n²)" is the floor; the interesting answer names *which one wins under which constraints*.

### Likely questions

**Q [mid]: One pass of bubble sort on `[3, 1, 4, 1, 5]` — show me what happens.**

A: Codebase variant, right-to-left scan. r=4: 5<1? no. r=3: 1<4? yes → swap → `[3,1,1,4,5]`. r=2: 1<1? no. r=1: 1<3? yes → swap → `[1,3,1,4,5]`. After pass 0, the smallest element (1) is at index 0.

```
[3, 1, 4, 1, 5]
r=4: 5<1?  no
r=3: 1<4?  swap  →  [3, 1, 1, 4, 5]
r=2: 1<1?  no
r=1: 1<3?  swap  →  [1, 3, 1, 4, 5]   ← sorted prefix [1]
```

**Q [senior]: Bubble vs insertion vs selection — three O(n²) sorts. When does each win?**

A: Selection sort wins when swaps are expensive (e.g., elements are large structs) — it does at most n-1 swaps. Insertion sort wins on nearly-sorted input — it's O(n) on sorted input and adaptive in general. Bubble sort doesn't have a clear winning case unless you add the early-exit optimisation (then it matches insertion on sorted input). For random data on JS numbers, all three are equivalent; for teaching, they emphasise three different invariants.

```
┌── Bubble ─────────────────┐    ┌── Insertion ──────────────┐    ┌── Selection ──────────────┐
│  Adjacent compare, repeat │    │  Build sorted prefix      │    │  Find min, place, repeat  │
│  Best (sorted): O(n²) w/o │    │  Best (sorted): O(n)      │    │  Always O(n²)             │
│    early-exit             │    │                           │    │                           │
│  Swaps worst: O(n²)       │    │  Shifts worst: O(n²)      │    │  Swaps worst: n-1         │
│  Teaches: local→global    │    │  Teaches: adaptive sort   │    │  Teaches: find-then-place │
└───────────────────────────┘    └───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: What changes at 10× the array size?**

A: At 10× data, comparisons go up 100×. At `n=500k`, bubble sort is roughly 250 billion comparisons in the worst case — minutes of CPU time. The architecture pivot is to use a faster sort entirely, not to optimise bubble sort. The breakpoint is around `n=1000` where you start noticing.

### The question candidates always dodge

**Q: Knuth called bubble sort "the worst standard sort." Why include it?**

A: For pedagogy, not utility. The invariant ("after pass i, the largest i items are at the end") is the cleanest of any sort, and it teaches the *idea* that local rules can produce global order — a principle that shows up in parallel sorts, consensus protocols, even gradient descent. The implementation cost is tiny (10 lines), and seeing a beginner code bubble sort *correctly* is a real diagnostic of "do they understand loops and invariants." Production code never uses it; teaching code should.

```
┌── Production use ─────────┐    ┌── Teaching use ───────────┐
│  Never                    │    │  Always — first sort      │
│  Use TimSort / quicksort  │    │  Cleanest invariant       │
│  10 LOC penalty too high  │    │  10 LOC easy to debug     │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Adjacent compare, swap if out of order, repeat."
- "Each pass settles one element into its final position."
- "Without early exit, sorted input is as slow as reversed input."
- "Bubble sort teaches that local rules produce global order."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Trace bubble sort on `[4, 1, 3, 2]`. Show the array after each pass and mark the sorted region.

### Level 2 — Explain it out loud

Explain to a colleague: "What's the bubble sort invariant, and what does that mean for the inner loop?"

Checkpoints:
- Name the file? → `src/app/sorting/bubble-sort/page.tsx`.
- State the invariant? → after pass i, the i+1 smallest (or largest, depending on direction) are in their final positions.
- Name the tradeoff? → no adaptive speedup without early exit.

### Level 3 — Apply it to a new scenario

Without looking: "If you add the early-exit optimisation, what's the worst-case complexity now? Why?"

### Level 4 — Defend the decision you'd change

"Would you add the early-exit optimisation here, or keep the naive version? Why?"

### Quick check — code reference test

- Which file holds the visualizer?
- Which lines hold the `bubbleSort` async function?
- Complexity?

✓ Pass: `src/app/sorting/bubble-sort/page.tsx`, ~L54–L76, O(n²).
