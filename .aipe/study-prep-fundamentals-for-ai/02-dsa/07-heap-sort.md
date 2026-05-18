# Heap sort

**Industry name(s):** Heap sort, heapsort
**Type:** Industry standard · Language-agnostic

> Treat the array as a binary heap, build it once in O(n), then repeatedly extract the root — guaranteed O(n log n), in-place, but not stable.

**See also:** → 04-selection-sort.md · → 05-merge-sort.md · → 06-quick-sort.md

---

## Why care

You've watched merge sort guarantee O(n log n) at the cost of an O(n) auxiliary buffer, and quick sort hit faster average runtime at the cost of an O(n²) worst case (probabilistically defended by random pivot). Now imagine a third path: keep the guaranteed O(n log n) of merge sort, but do it *in place* with O(1) extra memory. The trick is structuring the array as a binary heap — a complete tree where every parent is smaller than (or larger than) its children — and using the heap's "extract root in O(log n)" operation as the sort engine.

That "build heap, extract n times" routine is what *heap sort* does. The implementation isn't an array sort that happens to use a heap — it's the heap data structure operated on as if it were a sort. The array `bars` is reinterpreted as a tree: index 0 is the root, indices 1 and 2 are its children, indices 3 and 4 are 1's children, and so on. The mapping `parent(i) = (i-1)/2`, `leftChild(i) = 2i+1`, `rightChild(i) = 2i+2` lets you walk the tree using only arithmetic — no pointers, no nodes, no allocations.

**Why you need to answer that question at all:** because heap sort is the algorithm you reach for when you need the worst-case guarantee of merge sort and the memory profile of quick sort. It's also the *fallback* algorithm inside Introsort (C++ `std::sort`): when quick sort's recursion depth exceeds `2 log n` (suggesting an adversarial input), the implementation switches to heap sort to prevent the O(n²) collapse. Without heap sort, Introsort isn't introspective — it's just quick sort with a panic button and no parachute.

Without understanding heap sort:
- "In-place O(n log n)" reads as a magic combination
- Priority queues, Dijkstra's algorithm, scheduling algorithms — all heap-backed — share an underlying mystery
- Introsort's "fall back to heap sort" sounds arbitrary

With it:
- "In-place O(n log n)" decomposes into "build heap O(n) + extract n times each O(log n) = O(n log n)"
- Priority queues become "the heap data structure exposed as an API"
- Introsort's fallback becomes "switch from O(n²)-risk to O(n log n)-guarantee when the input shape gets suspicious"

Heap sort is `selection-sort + heap` — replace the O(n) "find min" with an O(log n) "extract root" and you've upgraded selection sort's O(n²) to O(n log n).

---

## How it works

**The mental model: an array is secretly a complete binary tree; the heap property keeps the smallest (or largest) value always at index 0.**

You've already built half of this pattern. When you write `tree.root` and walk to `tree.root.left.right`, you're traversing a tree by pointers. A binary heap is the same tree, but stored as a flat array — the children of `arr[i]` live at `arr[2i+1]` and `arr[2i+2]`. The tree is *implicit*; the array is the storage. This lets you have a tree-shaped data structure with zero allocation overhead per node.

```
the array IS the tree:

  index:    0   1   2   3   4   5   6
  array:  [ 7, 12, 18, 23, 41, 55, ... ]

  tree view:
                     7  (root, index 0)
                    / \
                  12   18
                 / \   /
               23  41 55

  children of i:  left  = 2i + 1
                  right = 2i + 2
  parent  of i:   floor((i - 1) / 2)
```

Heap property (min-heap): every parent ≤ its children. The minimum value is always at the root (index 0). For a max-heap, every parent ≥ its children, and the maximum is at the root.

The strategy: build the heap once (O(n) with the right algorithm), then extract the root `n` times. Each extraction takes O(log n) — the cost of restoring the heap property after removing the root.

### The build step — bottom-up heapify

Building a heap from an arbitrary array can be done in O(n) using *bottom-up heapify*: start at the last non-leaf node (index `floor(n/2) - 1`), heapify it, then walk backward to the root, heapifying each node as you go. Each heapify call is O(log n) worst case, but the total cost across all calls is O(n) — most nodes are near the leaves (where heapify cost is small), and only one is the root (where heapify cost is log n).

```
heapify-down (the operation that restores the heap property at one node):

  state: arr[rootIndex] might violate heap property w.r.t. its children
  goal:  push arr[rootIndex] down until it sits above its children

  while leftChild exists:
    pick the smaller (or larger, for max-heap) of left and right child
    if that child should be above arr[rootIndex]: swap, continue down
    else: stop — heap property is restored

each call: O(log n) — height of the tree
```

The bridge from what you know. In React you bubble events upward (`onChange` propagating up through parents). Heapify is the opposite — bubble a value downward through a tree, swapping with its smaller child until it lands. The data flow is parent → child → grandchild, comparing-and-swapping at each step.

