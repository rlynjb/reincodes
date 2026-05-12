# Binary heap

**Industry name(s):** Binary heap, min-heap, max-heap
**Type:** Industry standard · Language-agnostic

> A complete binary tree where every parent is ≤ its children (min-heap), stored in a flat array via index arithmetic. Backs `PriorityQueue` and powers `heap-sort`.

**See also:** → [09-min-heap-priority-queue](./09-min-heap-priority-queue.md) · → [06-heap-sort](./06-heap-sort.md) · → [13-dijkstra](./13-dijkstra.md)

---

## Why care

You need to repeatedly grab the smallest (or largest) item from a constantly-changing collection. A sorted array gives O(n) insertion; a hash table gives no order at all. A binary heap gives you O(log n) insert and O(log n) extract-min — and stores everything in a flat array.

Binary heaps are the engine of priority queues, Dijkstra's algorithm, heap sort, top-k streaming algorithms, and many schedulers. The trick: a "tree" with a strict shape (complete binary tree) can live in an array, and tree navigation becomes index arithmetic.

---

## How it works

Picture a tournament bracket but flipped: smallest player at the top. To add a new player, place them at the next bracket slot and "bubble up" by swapping with their parent if they're smaller — until the heap property is restored. To remove the top (smallest), swap with the last slot, then "sift down" the new top by swapping with the smaller child until restored.

### The array-as-tree shape

```
Index:    0    1    2    3    4    5    6
Value:  [ 5,  10,  8,  15, 12, 20, 9 ]

As tree:
                5 (0)
              /       \
           10 (1)     8 (2)
           /    \     /    \
         15(3) 12(4) 20(5) 9(6)

Navigation:
  parent(i) = floor((i-1) / 2)
  left(i)   = 2i + 1
  right(i)  = 2i + 2

Heap property (min-heap):
  for all i:  arr[i] ≤ arr[left(i)] and arr[i] ≤ arr[right(i)]
```

### Operations

```
insert(value):
  append to end of array       // tree adds at bottom-right
  bubbleUp(last_idx)            // swap with parent while smaller

extractMin():
  result = arr[0]
  arr[0] = arr.pop()            // move last to root
  siftDown(0)                   // swap with smaller child while larger
  return result

bubbleUp(i):
  while i > 0 and arr[i] < arr[parent(i)]:
    swap(i, parent(i))
    i = parent(i)

siftDown(i):
  while true:
    smallest = i
    if left(i)  < size and arr[left(i)]  < arr[smallest]: smallest = left(i)
    if right(i) < size and arr[right(i)] < arr[smallest]: smallest = right(i)
    if smallest == i: break
    swap(i, smallest)
    i = smallest
```

### Complexity

```
┌────────────┬──────────────┐
│ Operation  │ Time         │
├────────────┼──────────────┤
│ insert     │ O(log n)     │
│ extractMin │ O(log n)     │
│ peek       │ O(1)         │
│ buildHeap  │ O(n) ← !     │
│ updateKey  │ O(log n)     │
│ space      │ O(n)         │
└────────────┴──────────────┘
```

`buildHeap` is the surprising one: O(n), not O(n log n). The proof: most nodes are near the bottom and sift-down by O(1) levels; the math averages to O(n).

### Insert trace into `[3, 5, 8, 10, 12]` (insert 4)

```
Start:        [3, 5, 8, 10, 12]
              tree:    3
                      / \
                     5   8
                    / \
                   10  12

Append:       [3, 5, 8, 10, 12, 4]
              tree:    3
                      / \
                     5   8
                    / \  / 
                   10 12 4

bubbleUp from idx 5 (value 4):
  parent(5) = 2, arr[2] = 8.  4 < 8?  yes, swap.
  
  Result:      [3, 5, 4, 10, 12, 8]
               tree:    3
                       / \
                      5   4
                     / \  /
                   10 12 8
  
  Now at idx 2.  parent(2) = 0, arr[0] = 3.  4 < 3?  no, stop.

Final:        [3, 5, 4, 10, 12, 8]
```

### Extract-min trace from `[3, 5, 4, 10, 12, 8]`

```
result = 3

Move last to root:  [8, 5, 4, 10, 12]
                    tree:    8
                            / \
                           5   4
                          / \
                         10 12

siftDown from idx 0 (value 8):
  children: arr[1]=5, arr[2]=4.  Smallest child = 4 at idx 2.
  8 > 4?  yes, swap.
  
  Result:  [4, 5, 8, 10, 12]
           tree:    4
                   / \
                  5   8
                 / \
                10 12
  
  Now at idx 2.  children: arr[5] doesn't exist, arr[6] doesn't exist.
  No children → stop.

Return 3.  Heap is now [4, 5, 8, 10, 12].
```

