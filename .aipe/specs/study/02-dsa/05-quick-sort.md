# Quick sort

**Industry name(s):** Quicksort, Hoare partition sort
**Type:** Industry standard · Language-agnostic

> Pick a pivot, partition the array into "less than pivot" and "greater than pivot," recurse on each side. Visualized at `/sorting/quick-sort`.

**See also:** → [04-merge-sort](./04-merge-sort.md) · → [06-heap-sort](./06-heap-sort.md)

---

## Why care

You sort a deck by picking the 7 of hearts, throwing everything below it on the left, everything above on the right, then recursing on each pile. That's quick sort — and in practice it's the fastest comparison sort, at the cost of an O(n²) worst case if you're unlucky with pivot choice.

Quick sort sits in the **divide-and-conquer** family alongside merge sort, but with a crucial twist: it doesn't need extra memory. Partition reorders the array in place. The result: O(n log n) average time with O(log n) recursion stack, beating merge sort on real workloads thanks to cache locality.

---

## How it works

Picture a teacher splitting a class into "shorter than me" and "taller than me" lines around themselves. The teacher is the pivot; the two lines partition by that pivot's value. Repeat within each line with a new pivot. Eventually lines have one student each — sorted.

### The algorithm

```
function quickSort(arr, lo, hi):
  if lo >= hi: return
  pivotIdx = partition(arr, lo, hi)
  quickSort(arr, lo, pivotIdx - 1)
  quickSort(arr, pivotIdx + 1, hi)

function partition(arr, lo, hi):
  pivot = arr[hi]            // Lomuto: last element as pivot
  i = lo - 1
  for j from lo to hi - 1:
    if arr[j] <= pivot:
      i++
      swap(arr[i], arr[j])
  swap(arr[i+1], arr[hi])
  return i + 1
```

**If you're coming from frontend, you've split an array into "matches predicate" and "doesn't match" — partition is that split, but in-place.** The pivot ends up in its final sorted position after partition. Then recurse.

### Trace on `[5, 2, 4, 1, 3]` with pivot = last (Lomuto)

```
Call quickSort([5,2,4,1,3], 0, 4):
  partition with pivot=3:
    j=0: 5<=3? no
    j=1: 2<=3? yes; i=0, swap(arr[0], arr[1])  → [2,5,4,1,3]
    j=2: 4<=3? no
    j=3: 1<=3? yes; i=1, swap(arr[1], arr[3])  → [2,1,4,5,3]
    Final: swap(arr[2], arr[4])                → [2,1,3,5,4]
    Pivot 3 is now at index 2.
  Recurse on [2,1] (lo=0,hi=1) and [5,4] (lo=3,hi=4).

[2,1] partition pivot=1:
  j=0: 2<=1? no
  swap(arr[0], arr[1])  → [1,2]
  Pivot 1 at index 0.

[5,4] partition pivot=4:
  j=3: 5<=4? no
  swap(arr[3], arr[4])  → ... resulting in [4,5]

Final: [1, 2, 3, 4, 5]
```

### Complexity

```
┌──────────┬──────────────┬──────────────┬───────────────┐
│ Case     │ Pivot quality│ Time         │ Notes         │
├──────────┼──────────────┼──────────────┼───────────────┤
│ Best     │ Always median│ O(n log n)   │ Even split    │
│ Average  │ Random pivot │ O(n log n)   │ Most workloads│
│ Worst    │ Already sorted+ │ O(n²)     │ Pathological  │
│          │ last-as-pivot │              │               │
└──────────┴──────────────┴──────────────┴───────────────┘
```

The O(n²) worst case bites if the pivot consistently splits 0:n-1 (e.g., always-largest pivot on sorted input). Real implementations mitigate via random pivot selection or median-of-three.

### "When brute force is fine"

There's no "brute force quick sort" — it's already O(n log n) average. The only smaller variant is to skip partition altogether and fall back to insertion sort on small subarrays — which is what production introsort does (n ≤ 16).

### The principle

This is what people mean by *in-place divide and conquer*. The whole sort happens by reordering the same array; recursion only adds O(log n) call frames. That's the win over merge sort's O(n) merge buffer. The cost is the worst case isn't guaranteed.

The full picture is below.

---

## Quick sort — diagram

