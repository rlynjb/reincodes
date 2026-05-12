# Insertion sort

**Industry name(s):** Insertion sort, sorted-prefix insertion
**Type:** Industry standard · Language-agnostic

> Maintain a sorted prefix; for each new element, shift it left into its correct position. Visualized at `/sorting/insertion-sort`.

**See also:** → [01-selection-sort](./01-selection-sort.md) · → [02-bubble-sort](./02-bubble-sort.md) · → [04-merge-sort](./04-merge-sort.md)

---

## Why care

You're sorting a poker hand by inserting each new card into your hand's already-sorted region. That's insertion sort — and it's the algorithm humans actually use for small unsorted decks, faster than selection sort or bubble sort because most cards don't need to move far.

Insertion sort is the third **elementary sort** and the one with a real superpower: it's **adaptive** — O(n) on already-sorted input, O(n²) worst case. Same family as the other two elementary sorts, but with an invariant ("the prefix `[0..i]` is sorted") that lets it exploit existing order. Production sorts like TimSort use insertion sort for small subarrays inside larger O(n log n) algorithms for this reason.

---

## How it works

Picture a librarian shelving newly-returned books one at a time. Each new book gets slid left along the shelf, pushing later books rightward, until it sits between the right two neighbours. The books already on the shelf are always sorted; you only ever move what you need to make room.

### The algorithm

For each `i` from `1` to `n-1`:
1. Pick `bars[i]` as the "current".
2. Shift any `bars[j] > current` for `j < i` one position right.
3. Place `current` in the gap.

After step `i`, prefix `[0..i]` is sorted.

**If you're coming from frontend, you've slid items in an array to make room for an insert — insertion sort is that operation repeated `n-1` times against a growing sorted prefix.**

### Brute-force version

```
function insertionSort(arr):
  for i from 1 to n-1:
    current = arr[i]
    j = i - 1
    while j >= 0 and arr[j] > current:
      arr[j+1] = arr[j]
      j -= 1
    arr[j+1] = current
```

### Execution trace on `[5, 2, 4, 1, 3]`

```
Step              Action                       bars
----              ------                       ----
i=1, current=2    shift 5 right, insert 2      [2, 5, 4, 1, 3]
i=2, current=4    shift 5 right, insert 4      [2, 4, 5, 1, 3]
i=3, current=1    shift 5, 4, 2 right          [1, 2, 4, 5, 3]
i=4, current=3    shift 5, 4 right             [1, 2, 3, 4, 5]
```

4 inserts, ~7 shifts. Compare against same input on selection sort (10 comparisons, 3 swaps).

### Best case — already sorted input

```
[1, 2, 3, 4, 5]:
i=1, current=2, j=0: 1>2? no, stop. No shift. ✓
i=2, current=3, j=1: 2>3? no, stop. ✓
i=3, current=4: same
i=4, current=5: same

Total: 4 comparisons, 0 shifts. O(n).
```

This is the adaptive win: sorted input takes linear time. Bubble (without early exit) and selection both still take O(n²) on the same input.

### Complexity comparison at multiple scales

```
┌────────┬───────────────┬───────────────┬───────────────┐
│   n    │ Best (sorted) │ Average       │ Worst (rev)   │
├────────┼───────────────┼───────────────┼───────────────┤
│   10   │ 9 comp        │ ~22 ops       │ 45 ops        │
│  100   │ 99            │ ~2,500        │ 4,950         │
│ 1,000  │ 999           │ ~250,000      │ 499,500       │
│10,000  │ 9,999         │ ~25M          │ ~50M          │
└────────┴───────────────┴───────────────┴───────────────┘
```

### "When brute force is fine"

- `n ≤ 50` regardless of input.
- Nearly-sorted input at any scale — adaptive cost is roughly O(n + k) where k is the number of inversions.
- *Inside* a larger algorithm. TimSort and IntroSort both use insertion sort for sub-arrays of size ~16, because at that size the constant factor wins over O(n log n) algorithms.

### The principle

This is what people mean by *adaptive algorithms*: the running time depends on input structure, not just input size. Adaptive sorts are precious in real systems where data is often "mostly sorted with a few changes" (log files, append-mostly databases, leaderboard updates). Insertion sort is the simplest non-trivial adaptive algorithm.