### The principle

This is what people mean by *implicit data structures*. The "tree" is a mental model; the storage is a flat array. Index arithmetic replaces pointer chasing — the CPU loves contiguous memory, so heap operations are cache-friendly despite the conceptual tree shape.

The full picture is below.

---

## Binary heap — diagram

```
Min-heap (parent ≤ children) array form:

  [ 3,  5,  8,  10, 12, 20, 9 ]
    0   1   2    3   4   5  6

As tree:
                 3 (0)
                /       \
             5 (1)      8 (2)
             /  \       /   \
          10(3) 12(4) 20(5) 9(6)

Insert 4:                    Extract min:
  append 4 at idx 7            move last (9) to root
  bubbleUp:                    siftDown:
    4 < 12? swap                 root=9 → children 5,8 → 5<9 → swap
    4 < 5?  swap                 9 at idx 1 → children 10,12 → 9<10 stop
    4 < 3?  no, stop
  
  Result heap respects         Result heap respects
  parent ≤ children            parent ≤ children
```

---

## In this codebase

**Class:** `src/utils/data_structures/BinaryHeap.ts` — min/max heap implementation.
**Used by:** `PriorityQueue` ([09](./09-min-heap-priority-queue.md)) and `heap-sort` ([06](./06-heap-sort.md)).

GitHub: `[BinaryHeap.ts](https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/BinaryHeap.ts)`.

---

## Elaborate

### Where this pattern comes from
J.W.J. Williams (1964) for heap sort. The array storage is what makes it practical — predates Williams as the standard way to lay out complete binary trees.

### The deeper principle
*Structure-via-position is cache-friendly.* When the "tree shape" comes from array indices, sequential memory access does the navigation work. Heap traversal is bad for cache (factor-of-two jumps), but the array layout is still better than pointer-chasing through allocated nodes.

### Where this breaks down
- Doesn't support arbitrary key lookup (no "find this value" in O(log n) — must scan).
- Decrease-key requires knowing the index of the key (need a separate map).
- Cache locality degrades at deeper levels (large jumps).

### What to explore next
- [09-min-heap-priority-queue](./09-min-heap-priority-queue.md) — heap as the priority queue's engine.
- [13-dijkstra](./13-dijkstra.md) — heap as the shortest-path engine.
- Fibonacci heap — theoretically faster decrease-key, practically worse constants.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Binary heap (array)      │ BST (pointers)           │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ insert           │ O(log n)                 │ O(log n) avg / O(n) deg  │
│ extractMin       │ O(log n)                 │ O(log n) avg / O(n)      │
│ findKey          │ O(n)                     │ O(log n) avg             │
│ buildFromArray   │ O(n)                     │ O(n log n)               │
│ Cache locality   │ Good (contiguous)        │ Poor (pointer-chase)     │
│ Memory overhead  │ Just the data            │ Data + 2 pointers/node   │
│ Ordering         │ Heap property only       │ Full sorted order        │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Arbitrary key lookup. To find "is value X in the heap?" requires O(n) scan. BSTs do this in O(log n).

Full ordering. A heap only guarantees parent ≤ children; siblings can be in any order. You can't traverse a heap to get sorted output without consuming it (which is exactly what heap sort does).

### What the alternative would have cost

A sorted array gives O(1) min but O(n) insert. A BST gives O(log n) for both but with pointer overhead and cache penalty. Binary heap is the goldilocks of "I only care about the extremum, not the full order."

### The breakpoint

Fine when the access pattern is "give me the extremum and remove it" — that's the heap's sweet spot. Fails when you need range queries, arbitrary lookups, or full sorted output without consuming the structure.

---

## Tech reference (industry pairing)

### Binary heap as array

- **Codebase uses:** Custom `BinaryHeap` class in `src/utils/data_structures/BinaryHeap.ts`.
- **Why it's here:** the substrate for `PriorityQueue` and `heap-sort`.
- **Leading today:** Binary heap — `adoption-leading` for priority queues, 2026.
- **Why it leads:** simple, cache-friendly, optimal in big-O for the common ops.
- **Runner-up:** Fibonacci heap — theoretically faster decrease-key (O(1) amortised); used in some graph algorithms; constants too bad for general use.

---

## Summary

### Part 1 — concept recap