```
Initial: [5, 2, 4, 1, 3]

                  [5, 2, 4, 1, 3]   pivot = 3
                       │
                  partition → [2, 1, | 3 |, 5, 4]
                              less    pivot  greater
                       │              │
              ┌────────┘              └─────────┐
              ▼                                 ▼
            [2, 1]                           [5, 4]
             pivot=1                          pivot=4
              │                                 │
         partition                          partition
         [|1|, 2]                           [|4|, 5]
                                              

Combined (no merge step — array is sorted in place):
                 [1, 2, 3, 4, 5]
```

---

## In this codebase

**Page:** `src/app/sorting/quick-sort/page.tsx`.
**Reference impl:** `src/utils/notes/Sorting/QuickSort.ts`.

GitHub: `[quick-sort/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/sorting/quick-sort/page.tsx)`.

---

## Elaborate

### Where this pattern comes from
Quick sort was invented by Tony Hoare in 1959–61, originally to translate Russian sentences (a sort step in his Russian-English translation system). It became the canonical "fast practical sort" because the in-place partition is cache-friendly and the recursion is shallow.

### The deeper principle
*Partitioning is a primitive worth knowing on its own.* Hoare partition + binary search = quickselect (find the kth-smallest in O(n) average). Partition shows up in non-sorting contexts too — Dutch national flag (three-way partition), order statistics, ranked retrieval.

### Where this breaks down
- Adversarial input: O(n²) on already-sorted with last-element pivot.
- Recursion depth: O(log n) average but O(n) worst case → stack overflow risk on large inputs without iterative or hybrid impl.
- Stability: not stable.

### What to explore next
- [04-merge-sort](./04-merge-sort.md) — guaranteed O(n log n), needs extra memory.
- [06-heap-sort](./06-heap-sort.md) — guaranteed O(n log n) in place, but worse constants.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Quick sort               │ Merge sort               │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time average     │ O(n log n) — best const  │ O(n log n)               │
│ Time worst       │ O(n²)                    │ O(n log n)               │
│ Space            │ O(log n) stack           │ O(n) buffer              │
│ Stable           │ No                       │ Yes                      │
│ Cache locality   │ Excellent (in-place)     │ Moderate                 │
│ Adversarial safe │ No (pivot attack)        │ Yes                      │
│ Parallelisable   │ Hard (sequential partition)│ Easy                   │
│ Production use   │ C++ STL introsort        │ TimSort (V8, Java, Py)   │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Worst-case guarantee. O(n²) on adversarial input is a real risk; production introsort mitigates by switching to heap sort if recursion depth exceeds 2·log(n). The visualizer doesn't have that mitigation — it picks the last element as pivot, and an already-sorted input demonstrates the worst case.

Stability. Equal keys can be reordered. For sorting plain numbers, invisible; for objects with composite sort keys, visible.

### What the alternative would have cost

Merge sort: O(n) extra memory always, guaranteed O(n log n). For memory-constrained or adversarial-input systems, that's a win. For typical in-memory sorting, quick sort's constants are 2–3× smaller.

### The breakpoint

Fine until adversarial input is plausible (untrusted user data being sorted), or until stability becomes a requirement, or until recursion depth is unbounded. At any of those, switch to merge sort or introsort.

---

## Tech reference (industry pairing)

### Quicksort + Hoare/Lomuto partition

- **Codebase uses:** Reference implementation in `src/utils/notes/Sorting/QuickSort.ts`.
- **Why it's here:** the canonical practical sort algorithm.
- **Leading today:** Introsort (quick sort + heap sort fallback + insertion sort leaves) — `adoption-leading` for C++ STL, 2026.
- **Why it leads:** average-case quick-sort performance with worst-case heap-sort guarantee; the best of both worlds.
- **Runner-up:** TimSort — merge-based, used by Python/Java/V8 because stability and adaptivity matter more than memory in those contexts.

---

## Summary

### Part 1 — concept recap

Quick sort partitions around a pivot, placing the pivot in its final position and recursing on each side. reincodes implements it on `/sorting/quick-sort/page.tsx` with the `delayLoop` animation. The constraint is "fastest practical sort with O(log n) space," and the cost is O(n²) worst case on pathological pivots.

### Part 2 — key points to remember

- Partition is in place; pivot lands in final position.
- O(n log n) average, O(n²) worst.
- O(log n) stack on average; in-place otherwise.
- Not stable.
- Production: introsort uses quick sort + heap sort fallback.

---

## Interview defense