The full picture is below.

---

## Insertion sort — diagram

```
Sorted prefix grows by one each pass:

i=1:  [(2) 5  4  1  3]    insert 2 into [5]
       └──┬───┘
          ▼
      [ 2  5  4  1  3 ]   prefix [2,5] sorted

i=2:  [ 2  5 (4) 1  3]    insert 4 into [2,5]
       └────┬───┘
            ▼
      [ 2  4  5  1  3 ]   prefix [2,4,5] sorted

i=3:  [ 2  4  5 (1) 3]    insert 1 into [2,4,5]
       └──────┬──┘
              ▼  shift, shift, shift
      [ 1  2  4  5  3 ]   prefix [1,2,4,5] sorted

i=4:  [ 1  2  4  5 (3)]   insert 3 into [1,2,4,5]
       └────────┬──┘
                ▼
      [ 1  2  3  4  5 ]   done
```

---

## In this codebase

**Page:** `src/app/sorting/insertion-sort/page.tsx`.
**Reference impl:** `src/utils/notes/Sorting/InsertionSort.ts`.

GitHub: `[insertion-sort/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/sorting/insertion-sort/page.tsx)`.

---

## Elaborate

### Where this pattern comes from
Insertion sort is among the oldest sorting algorithms; it appears in Mauchly's 1946 paper. The "maintain a sorted region, grow it one at a time" invariant predates computers — it's how humans sort hands of cards.

### The deeper principle
*Adaptivity costs nothing extra to add.* The same loop structure that handles worst-case also exits early on best-case input. That's a free win — adaptive algorithms aren't slower than non-adaptive ones; they're strictly better when input has structure.

### Where this breaks down
- Random `n > ~1000`: O(n²) shows.
- Reverse-sorted input: worst case, every element shifts all the way left.
- Memory: shifts touch every element between insert position and end of prefix — same memory traffic as bubble sort.

### What to explore next
- [04-merge-sort](./04-merge-sort.md) — O(n log n) by divide-and-conquer.
- [05-quick-sort](./05-quick-sort.md) — O(n log n) average via partition.
- TimSort note: production JS `Array.prototype.sort` (V8) uses TimSort, which delegates to insertion sort on subarrays ≤32 elements.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Insertion sort           │ Bubble sort              │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time best        │ O(n)                     │ O(n) w/ early exit       │
│ Time average     │ O(n²) / 2                │ O(n²)                    │
│ Time worst       │ O(n²)                    │ O(n²)                    │
│ Stable           │ Yes                      │ Yes                      │
│ Adaptive         │ Yes                      │ With opt                 │
│ Locality         │ Adjacent shifts          │ Adjacent swaps           │
│ Best small-input │ Yes (~16 elements)       │ No clear win             │
│ Code complexity  │ Two loops, one swap-shift│ Two loops, one swap      │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Asymptotic worst-case improvement over the other elementary sorts. The advantage is only on partially-sorted data.

### What the alternative would have cost

Selection sort: no adaptivity, fixed O(n²) regardless of input. For inputs that are mostly sorted (a real production case), that's a real waste.

### The breakpoint

Fine until `n > ~50` with random input. Even production code uses insertion sort *inside* larger algorithms at scales up to ~32; standalone, it's a teaching choice past 100.

---

## Tech reference (industry pairing)

### Insertion sort as a primitive

- **Codebase uses:** Standalone implementation in `src/utils/notes/Sorting/InsertionSort.ts`.
- **Why it's here:** the third elementary sort, with adaptive behaviour to teach.
- **Leading today:** Insertion sort *inside* TimSort/IntroSort — `adoption-leading` for small-subarray sorting in production sorts, 2026.
- **Why it leads:** the constant factor on n ≤ 32 beats every O(n log n) algorithm; that's why every major language's standard sort delegates to it.

---

## Summary

### Part 1 — concept recap

Insertion sort grows a sorted prefix one element at a time by shifting each new element left into its correct position. reincodes implements it as an async loop on `/sorting/insertion-sort/page.tsx` with the standard `delayLoop` animation pattern. The constraint that makes it interesting is "nearly-sorted input should be fast," and the cost is O(n²) worst case on reverse-sorted or random input.