```
bottom-up build for [23, 7, 41, 12, 55, 18], n=6:

initial tree (just by index layout, no heap order yet):

              23 (i=0)
             /  \
           7     41
           /\    /
          12 55 18

start at i = floor(6/2) - 1 = 2:
  heapify(arr, i=2, n=6):
    leftChild = 2*2+1 = 5 (value 18)
    rightChild = 6 (out of bounds)
    smaller of children: 18
    arr[2]=41 > arr[5]=18? yes (for min-heap, swap)
    swap → arr = [23, 7, 18, 12, 55, 41]
    next iteration: i=5, leftChild=11 (out of bounds) → stop

i = 1:
  heapify(arr, i=1, n=6):
    leftChild = 3 (value 12), rightChild = 4 (value 55)
    smaller: 12
    arr[1]=7 > arr[3]=12? no → heap property holds → stop

i = 0:
  heapify(arr, i=0, n=6):
    leftChild = 1 (value 7), rightChild = 2 (value 18)
    smaller: 7
    arr[0]=23 > arr[1]=7? yes → swap
    arr = [7, 23, 18, 12, 55, 41]
    next iteration: i=1, leftChild=3 (value 12), rightChild=4 (value 55)
    smaller: 12
    arr[1]=23 > arr[3]=12? yes → swap
    arr = [7, 12, 18, 23, 55, 41]
    next iteration: i=3, leftChild=7 (out of bounds) → stop

after build:
  arr = [7, 12, 18, 23, 55, 41]
       — heap property holds:
         arr[0]=7 ≤ arr[1]=12, arr[2]=18
         arr[1]=12 ≤ arr[3]=23, arr[4]=55
         arr[2]=18 ≤ arr[5]=41
```

The practical consequence: after the build phase, the smallest value is guaranteed at `arr[0]`. The array isn't sorted yet, but it has the structural property the extract phase will exploit.

### The extract step — repeated root removal