### What an interviewer is really asking

When someone asks about quick sort, they want to hear you name the worst-case trap and the mitigation (random pivot, median-of-three, introsort). The wrong answer says "O(n log n)" without naming the asterisk.

### Likely questions

**Q [mid]: What's the partition step doing?**

A: Pick a pivot (e.g., the last element). Walk through the array; everything ≤ pivot goes to the left side, everything > goes to the right. After the walk, swap the pivot into the boundary position. The pivot is now in its final sorted slot; the two sides are unordered relative to each other but ordered relative to the pivot. Then recurse on each side.

```
[5, 2, 4, 1, 3]  pivot=3
                  partition →
[2, 1] [3] [5, 4]
   <    =    >
```

**Q [senior]: Quick sort vs merge sort — when do you pick which?**

A: Quick sort when (a) memory is constrained, (b) you control the input (no adversarial pivot attacks), (c) stability doesn't matter. Merge sort when (a) you have memory to spare, (b) worst-case guarantee matters, (c) stability matters, or (d) you want easy parallelisation. In production: C++ STL uses introsort (quick-based); Python/Java/V8 use TimSort (merge-based). That divergence is genuine engineering disagreement.

```
┌── Quick sort wins ────────┐    ┌── Merge sort wins ────────┐
│  In-place, O(log n) stack │    │  Stable                   │
│  Cache-friendly           │    │  Worst-case guaranteed    │
│  ~2-3× faster constants    │   │  Parallel-friendly         │
│  Sorting unstable OK       │   │  Memory not constrained    │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: At 10× data, what breaks first about quick sort?**

A: Two failure modes. (1) If pivot selection is naive (always last element), pathological inputs (sorted, reverse-sorted) hit O(n²) — at 10M elements that's 50 trillion operations. (2) Recursion depth — Hoare partition with bad pivots can produce O(n) recursion → stack overflow. Mitigations: random pivot, median-of-three pivot, fallback to heap sort if depth exceeds threshold (introsort).

```
At 10× data:
┌─ Average case ─────────┐
│  ✓ O(n log n) scales   │
└────────────────────────┘
┌─ Worst case (adv input)┐
│  ✗ O(n²), unusable      │  ← breaks first
│  fix: random pivot     │
└────────────────────────┘
┌─ Recursion depth ──────┐
│  ⚠ stack overflow risk  │
│  fix: iterative impl   │
└────────────────────────┘
```

### The question candidates always dodge

**Q: You said quick sort beats merge sort in practice. Show me the numbers.**

A: V8's sort spec used to *forbid* quick sort because of worst-case attacks via adversarial JSON. They switched to TimSort. C++ STL uses introsort because the C++ community trades adversarial-input risk for in-place performance. The numbers: on random arrays of n=1M doubles, quick sort is ~30% faster than merge sort (~50ms vs ~70ms on a modern x86). On adversarial input, quick sort can be 1000× slower or crash. The "beats in practice" claim assumes inputs aren't attacker-controlled; the moment they are, the choice flips. So the honest answer is: quick sort beats merge sort *for trusted input where memory is precious*, which is more code than you'd think but less than the marketing suggests.

```
┌── Trusted input ──────────┐    ┌── Untrusted input ────────┐
│  Quick sort: ~50ms / 1M   │    │  Quick sort: O(n²) attack │
│    can be 30% faster       │   │  Switch to merge/TimSort  │
│  Memory: O(log n)         │    │  Memory: O(n)             │
│  Production: C++ STL      │    │  Production: V8, Java, Py │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Pivot, partition, recurse."
- "Average O(n log n); worst O(n²) on bad pivots."
- "In-place — O(log n) stack only."
- "Pick wisely on pivot, or use introsort."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the recursion tree for `[3, 8, 1, 5, 2, 7, 4]` with last-element pivot.

### Level 2 — Explain it out loud
"How does quick sort partition the array?" Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Given `[1,2,3,4,5,6,7,8]` (already sorted), how many comparisons does quick sort with last-element pivot do?"

(Answer: n²/2 — pathological case demonstrates worst case.)

### Level 4 — Defend the decision you'd change
"Would you swap quick sort for introsort in this codebase? What would the visualization look like?"

### Quick check
- File? → `src/app/sorting/quick-sort/page.tsx`.
- Avg complexity? → O(n log n).
- Worst? → O(n²).

✓ Pass: all three.