A binary heap is a complete binary tree with a parent-vs-children ordering invariant (min-heap or max-heap), stored as a flat array with index arithmetic for parent/child navigation. reincodes implements one in `BinaryHeap.ts` and uses it as the engine of `PriorityQueue` and `heap-sort`. The constraint is "I only need to repeatedly pull the extremum," and the cost is no arbitrary-key lookup (you'd need a hash map alongside).

### Part 2 — key points to remember

- Complete binary tree; parent at index `floor((i-1)/2)`, children at `2i+1` and `2i+2`.
- O(log n) insert and extractMin; O(n) build from unordered array.
- Cache-friendly array layout; no pointer overhead.
- Only the parent-vs-children invariant; siblings are unordered.
- The cost is loss of arbitrary lookup; the benefit is the simplest optimal priority queue.

---

## Interview defense

### What an interviewer is really asking

When someone asks about heaps, they want to hear you say "complete binary tree, array-stored, parent ≤ children" and explain insert + extractMin. The interesting follow-up is *why this isn't a BST or a sorted array*.

### Likely questions

**Q [mid]: How does bubble-up restore the heap property after insert?**

A: After appending the new value at the end of the array (which is the next available leaf in the tree), compare with parent. If smaller (min-heap), swap. Repeat at the new index until the new value's parent is smaller-or-equal or you reach the root.

```
Insert 4 into [3, 5, 8]:
  append → [3, 5, 8, 4]
            tree:   3
                   / \
                  5   8
                 /
                4
  bubbleUp idx=3: parent=idx 1=5. 4<5? swap.
             tree:   3
                    / \
                   4   8
                  /
                 5
  bubbleUp idx=1: parent=idx 0=3. 4<3? no, stop.
```

**Q [senior]: Why O(n) to build a heap from an unsorted array? Naive analysis says O(n log n).**

A: Naive: insert n items one at a time, each O(log n) → O(n log n). Smarter: starting from the last non-leaf node, sift down each. The bottom half of nodes sift down by 0 levels (they're leaves); the next quarter sifts by 1 level; etc. Summing the geometric series: O(n × (1×½ + 2×¼ + 3×⅛ + ...)) = O(n). Most of the work is at the bottom; the bottom has little work to do.

```
Level | # nodes | sift cost per node | total
------|---------|---------------------|------
  0   |   1     | log n               | log n
  1   |   2     | log n - 1           | 2(log n - 1)
  ... |  ...    | ...                 | ...
  k   |  n/2    | 1                   | n/2

Sum ≈ O(n)  (the bottom dominates, cost per node is small)
```

**Q [arch]: When would you use a Fibonacci heap instead?**

A: Theoretically, when you have many decrease-key operations and few extract-mins — Dijkstra with dense graphs is the classic example. Fibonacci heap gives O(1) amortised decrease-key vs binary heap's O(log n). In practice, Fibonacci heap's constants are so bad that you only see it in competitive programming and theoretical analyses; production Dijkstra implementations use binary heap.

### The question candidates always dodge

**Q: Heaps don't support `findKey` in O(log n). Why isn't that a problem in practice?**

A: Because the typical heap use cases don't need it. Priority queues feed work to a scheduler — once dequeued, the task is in progress and we don't care about the queue. Heap sort is consumption-only. Dijkstra needs decrease-key, which requires a side-channel (a map from key → heap index) — and that side channel is what real implementations carry alongside the heap. The "heaps don't support findKey" is a non-issue precisely because nobody asks for it from a heap; they ask for it from the augmented "heap + map" structure.

```
┌── Pure heap ──────────────┐    ┌── Heap + index map ───────┐
│  insert / extractMin O(log)│   │  insert  O(log)            │
│  findKey  O(n)             │   │  findKey O(1)              │
│  Used: scheduler, sort     │   │  Used: Dijkstra            │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Complete binary tree, flat array, index arithmetic."
- "Parent ≤ children (min-heap) — not siblings."
- "Insert + extract = O(log n); build-from-array = O(n)."
- "Drives PriorityQueue, heap-sort, Dijkstra."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the binary heap representation of `[3, 5, 8, 10, 12, 20, 9]` as both array and tree. Label parent-child indices.

### Level 2 — Explain it out loud
"How does sift-down work and when does it terminate?"

### Level 3 — Apply it to a new scenario
"You have a stream of n numbers and want the smallest k at any moment. What heap do you use?"
(Answer: max-heap of size k; insert each number, evict the max if it exceeds k.)

### Level 4 — Defend the decision you'd change
"Would you use a `BinaryHeap` class or a typed array (`Float64Array`) for production code?"

### Quick check
- File? → `src/utils/data_structures/BinaryHeap.ts`.
- Insert complexity? → O(log n).
- Build-from-array? → O(n).

✓ Pass: all three.