After build, sorting works by swapping `arr[0]` (the minimum) with the last element, "removing" the last element from the heap (conceptually shrinking the heap's effective size), and re-heapifying the new root. Repeat until the heap is empty.

Wait — there's a subtlety. If you use a min-heap and swap the root to the end, you produce a descending-sorted array (smallest at the end, largest at the start). To produce ascending-sorted output, you use a max-heap (root is the largest) and swap root to end, growing the sorted suffix from right to left. That's why production heap sort uses max-heaps.

The `iterative_heap_sort` function in `BinaryHeap.ts` L395–L415 follows this canonical max-heap pattern:

```
iterative_heap_sort(arr):
  // Phase 1: build max-heap (bottom-up)
  for i from floor(n/2) - 1 down to 0:
    iterative_heapify(arr, i, n)

  // Phase 2: extract max repeatedly
  for i from n - 1 down to 1:
    swap(arr[0], arr[i])         // move max to end of unsorted region
    iterative_heapify(arr, 0, i) // re-heapify with size i (sorted suffix excluded)

  return arr (now ascending sorted)
```

```
extract-phase trace for max-heap [55, 41, 18, 23, 12, 7]:

iter i=5: swap arr[0]↔arr[5]   → [7, 41, 18, 23, 12, 55]
          heapify(arr, 0, 5) — only first 5 elements form the heap
            → arr = [41, 23, 18, 7, 12, 55]
                                      ↑ sorted suffix

iter i=4: swap arr[0]↔arr[4]   → [12, 23, 18, 7, 41, 55]
          heapify(arr, 0, 4)
            → arr = [23, 12, 18, 7, 41, 55]

iter i=3: swap arr[0]↔arr[3]   → [7, 12, 18, 23, 41, 55]
          heapify(arr, 0, 3)
            → arr = [18, 12, 7, 23, 41, 55]
                                ↑ sorted suffix grows

iter i=2: swap arr[0]↔arr[2]   → [7, 12, 18, 23, 41, 55]
          heapify(arr, 0, 2)
            → arr = [12, 7, 18, 23, 41, 55]

iter i=1: swap arr[0]↔arr[1]   → [7, 12, 18, 23, 41, 55]
          heapify(arr, 0, 1)
            → arr = [7, 12, 18, 23, 41, 55]   (heap of size 1, trivially OK)

final: arr = [7, 12, 18, 23, 41, 55]  ✓
```

The bridge from what you know. This is selection sort with a faster "find max" step. Selection sort scans the unsorted region in O(n) to find the max; heap sort extracts it in O(log n) via heapify. Same outer structure ("place max at the end, repeat"); different inner cost.

### The codebase's actual visualizer — a different (less efficient) pattern

The codebase's `src/app/sorting/heap-sort/page.tsx` doesn't use the in-place max-heap pattern. It uses an *external min-heap* approach: insert every value of `bars` into a `MinHeap` instance one at a time (O(n log n) total for n inserts), then call `getMin()` n times to drain the heap into the output array.

```
codebase pattern (heap-sort/page.tsx L82–L106):

  // Phase 1: build heap via repeated insert (O(n log n), not O(n))
  bars.forEach(v => minheap.insert(v))

  // animation pass — replay the swap sequence the heap recorded
  await satisfyHeapAndAnimateInUI(minheap.swapSequence, bars)

  // Phase 2: drain the heap, write back to bars one slot at a time
  const output = []
  for (i = 0..bars.length - 1):
    output.push(minheap.getMin())     // O(log n) per call

  for (i = 0..output.length - 1):
    setBars(prev => [...prev with prev[i] = output[i]])
    await delayLoop(defaultSpeed)
```

This is O(n log n) total but with worse constants than the canonical in-place version. The build phase via repeated insert is O(n log n) instead of O(n) for bottom-up heapify. And the implementation maintains an *external* heap (separate `MinHeap` instance) rather than operating on `bars` in place, so memory becomes O(n) auxiliary instead of O(1).

The reference implementation in `BinaryHeap.ts` L395–L415 (`iterative_heap_sort`) is the canonical version — same file, the algorithmic answer, just not the one the visualizer uses.

### The principle

Heap sort is the *bridge between selection sort and a tree-shaped data structure*. The selection-sort skeleton ("repeatedly pick the smallest from what's left, place it") is exactly the same; the speedup comes from using a heap to do the "pick smallest" in O(log n) instead of O(n). This is the general pattern of algorithmic improvement: identify the inner-loop bottleneck (here: linear scan for min), and back it with a smarter data structure (here: heap). Dijkstra's algorithm does the same trick — selection of the next node to visit goes from O(V) (naïve) to O(log V) (heap-backed priority queue).

The full picture is below.

---

## Heap sort — diagram

```
                  bars = [23, 7, 41, 12, 55, 18]
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ Phase 1: build heap              │
                  │   for i = floor(n/2) - 1 .. 0:   │
                  │     heapify(arr, i, n)           │
                  │   (canonical: bottom-up O(n);    │
                  │    codebase variant: repeated    │
                  │    insert O(n log n))            │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ Phase 2: extract max n times     │
                  │   for i = n - 1 .. 1:            │
                  │     swap(arr[0], arr[i])         │
                  │     heapify(arr, 0, i)           │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ heapify(arr, rootIdx, n):        │
                  │   while leftChild exists:        │
                  │     i = rootIdx                  │
                  │     if leftChild > arr[i]: i=lc  │
                  │     if rightChild > arr[i]: i=rc │
                  │     if i !== rootIdx: swap, cont │
                  │     else: break                  │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ visualizer (codebase variant):   │
                  │   setBars(prev => write output)  │
                  │   await delayLoop(speed)         │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────────┐
                  │ bars = [7, 12, 18, 23, 41, 55]   │
                  └──────────────────────────────────┘
```

---

## In this codebase

**Two implementations exist — one visualizer-friendly, one canonical.**

**Visualizer implementation:**
- **File:** `src/app/sorting/heap-sort/page.tsx`
- **Function:** `minHeapsort` (inner async function inside `HeapSort` component)
- **Line range:** L82–L106

The shape, trimmed:

```
const minheap = new MinHeap();

const minHeapsort = async () => {
  bars.forEach(v => minheap.insert(v));            // Phase 1: insert all
  await satisfyHeapAndAnimateInUI(
    minheap.swapSequence, bars                     // animate the build
  );

  const output = [];
  for (let i = 0; i < bars.length; i++) {
    output.push(minheap.getMin());                 // Phase 2: drain
  }

  for (let i = 0; i < output.length; i++) {
    setBars(prev => {
      const newarr = [...prev];
      newarr[i] = output[i];
      return newarr;
    });
    await delayLoop(defaultSpeed);
  }
}
```

**Heap data structure:**
- **File:** `src/utils/data_structures/BinaryHeap.ts`
- **Class:** `MinHeap` (L23–L133)
- **Methods:** `insert` (L70), `heapifyUp` (L50), `getMin` (L120), `heapifyDown` (L86)

The `MinHeap` class stores the heap as a plain array (`this.heap: any[]`). `insert(value)` pushes to the end and calls `heapifyUp` to bubble it into place. `getMin()` swaps root with last, pops the last element, calls `heapifyDown` on the new root, and returns the saved minimum. Both are O(log n).

**Canonical reference implementation:**
- **File:** `src/utils/data_structures/BinaryHeap.ts`
- **Function:** `iterative_heap_sort` (L395–L415)
- **Line range:** L395–L415

This is the in-place max-heap version with O(n) build and O(n log n) extract. It isn't called by the visualizer page, but it's in the same file and serves as the reference for how heap sort *should* be implemented in production. Note the comment at L405–L408: "re-heapifying the unsorted section. It is similar to selection sort" — the codebase explicitly names the connection.

**Visualizer hooks (page implementation):**
- `highlightIndices` (state, L51) — pairs of indices being swapped during the heapify animation.
- `setBars(prev => ...)` — functional setter form so each slot write composes safely with the previous state.
- `await delayLoop(defaultSpeed)` — fires between heap-build swaps and between output-write slots. The animation tracks heap swaps, then the drain.

**Why two implementations.** The visualizer uses the external-heap approach because it gives the page a clean way to display *two* things: the heap being built (via `swapSequence`) and the sorted output being produced (via the second `setBars` loop). The in-place version would produce a single animation that's harder to read — the heap is hidden inside the same array as the output, and the boundary between heap region and sorted region shifts every iteration. The codebase trades algorithmic purity for animation clarity.

---

## Elaborate

### Where this pattern comes from

Heap sort was invented by J. W. J. Williams in 1964 as a refinement of selection sort. The breakthrough was the realization that an array could implicitly represent a complete binary tree using only arithmetic for parent/child navigation — no node objects, no pointers. Robert Floyd published the O(n) bottom-up heapify analysis in 1964, completing the algorithm's modern form.

The same heap data structure underlies priority queues, Dijkstra's algorithm, A* pathfinding, scheduling algorithms in operating systems, and event queues in simulators. Heap sort is one of many uses of the heap; the data structure itself is far more important than the sort.

### The deeper principle

*Data structure as algorithm primitive.* The asymptotic improvement from selection sort to heap sort isn't in the outer loop — both do `n` iterations of "extract and place." The improvement is in the inner step: linear scan O(n) → heap extract O(log n). The general lesson: when a slow algorithm's inner loop is a `min`/`max` or "where do I insert next" operation over a changing collection, back it with a data structure that supports that operation in sub-linear time.

```
the substitution pattern:

  Selection sort:                    Heap sort:
    outer loop: place n elements       outer loop: place n elements
    inner loop: O(n) linear scan       inner loop: O(log n) heap extract
    ─────────────────────             ─────────────────────
    total: O(n²)                       total: O(n log n)

  Same pattern in other algorithms:
    Dijkstra (naïve):    O(V²)   |   Dijkstra (heap):    O((V + E) log V)
    Insertion sort:      O(n²)   |   Tree sort (BST):    O(n log n) avg
    Linear graph BFS:    O(V²)   |   BFS with adj list:  O(V + E)
```

### Where this breaks down

Heap sort is consistently 2–3× slower than quick sort on random in-memory data, despite the same asymptotic complexity. The reason is cache locality: quick sort's partition step walks the array sequentially (cache-friendly), but heap sort's heapify-down operation jumps between indices `i`, `2i+1`, `2i+2`, `4i+3` and so on — addresses that grow exponentially apart, blowing through cache lines. On large arrays this dominates.

Heap sort is also *not stable*. The heapify-down step can move equal-key elements arbitrarily relative to each other, so two objects with the same primary key can swap relative order. Ruling out heap sort anywhere stability matters.

### What to explore next

- Priority queues → the heap data structure exposed as `enqueue`/`dequeue` with priorities.
- Dijkstra's algorithm → shortest-path search using a min-heap for next-node selection.
- Introsort → C++'s `std::sort` — quick sort with heap sort as a fallback when recursion depth gets suspicious.
- Fibonacci heap → an advanced heap variant with O(1) amortized decrease-key, used in modern shortest-path algorithms.
- Pairing heaps → a simpler advanced heap that performs well in practice.

---

## How it works — brute force vs optimal

### The data

```
bars: number[] of length n
range: [1, 60] from generateArrayOfRandomNumbers
example: [23, 7, 41, 12, 55, 18]
```

### The problem

Sort `bars` ascending, in place, with O(n log n) worst-case time and O(1) auxiliary memory.

### ── Brute force (selection sort baseline) ──

Selection sort is the brute-force "extract-and-place" algorithm — same outer structure as heap sort, with O(n) linear scan for the inner "find min" step instead of O(log n) heap extract.

**Pseudocode:**

```
for t from 0 to n - 1:
    minIndex = t
    for a from t + 1 to n - 1:
        if arr[a] < arr[minIndex]:
            minIndex = a
    swap(arr[t], arr[minIndex])
```

**Complexity:** O(n²) time always · O(1) space

**What goes wrong at scale:** at n = 10,000, selection sort does ~50 million comparisons regardless of input — ~250ms in V8. At n = 100,000, ~5 billion comparisons, ~25 seconds. The outer loop is the same as heap sort; the cost is entirely in the inner linear scan.

### ── Optimal (in-place max-heap sort, the canonical implementation) ──

**The insight:** selection sort's outer structure is correct, but the inner "find min in unsorted region" step is the bottleneck. Replace it with a heap-extract operation. Build the heap once in O(n) using bottom-up heapify. Then extract `n` times, each in O(log n). Total: O(n) + O(n log n) = O(n log n).

**Pseudocode** (max-heap version, from `BinaryHeap.ts` L395–L415):

```
heap_sort(arr):
    n = arr.length

    // Phase 1: bottom-up build
    for i from floor(n/2) - 1 down to 0:
        heapify_down(arr, i, n)

    // Phase 2: extract max repeatedly
    for i from n - 1 down to 1:
        swap(arr[0], arr[i])
        heapify_down(arr, 0, i)   // heap size is now i (sorted suffix excluded)

    return arr

heapify_down(arr, rootIdx, heapSize):
    while true:
        i = rootIdx
        leftChild  = 2 * rootIdx + 1
        rightChild = 2 * rootIdx + 2
        if leftChild  < heapSize and arr[leftChild]  > arr[i]: i = leftChild
        if rightChild < heapSize and arr[rightChild] > arr[i]: i = rightChild
        if i !== rootIdx:
            swap(arr[i], arr[rootIdx])
            rootIdx = i
        else:
            break
```

**Execution trace** — `bars = [23, 7, 41, 12, 55, 18]`, n = 6:

```
Phase 1: bottom-up build a max-heap

start: arr = [23, 7, 41, 12, 55, 18]

i = floor(6/2) - 1 = 2:
  heapify(arr, 2, 6):
    leftChild = 5 (value 18), rightChild = 6 (out of bounds)
    largest candidate: arr[2]=41 vs arr[5]=18 → arr[2] stays largest
    no swap, break
  arr = [23, 7, 41, 12, 55, 18]

i = 1:
  heapify(arr, 1, 6):
    leftChild = 3 (value 12), rightChild = 4 (value 55)
    largest: arr[4]=55 (right child)
    swap arr[1] ↔ arr[4]
    arr = [23, 55, 41, 12, 7, 18]
    next iter: rootIdx = 4
    leftChild = 9 (out of bounds), break

i = 0:
  heapify(arr, 0, 6):
    leftChild = 1 (value 55), rightChild = 2 (value 41)
    largest: arr[1]=55
    swap arr[0] ↔ arr[1]
    arr = [55, 23, 41, 12, 7, 18]
    next iter: rootIdx = 1
    leftChild = 3 (value 12), rightChild = 4 (value 7)
    largest candidate: arr[1]=23 vs arr[3]=12 vs arr[4]=7 → arr[1] stays
    no swap, break

after build: arr = [55, 23, 41, 12, 7, 18]
  max-heap property:
    arr[0]=55 ≥ arr[1]=23, arr[2]=41
    arr[1]=23 ≥ arr[3]=12, arr[4]=7
    arr[2]=41 ≥ arr[5]=18  ✓

Phase 2: extract max n-1 times

iter i=5:
  swap arr[0]↔arr[5] → arr = [18, 23, 41, 12, 7, 55]
                                              ↑ sorted suffix begins
  heapify(arr, 0, 5):
    leftChild=1 (23), rightChild=2 (41), largest=arr[2]=41
    swap arr[0]↔arr[2] → arr = [41, 23, 18, 12, 7, 55]
    rootIdx=2, leftChild=5 (out of heap, since heapSize=5), break
  arr = [41, 23, 18, 12, 7, 55]

iter i=4:
  swap arr[0]↔arr[4] → arr = [7, 23, 18, 12, 41, 55]
  heapify(arr, 0, 4):
    leftChild=1 (23), rightChild=2 (18), largest=arr[1]=23
    swap arr[0]↔arr[1] → arr = [23, 7, 18, 12, 41, 55]
    rootIdx=1, leftChild=3 (12), rightChild=4 (out, heapSize=4), largest=arr[1]=7 vs 12 → arr[3]=12
    swap arr[1]↔arr[3] → arr = [23, 12, 18, 7, 41, 55]
    rootIdx=3, leftChild=7 (out), break
  arr = [23, 12, 18, 7, 41, 55]

iter i=3:
  swap arr[0]↔arr[3] → arr = [7, 12, 18, 23, 41, 55]
  heapify(arr, 0, 3):
    leftChild=1 (12), rightChild=2 (18), largest=arr[2]=18
    swap arr[0]↔arr[2] → arr = [18, 12, 7, 23, 41, 55]
    rootIdx=2, leftChild=5 (out, heapSize=3), break
  arr = [18, 12, 7, 23, 41, 55]

iter i=2:
  swap arr[0]↔arr[2] → arr = [7, 12, 18, 23, 41, 55]
  heapify(arr, 0, 2):
    leftChild=1 (12), rightChild=2 (out, heapSize=2), largest=arr[1]=12
    swap arr[0]↔arr[1] → arr = [12, 7, 18, 23, 41, 55]
    rootIdx=1, leftChild=3 (out), break
  arr = [12, 7, 18, 23, 41, 55]

iter i=1:
  swap arr[0]↔arr[1] → arr = [7, 12, 18, 23, 41, 55]
  heapify(arr, 0, 1):
    leftChild=1 (out, heapSize=1), break
  arr = [7, 12, 18, 23, 41, 55]

final: arr = [7, 12, 18, 23, 41, 55] ✓
```

Variable state across phases:

```
phase           | step       | arr state
────────────────┼────────────┼─────────────────────────────
initial         |            | [23, 7, 41, 12, 55, 18]
build i=2       | no swap    | [23, 7, 41, 12, 55, 18]
build i=1       | swap 7↔55  | [23, 55, 41, 12, 7, 18]
build i=0       | swap 23↔55 | [55, 23, 41, 12, 7, 18]
extract iter 5  | place 55   | [41, 23, 18, 12, 7, 55]
extract iter 4  | place 41   | [23, 12, 18, 7, 41, 55]
extract iter 3  | place 23   | [18, 12, 7, 23, 41, 55]
extract iter 2  | place 18   | [12, 7, 18, 23, 41, 55]
extract iter 1  | place 12   | [7, 12, 18, 23, 41, 55] ✓
                build comparisons: ~6
                extract comparisons: ~15
                total: ~21
```

**Complexity:** O(n log n) time worst/avg/best · O(1) auxiliary space · O(1) recursion (iterative)

**Why it's faster:** the inner "find max" step drops from O(n) (selection sort) to O(log n) (heap extract). The outer loop count stays the same. Total work scales from O(n²) to O(n log n) — at n = 10,000, that's ~140k operations instead of ~50M, a ~350× speedup.

### ── Comparison ──

```
┌─────────────────┬───────────────────┬──────────────────────┐
│                 │ Selection sort    │ Heap sort            │
│                 │ (brute force)     │ (optimal)            │
├─────────────────┼───────────────────┼──────────────────────┤
│ Worst time      │ O(n²)             │ O(n log n)           │
│ Avg time        │ O(n²)             │ O(n log n)           │
│ Best time       │ O(n²)             │ O(n log n)           │
│ Space           │ O(1)              │ O(1) (in-place)      │
│ Stable          │ no                │ no                   │
│ Adversarial     │ uniform — no best │ uniform — no worst   │
│ At n=50 random  │ ~1,225 ops        │ ~280 ops             │
│ At n=10k random │ ~50M ops          │ ~140k ops            │
│ At n=1M random  │ ~500B ops         │ ~20M ops             │
│ Cache locality  │ poor (suffix scan)│ poor (tree jumps)    │
│ Used in         │ write-limited mem │ Introsort fallback,  │
│                 │                   │ priority queues      │
└─────────────────┴───────────────────┴──────────────────────┘
```

**When brute force is fine:** selection sort beats heap sort below n ≈ 30 because the heap's constant factor (heapify-down's tree navigation overhead) exceeds its asymptotic savings on small inputs. Above n = 50, heap sort dominates.

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬───────────────────────┬───────────────────────┐
│ Cost dimension   │ Heap sort             │ Merge sort            │
├──────────────────┼───────────────────────┼───────────────────────┤
│ Time worst       │ O(n log n)            │ O(n log n)            │
│ Time avg         │ O(n log n)            │ O(n log n)            │
│ Space            │ O(1) in-place         │ O(n) auxiliary        │
│ Stable           │ no                    │ yes (with `<=`)       │
│ Cache locality   │ poor (tree jumps)     │ poor (alloc per merge)│
│ Constant factor  │ ~2× slower than quick │ ~1.5× slower than     │
│                  │ sort on random data   │ quick sort            │
│ Adversarial      │ immune                │ immune                │
│ Used in          │ Introsort fallback,   │ TimSort merge phase,  │
│                  │ priority queues,      │ DB external sorts,    │
│                  │ Dijkstra              │ Java Arrays.sort(obj) │
│ Lines of code    │ ~20 (with heapify)    │ ~40 (with merge)      │
└──────────────────┴───────────────────────┴───────────────────────┘
```

### Sub-block 1 — what we gave up

Stability. Heapify-down moves equal-key elements arbitrarily — there's no rule that ensures earlier-indexed equal items stay before later-indexed ones. Anywhere a multi-key sort is needed, heap sort fails silently.

Constant-factor speed. Heap sort is 2–3× slower than quick sort on random in-memory integer data, despite identical asymptotic class. The reason is cache locality: heapify-down jumps between indices `i`, `2i+1`, `4i+3`, etc., which are exponentially spaced — every step blows through cache lines. Quick sort's partition step walks sequentially, hitting prefetched cache.

The codebase's visualizer-friendly implementation gives up even more: the external-heap approach uses O(n) auxiliary memory (the separate `MinHeap` instance) instead of O(1), and the build phase is O(n log n) via repeated insert instead of O(n) via bottom-up heapify. For a teaching tool this is fine — the canonical version is in `BinaryHeap.ts` L395–L415 — but it means the page demonstrates a heap-backed sort, not the canonical in-place heap sort.

### Sub-block 2 — what the alternative would have cost

If the visualizer used the in-place max-heap version (canonical), the algorithm would be strictly better on memory and constant factor, but the animation would be harder to read. The user sees `bars` mutate twice per extract step — once when the root swaps with the end, once during heapify-down — and the boundary between "heap region" and "sorted suffix" is invisible without extra UI. The external-heap version sacrifices algorithmic purity for animation clarity.

If the visualizer used merge sort, the algorithm would be stable but cost O(n) auxiliary memory. Heap sort wins on memory; merge sort wins on stability. The pedagogical contrast is "you can have two of {worst-case guarantee, stable, in-place}, never all three."

If the visualizer used quick sort, the algorithm would be ~2× faster on random input but risk O(n²) on adversarial inputs (without three-way partition). Heap sort's worst-case guarantee is the property quick sort can't match.

### Sub-block 3 — the breakpoint

Heap sort is the right choice when (a) worst-case latency must be bounded *and* (b) memory is constrained. If only (a) matters, merge sort is fine. If only (b) matters, quick sort with random pivot is fine.

In production, heap sort almost never ships as the *primary* sort — it ships as the *fallback* inside Introsort. The fallback fires when quick sort's recursion depth exceeds `2 log n`, indicating a pathological input. At that point, heap sort runs to completion in guaranteed O(n log n), preventing the O(n²) collapse.

### Sub-block 4 — what wasn't actually a tradeoff

Pairing heaps and Fibonacci heaps were not real alternatives for the visualizer. Both are advanced heap variants with better amortized bounds for certain operations (decrease-key, merge), but they're irrelevant for a sort — heap sort only needs `insert` and `extract-max`, both of which are O(log n) on a standard binary heap. The advanced variants would add complexity for no improvement.

---

## Tech reference (industry pairing)

### Binary heap (implicit array representation)

- **Codebase uses:** `MinHeap` / `MaxHeap` classes at `src/utils/data_structures/BinaryHeap.ts` L23–L243, storing the heap as `this.heap: any[]`. Parent/child navigation via `Math.floor((child - 1) / 2)`, `2 * parent + 1`, `2 * parent + 2`.
- **Why it's here:** the data structure that makes heap sort O(n log n) and powers priority queues elsewhere in the codebase (`src/utils/data_structures/PriorityQueue` references it).
- **Leading today:** binary heap with implicit array storage — adoption-leading for priority queues, scheduling, and heap-backed graph algorithms, 2026.
- **Why it leads:** zero allocation per node (just array slots), O(log n) insert and extract, simple to reason about. The implicit array layout is also cache-friendlier than pointer-based heaps for small-to-medium sizes.
- **Runner-up:** pairing heap (innovation-leading for graph algorithms with frequent decrease-key, faster in practice than Fibonacci heap), d-ary heap (innovation-leading for k-way merge, more children per node = shallower tree).

### `@datastructures-js/priority-queue` (referenced but not used here)

- **Codebase uses:** imported in `src/utils/data_structures/PriorityQueue.ts` (per project context.md), not directly in heap-sort/page.tsx.
- **Why it's here:** when the codebase needs a priority queue with type safety and a tested implementation (e.g. for Dijkstra), it reaches for an external library rather than rolling its own.
- **Leading today:** `@datastructures-js/priority-queue` — adoption-leading for typed priority queues in TypeScript projects, 2026.
- **Why it leads:** zero dependencies, generic over T, supports `enqueue` / `dequeue` / `peek` / custom comparators, ~5 KB minified.
- **Runner-up:** `tinyqueue` (innovation-leading for raw throughput, ~1 KB but less feature-rich); rolling your own (zero dependencies but ~50 LOC and you own the bugs).

---

## Summary

Heap sort treats the array as a complete binary tree, builds it into a max-heap (root = largest) in O(n) using bottom-up heapify, then repeatedly swaps the root to the end of the unsorted region and re-heapifies — extracting one element per iteration in O(log n). In this codebase the canonical version lives in `src/utils/data_structures/BinaryHeap.ts` L395–L415 (`iterative_heap_sort`), while the visualizer page `src/app/sorting/heap-sort/page.tsx` L82–L106 uses a less-efficient external-heap variant (insert each value into a separate `MinHeap`, then drain via `getMin`) chosen for animation clarity. The constraint that made it the right call here is the combination of worst-case O(n log n) guarantee *and* in-place O(1) memory — the only common sort that delivers both. The cost is no stability and a constant-factor slowdown of ~2× vs quick sort on random data due to poor cache locality during heapify-down.

- Phase 1: build heap. Phase 2: extract `n` times. Both phases operate on the same underlying array.
- The heap is "implicit" — no node objects, no pointers. Parent/child relationships come from index arithmetic alone.
- In-place O(1) memory and worst-case O(n log n) — the only common sort with both properties.
- Not stable — heapify-down moves equal-key elements arbitrarily.
- The fallback algorithm inside Introsort (C++ `std::sort`): switches in when quick sort's recursion depth gets suspicious, preventing the O(n²) collapse.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about heap sort, they're testing whether you understand the heap data structure (not just the sort) and whether you can name where heap sort earns its place in production. A weak answer recites the complexity. A strong answer says "heap sort is selection sort with a smarter inner step, the heap is the data structure that does the heavy lifting, and it ships as the fallback in Introsort to prevent quick sort's O(n²) collapse."

### Likely questions

[mid] Q: Walk me through building a max-heap from `[3, 1, 4, 1, 5, 9]`.

A: Bottom-up heapify starting at index `floor(6/2) - 1 = 2`. At i = 2 (value 4), children are index 5 (value 9) only (index 6 is out of bounds). 4 < 9, swap → `[3, 1, 9, 1, 5, 4]`. At i = 1 (value 1), children are index 3 (value 1) and index 4 (value 5). Largest is 5 at index 4, swap → `[3, 5, 9, 1, 1, 4]`. At i = 0 (value 3), children are index 1 (value 5) and index 2 (value 9). Largest is 9 at index 2, swap → `[9, 5, 3, 1, 1, 4]`. Now check index 2's subtree: children are index 5 (value 4). 3 < 4, swap → `[9, 5, 4, 1, 1, 3]`. Heap property holds.

Diagram:
```
build trace for [3, 1, 4, 1, 5, 9]:

                3                          9
              /  \                       /  \
            1     4              ←→     5     4
           / \   /                     / \   /
          1   5 9                      1  1 3

  start                                after build (max-heap)