### Part 2 — key points to remember

- Invariant: after step `i`, prefix `[0..i]` is sorted.
- Adaptive: O(n) on already-sorted input, O(n²) worst case.
- Stable.
- Production sorts use it for small subarrays (≤32 elements) because the constant factor beats divide-and-conquer at that scale.
- The cost is quadratic on random input; the benefit is linear on sorted input.

---

## Interview defense

### What an interviewer is really asking

When someone asks about insertion sort, they want to hear about *adaptivity*. The wrong answer says "O(n²) like the others." The right answer says "O(n²) worst, O(n) best, adaptive in between — that's why TimSort uses it on small subarrays."

### Likely questions

**Q [mid]: Trace insertion sort on `[4, 1, 3, 2]`.**

A:
```
i=1, current=1: shift 4 right, insert 1 → [1, 4, 3, 2]
i=2, current=3: shift 4 right, insert 3 → [1, 3, 4, 2]
i=3, current=2: shift 4, 3 right, insert 2 → [1, 2, 3, 4]
```

**Q [senior]: Why does TimSort use insertion sort on small subarrays?**

A: Below ~32 elements, the constant factor of O(n²) is smaller than the constant factor of O(n log n). Merge sort has merge buffer allocation; quick sort has partition+recursion overhead. Insertion sort has one tight loop with sequential memory access — the CPU's prefetcher loves it. Empirically, the crossover is around n=16-32 depending on element size and CPU. TimSort runs insertion sort on those subarrays then merges the results.

```
┌── Below n≈32 ──────────────┐    ┌── Above n≈32 ─────────────┐
│  Insertion sort wins       │    │  Merge / quick / heap wins │
│  Tight loop, sequential RAM│    │  log n factor pays off    │
│  Cache-friendly            │    │  Worth the constant       │
└────────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: At 10× data scale (n=500k random), is insertion sort viable?**

A: No — quadratic on random input becomes intolerable at that scale. The architecture pivot is to a divide-and-conquer or `Array.prototype.sort`. The only time insertion sort scales is when input is *already* mostly sorted (e.g., merging a small set of new entries into a large sorted log) — there it's O(n + k) where k is the number of out-of-order pairs.

### The question candidates always dodge

**Q: You say insertion sort is "adaptive." How do you measure adaptivity in a real codebase?**

A: Adaptivity is measured by the number of *inversions* (pairs `(i,j)` where `i<j` but `arr[i]>arr[j]`). Insertion sort's running time is O(n + I) where I is inversions. Sorted input has 0 inversions → O(n). Reverse-sorted has n(n-1)/2 → O(n²). For a real codebase that ingests logs (append-mostly, occasionally out-of-order), the inversion count is usually small, so insertion sort runs near-linear. Measuring it in practice: count adjacent-pair swaps during a sort — that's the inversion count.

```
Inversions visualised (n=4):
  [1, 2, 3, 4]   I=0   sorted, O(n)
  [1, 3, 2, 4]   I=1   one swap, O(n+1)
  [4, 3, 2, 1]   I=6   reversed, O(n²/2)
```

### One-line anchors

- "Grow the sorted prefix by one each pass."
- "O(n) on sorted input — the only elementary sort with this property."
- "Production sorts use insertion sort *inside* themselves for small subarrays."
- "Running time = O(n + inversions); adaptive on partially-sorted data."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Trace insertion sort on `[5, 1, 4, 2, 3]`. Show the array after each `i`.

### Level 2 — Explain it out loud
"Why is insertion sort O(n) on sorted input but O(n²) on reverse-sorted?"

### Level 3 — Apply it to a new scenario
"I have a sorted array of 1000 elements. I append 5 unsorted elements at the end. What's the cost of insertion-sorting the result?"

### Level 4 — Defend the decision you'd change
"Would you replace this site's insertion sort visualization with a TimSort visualization?"

### Quick check
- File? → `src/app/sorting/insertion-sort/page.tsx`
- Complexity worst? → O(n²)
- Complexity best? → O(n) on sorted input

✓ Pass: all three.