```

[senior] Q: Heap sort and merge sort are both O(n log n) worst case. When does heap sort win?

A: Memory. Heap sort is in-place (O(1) auxiliary); merge sort needs O(n) auxiliary buffer for the merge step. On memory-constrained systems (embedded, kernel code, JVM with tight heap budgets) heap sort beats merge sort. The flip side: heap sort isn't stable, and merge sort is — so if the workload depends on stability (multi-key sort, preserving original order within equal keys), heap sort is ruled out regardless of memory. The other place heap sort wins is as the *fallback* inside Introsort: when quick sort's recursion depth goes bad, heap sort guarantees you can still finish in O(n log n).

Diagram:
```
Which O(n log n) sort to pick:

┌────────────────────┬─────────────────────────────────────┐
│ Constraint         │ Pick                                │
├────────────────────┼─────────────────────────────────────┤
│ memory tight       │ heap sort (in-place)                │
│ stability required │ merge sort                          │
│ random data, in    │ quick sort (faster constant factor) │
│ memory             │                                     │
│ adversarial input  │ heap sort (no probabilistic asterisk│
│                    │ unlike quick sort with random pivot)│
│ data > RAM         │ external merge sort                 │
└────────────────────┴─────────────────────────────────────┘
```

[arch] Q: Why does C++'s `std::sort` switch to heap sort when quicksort gets bad?

A: Because quick sort's O(n²) worst case is real even with random pivots — an attacker (or unlucky input) can force pathological partitions, and you can't catch the worst case before it happens. Introsort solves this by tracking recursion depth. Quick sort on random input recurses ~`log₂ n` levels; if the depth ever exceeds `2 log n`, the implementation knows the partitions are going badly and switches to heap sort, which guarantees O(n log n) regardless of input shape. The combination gives you quick sort's typical-case speed plus heap sort's worst-case guarantee. Same shape in Rust's pdqsort with different heuristics. The principle: when an algorithm has a fast-but-unreliable variant and a slow-but-reliable one, build a runtime detector that switches between them.

Diagram:
```
Introsort decision flow:

           input
             │
             ▼
        quicksort partition
             │
             ▼
        ┌─ recursion depth check ──┐
        │ depth > 2 log n ?         │
        └─────────┬─────────────────┘
                  │
        ┌─────────┴──────────┐
        │ no                 │ yes
        ▼                    ▼
   continue quicksort   switch to heap sort
   (fast path)          (worst-case guarantee)
                              │
                              ▼
                        finish in O(n log n)
                        regardless of input
```

### The question candidates always dodge

Q: The codebase's `src/app/sorting/heap-sort/page.tsx` doesn't actually use in-place heap sort. It builds an external heap, drains it into an output array, then writes back to `bars`. Why?

A: For two honest reasons, neither of which is "we didn't know better." First, the canonical in-place version (in the same file at `BinaryHeap.ts` L395–L415) mutates the same array used for both the heap and the sorted suffix. Animating that is genuinely hard: at any moment, the array contains a partially-built heap on the left and a sorted suffix on the right, with the boundary shifting every iteration. There's no clean visual handle on "this is the heap region, this is the sorted region." The external-heap variant separates the two — you watch the heap build (via the recorded `swapSequence`), then you watch the output appear slot-by-slot. The animation is legible at the cost of algorithmic purity. Second, the page is in the `sorting/` directory but it's also a vehicle for teaching the heap data structure itself — having a separate `MinHeap` instance makes the heap visible as an object, not just an array region. The canonical in-place implementation exists in the codebase precisely because the team knows the difference; the visualizer just picks pedagogy over efficiency. If this were production code sorting a million records, you'd ship `iterative_heap_sort` from L395.

Diagram:
```
What we picked (external heap, visualizer)
┌────────────────────────────────────────────┐
│ insert n times → O(n log n) build          │
│   ← suboptimal build, optimal would be O(n)│
│ separate MinHeap instance → O(n) memory    │
│   ← suboptimal memory, in-place would be   │
│     O(1)                                   │
│ drains to output[], writes to bars         │
│   slot-by-slot                             │
│   ← extra pass for animation               │
└────────────────────────────────────────────┘

What the canonical version does (iterative_heap_sort)
┌────────────────────────────────────────────┐
│ bottom-up build in place → O(n)            │
│ extract-and-place in same array → O(n log  │
│   n) total                                 │
│ O(1) auxiliary memory                      │
└────────────────────────────────────────────┘

  ship the visualizer version for a teaching demo.
  ship the canonical version for any real sort workload.
  the codebase has both; the page uses the one that animates better.
```

### One-line anchors

- "Heap sort is selection sort with the O(n) find-min replaced by O(log n) heap extract."
- "Worst-case O(n log n), in-place, not stable — the only common sort with that exact tuple."
- "The heap is implicit: array slots are tree nodes, parent/child via index arithmetic, zero allocation per node."
- "Ships as the fallback in Introsort (C++ `std::sort`), preventing quick sort's O(n²) collapse on adversarial inputs."
- "Slower constant factor than quick sort on random data because heapify-down trashes cache locality."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw heap sort's two phases: bottom-up build (showing the order of nodes heapified), then extract-and-place (showing the boundary between heap region and sorted suffix shrinking each iteration).

Open the file. Check:
- Did you label Phase 1 as "build heap in O(n) bottom-up"?
- Did you label Phase 2 as "extract max n times, place at end of unsorted region"?
- Did you draw the implicit tree structure with parent/child via `2i+1`, `2i+2`?
- Did you show the heap-size boundary decreasing each extraction (the sorted suffix grows right to left)?

### Level 2 — Explain it out loud

Explain heap sort to a colleague who asked "why does std::sort use it?" No notes. Under 90 seconds.

Checkpoints:
- Did you reference `src/utils/data_structures/BinaryHeap.ts` L395–L415 (`iterative_heap_sort`) as the canonical implementation?
- Did you name the worst-case O(n log n) + in-place O(1) property?
- Did you explain it's the Introsort fallback that prevents quick sort's O(n²)?
- Did you mention the cache-locality cost (heapify-down jumps between exponentially spaced indices)?

### Level 3 — Apply it to a new scenario

You're implementing Dijkstra's algorithm and need to repeatedly find the next-closest unvisited node. The naïve implementation uses a linear scan — O(V²) total. You replace the scan with a `MinHeap` from `src/utils/data_structures/BinaryHeap.ts`. What's the new complexity, and which heap method maps to "find next-closest node"?

Write your answer in 3–5 sentences. Then verify by inspecting `MinHeap.getMin()` at `BinaryHeap.ts` L120–L132 — it returns the smallest element in O(log n) per call. With V calls and E `decrease-key` updates, Dijkstra becomes O((V + E) log V).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the visualizer at `src/app/sorting/heap-sort/page.tsx` uses an external-heap implementation (O(n) memory, O(n log n) build via repeated insert) instead of the canonical in-place version (O(1) memory, O(n) build via bottom-up heapify). If you were starting today and the visualizer needed to demonstrate the *fastest* heap sort, would you keep the external version or refactor to in-place? What animation primitives would you need to add?

Reference both `src/app/sorting/heap-sort/page.tsx` L82–L106 and `src/utils/data_structures/BinaryHeap.ts` L395–L415 to support your answer.

### Quick check — code reference test

Without opening any files:
- What two files hold the heap sort code in this codebase?
- What function in `BinaryHeap.ts` is the canonical (non-visualizer) implementation?
- What two phases does heap sort have?

Open and verify.

Pass: you named `src/app/sorting/heap-sort/page.tsx` + `src/utils/data_structures/BinaryHeap.ts`, the function `iterative_heap_sort`, and Phases "build heap" + "extract n times."
Fail on canonical function name: re-read `BinaryHeap.ts` L395–L415 — the function is `iterative_heap_sort`, not `heap_sort` (the local-only helper at L252).
