# Binary heap

**Industry name(s):** Binary heap, min-heap, max-heap, array-based heap
**Type:** Industry standard · Language-agnostic

> A complete binary tree where each parent satisfies a heap property (smaller than both children for a min-heap, larger for a max-heap), stored as a flat array with parent-child relationships computed by index math. The `/trees/binary-heap` visualizer builds one, records the swap sequence, and replays it as animation.

**See also:** → [10-priority-queue.md](./10-priority-queue.md) · → [08-binary-search-tree.md](./08-binary-search-tree.md)

---

## Why care

You have an array of bars on screen rendering numbers — `[77, 15, 91, 21, 6, 46]` — and the user keeps asking "what's the smallest one right now?" Naive: every time they ask, you `Math.min(...arr)` which scans every element. O(n) per question. Now they want to remove the smallest, then ask again: you `arr.splice(arr.indexOf(min), 1)` — another O(n) scan plus O(n) shift. Six questions across the same six-item array, you've done thirty-six operations.

That repeated-min question is what a **binary heap** answers. Not a balanced search tree — a heap doesn't sort the whole array. It maintains exactly one guarantee: the smallest (or largest) element is always at the root. Reading the smallest is O(1). Removing it costs O(log n) — the cost of repairing the tree, not scanning it.

**Why you need to answer that question at all:** because every priority-driven algorithm in the codebase routes through this structure. Dijkstra's shortest path (under `/graphs/finding-shortest-path`) repeatedly extracts the lowest-priority unvisited node — a heap operation. Heap-sort (`src/utils/data_structures/BinaryHeap.ts` L395–L415) is exactly "insert all values, extract all values" — n inserts at O(log n) plus n extracts at O(log n) gives O(n log n) sort. The `BinaryVisualizer` rendering the heap reads from an array; the `CompleteBinaryTree` class (L296–L321) converts that array back to tree shape for display. The array IS the tree.

Without a heap:
- Find min in `[77, 15, 91, 21, 6, 46]` → scan all six values
- Remove min → find it (O(n)), then `splice` (O(n) shift)
- Repeat n times → O(n²) total

With a min-heap:
- Find min → read `heap[0]` (O(1))
- Remove min → swap with last, pop, sift down (O(log n))
- Repeat n times → O(n log n) total

A binary heap is what a sorted list would be if you only cared about the smallest item and were willing to leave everything else loosely arranged.

---

## How it works

The data structure shape. A binary heap is a **complete** binary tree — every level is full except possibly the last, which fills left to right. That completeness is the load-bearing constraint: it lets you store the whole tree in a flat array with no holes, where parent-child relationships are computed arithmetic, not pointer dereferences.

The index math (zero-indexed, used in `BinaryHeap.ts`):

```
For a node at index i:
  parent index      = floor((i - 1) / 2)
  left child index  = 2*i + 1
  right child index = 2*i + 2
```

The codebase's `MinHeap.heapifyUp` (L50–L63) computes parent index as `Math.floor((child - 1) / 2)`. `heapifyDown` (L86–L112) computes left as `(2 * parent) + 1` and right as `(2 * parent) + 2`. No pointers. The array's index space carries the tree topology.

For example, the sample data `[77, 15, 91, 21, 6, 46]` arrays out as:

```
Indices:    0   1   2   3   4   5
Values:   [77, 15, 91, 21,  6, 46]

As a tree (i, child relationships from the formulas):
                 i=0
                  77
               ╱     ╲
            i=1       i=2
             15        91
            ╱  ╲      ╱
         i=3  i=4   i=5
          21    6   46

Children of i=0 are at i=1 and i=2.
Children of i=1 are at i=3 and i=4.
Children of i=2 are at i=5 (no right child).
```

This isn't a heap yet — it's just the array drawn as a tree. The heap property says every parent must be ≤ its children (for a min-heap). 77 > 15, so the property is violated at the root. `heapifyDown` from the root would swap to fix it.

### Bridge from frontend

A heap is what you'd build if you wanted to keep a list partially sorted with the cheapest possible mutation cost. The frontend analogue: imagine you render a list of bars sorted by height and you want to highlight the shortest. You don't actually need the whole list sorted — you only need the shortest at the top. A heap is the minimum structure that maintains that one guarantee.

The array-as-tree trick has a frontend parallel too. When you render a list of nested components with `.map()`, React uses the index path (`[0, 2, 1]` = first child, third grandchild, second great-grandchild) to identify nodes — same idea as heap index math. The tree topology lives in the index, not in explicit parent pointers.

### Insert — append, then heapify up

```
insert(value):
  heap.push(value)            # add to the end of the array
  heapifyUp()                 # sift the new value up toward the root
                              # until heap property holds
```

`heapifyUp` (L50–L63) walks from the last index toward the root, swapping with the parent any time the new value is smaller (min-heap) or larger (max-heap) than its parent:

```
heapifyUp:
  child = heap.length - 1
  parent = floor((child - 1) / 2)

  while child > 0 AND heap[child] < heap[parent]:    # min-heap rule
    swap(parent, child, heap)
    record swap in swapSequence    # for visualizer replay
    child = parent
    parent = floor((child - 1) / 2)
```

Execution trace — start with `[6, 15, 46, 77, 21, 91]` (already a valid min-heap), insert `3`:

```
After push:  [6, 15, 46, 77, 21, 91, 3]
             i=0  i=1 i=2  i=3 i=4 i=5 i=6

Iteration 1: child=6, parent=floor(5/2)=2
             heap[6]=3 < heap[2]=46 → swap
             array: [6, 15, 3, 77, 21, 91, 46]
             swapSequence.push([2, 6])
             child=2, parent=floor(1/2)=0

Iteration 2: child=2, parent=0
             heap[2]=3 < heap[0]=6 → swap
             array: [3, 15, 6, 77, 21, 91, 46]
             swapSequence.push([0, 2])
             child=0 → loop exits (child > 0 is false)

Final heap: [3, 15, 6, 77, 21, 91, 46]

As a tree:
                 3
               ╱   ╲
              15    6
             ╱ ╲   ╱ ╲
            77 21 91 46
```

The new value (3) bubbled up through two swaps. Total swaps: O(log n) — at most the height of the tree.

Complexity: O(log n) time · O(1) space.

### Extract — swap-with-last, pop, heapify down

`getMin` (L120–L132) — the "extract" operation — does the symmetric thing:

```
getMin():
  swap(0, heap.length - 1, heap)   # move root to the end
  removed = heap.pop()             # remove the last element (the old root)
  heapifyDown()                    # repair the heap from the new root
  return removed
```

Why this shape: you can't just `heap.shift()` because that shifts every other element down — O(n). Instead, swap the root with the last element, pop the last element (now the old root) in O(1), and the only invariant left to repair is "the new root might be larger than its children." `heapifyDown` fixes that by walking down through smaller-child swaps.

```
heapifyDown:
  parent = 0
  leftChild = 2*parent + 1

  while leftChild < heap.length:
    smallerChild = leftChild
    rightChild = 2*parent + 2

    if rightChild < heap.length AND heap[rightChild] < heap[leftChild]:
      smallerChild = rightChild

    if heap[parent] > heap[smallerChild]:
      swap(parent, smallerChild, heap)
      record swap in getMinSwapSequence
      parent = smallerChild
      leftChild = 2*parent + 1
    else:
      break    # heap property holds; stop
```

Execution trace — starting from `[3, 15, 6, 77, 21, 91, 46]`, call `getMin()`:

```
Step 1 — swap(0, 6):   [46, 15, 6, 77, 21, 91, 3]
Step 2 — pop:          [46, 15, 6, 77, 21, 91]
                       removed = 3
Step 3 — heapifyDown from parent=0:

Iteration 1: parent=0 (value=46)
             leftChild=1 (value=15), rightChild=2 (value=6)
             6 < 15 → smallerChild = 2 (rightChild)
             46 > 6 → swap(0, 2)
             array: [6, 15, 46, 77, 21, 91]
             parent=2, leftChild=5

Iteration 2: parent=2 (value=46)
             leftChild=5 (value=91), rightChild=6 (out of bounds)
             smallerChild = 5
             46 < 91 → heap property holds → break

Final heap: [6, 15, 46, 77, 21, 91]
Returned:   3
```

Complexity: O(log n) time · O(1) space.

### MaxHeap is just the comparison flipped

`MaxHeap` (L136–L243) is structurally identical to `MinHeap`. The only differences:
- `heapifyUp` compares `heap[child] > heap[parent]` instead of `<` (L167)
- `heapifyDown` picks the larger child instead of the smaller (L209–L211)
- The public method is `getMax` instead of `getMin`

Same complexities, same array layout, same parent-child index math. The two classes are kept side by side rather than parameterized over a comparator because the codebase is a study notebook — having two explicit classes makes the comparison-flip visible.

### The swap sequence trick — replaying mutations as animation

The visualizer at `src/app/trees/binary-heap/page.tsx` doesn't render the heap step-by-step as it's built. The heap class builds itself synchronously and records every swap into `this.swapSequence` (and `this.getMinSwapSequence` for extracts). The page then *replays* the sequence with `delayLoop` between each swap:

```
satisfyHeapAndAnimateInUI (page.tsx L40–L57):
  for each [index1, index2] in seq:
    await delayLoop(1000)
    highlight both bars at index1 and index2
    await delayLoop(2000)
    swap the values in the React state array
  clear highlights
```

This decoupling is the cleanest design pattern in the codebase. The data structure stays synchronous and pure; the page treats the swap log as a script to animate. If you wanted to add undo, you'd reverse-iterate the log. If you wanted to skip ahead, you'd splice the log. The animation is data, not control flow.

### Array vs explicit tree-with-pointers

The codebase ships both. `MinHeap` and `MaxHeap` use the array form. `CompleteBinaryTree` (L296–L321) takes a heap array and reconstructs an explicit tree with `Node { key, left, right }` pointers, so `BinaryVisualizer` can render boxes connected by SVG lines instead of bars. Building the tree is `buildLevelOrder(arr, i)` (L307–L321):

```
buildLevelOrder(arr, i):
  if i >= arr.length: return null
  root = new Node(arr[i])
  root.left  = buildLevelOrder(arr, 2*i + 1)
  root.right = buildLevelOrder(arr, 2*i + 2)
  return root
```

Same index math, used in reverse. The array is the source of truth; the explicit tree is a render-time projection.

### Brute force vs optimal — finding the minimum repeatedly

── Brute force ──────────────────────────────────

Pseudocode (linear scan each time):

```
function extractMin(arr):
  minIndex = 0
  for i = 1 to arr.length - 1:
    if arr[i] < arr[minIndex]:
      minIndex = i
  min = arr[minIndex]
  arr.splice(minIndex, 1)    # O(n) shift
  return min

# Heap-sort by repeated extractMin:
output = []
while arr.length > 0:
  output.push(extractMin(arr))
```

Execution trace — sort `[77, 15, 91, 21, 6, 46]`:

```
Pass 1: scan all 6 → min=6 at index 4. splice. arr=[77,15,91,21,46]. ops=6+5=11.
Pass 2: scan all 5 → min=15 at index 1. splice. arr=[77,91,21,46]. ops=5+4=9.
Pass 3: scan all 4 → min=21 at index 2. splice. arr=[77,91,46]. ops=4+3=7.
Pass 4: scan all 3 → min=46 at index 2. splice. arr=[77,91]. ops=3+2=5.
Pass 5: scan all 2 → min=77 at index 0. splice. arr=[91]. ops=2+1=3.
Pass 6: scan all 1 → min=91. ops=1.

Total: ~36 operations for 6 items.
```

Complexity: O(n²) time · O(1) extra space (besides the output).

What goes wrong at scale: with 10,000 items, repeated linear-scan extraction runs ~100 million operations. With 100,000, it's 10 billion — that's the difference between "instant" and "tab frozen for a minute."

── Optimal ──────────────────────────────────────

The insight: don't scan to find the min every time. Maintain a structure where the min is always at a known position (index 0), and pay a small log-time repair cost when you remove it.

Pseudocode (heap-sort via MinHeap):

```
heap = new MinHeap()
for each value in arr:
  heap.insert(value)         # O(log n) per insert

output = []
while heap.size > 0:
  output.push(heap.getMin()) # O(log n) per extract
```

Execution trace — same input `[77, 15, 91, 21, 6, 46]`:

```
Build phase (6 inserts):
  insert 77 → heap: [77]
  insert 15 → push: [77,15]    heapifyUp: 15 < 77 → swap → [15,77]
  insert 91 → push: [15,77,91] heapifyUp: 91 < 15? no → no swap
  insert 21 → push: [15,77,91,21]
                                heapifyUp: parent of 3 is 1; 21<77 → swap
                                  → [15,21,91,77]
                                  parent of 1 is 0; 21<15? no → done
  insert  6 → push: [15,21,91,77,6]
                                heapifyUp: parent of 4 is 1; 6<21 → swap
                                  → [15,6,91,77,21]
                                  parent of 1 is 0; 6<15 → swap
                                  → [6,15,91,77,21]
                                  parent of 0 → done
  insert 46 → push: [6,15,91,77,21,46]
                                heapifyUp: parent of 5 is 2; 46<91 → swap
                                  → [6,15,46,77,21,91]
                                  parent of 2 is 0; 46<6? no → done

Final heap: [6, 15, 46, 77, 21, 91]

Extract phase (6 getMin calls):
  getMin → 6.   heap → [15, 21, 46, 77, 91]
  getMin → 15.  heap → [21, 77, 46, 91]
  getMin → 21.  heap → [46, 77, 91]
  getMin → 46.  heap → [77, 91]
  getMin → 77.  heap → [91]
  getMin → 91.  heap → []

Output: [6, 15, 21, 46, 77, 91]
```

Total work: 6 inserts × O(log 6) + 6 extracts × O(log 6) ≈ 6 × 2.6 × 2 ≈ ~31 operations of sift work, vs the brute force's ~36 scan operations. The gap looks small at n=6; at n=10,000 the heap does ~140k operations and the brute force does ~100M.

Complexity: O(n log n) time · O(n) space (the heap itself).

Why it's faster: every extract pays O(log n) instead of O(n). Across n extracts, that's O(n log n) instead of O(n²). For n=10,000: 140,000 ops vs 100,000,000 ops — ~700× faster.

── Comparison ───────────────────────────────────

```
┌─────────────────┬────────────────┬──────────────────┐
│                 │ Linear scan    │ Binary heap      │
├─────────────────┼────────────────┼──────────────────┤
│ Find min        │ O(n)           │ O(1)             │
│ Extract min     │ O(n)           │ O(log n)         │
│ Insert          │ O(1) push      │ O(log n)         │
│ Build from arr  │ O(0) — exists  │ O(n log n) or    │
│                 │                │ O(n) heapify     │
│ Sort n items    │ O(n²)          │ O(n log n)       │
│ At 1k items     │ ~1M ops        │ ~10k ops         │
│ At 100k items   │ ~10B ops       │ ~1.7M ops        │
│ Space overhead  │ none           │ none (in-place)  │
│ Memory layout   │ flat array     │ flat array (!)   │
└─────────────────┴────────────────┴──────────────────┘
```

When brute force is fine: when n is tiny (under ~20), when you do exactly one min-find (no repeated extraction), or when the array is mutable and you can sort it in place once and read sequentially. The heap earns its place when extractions are repeated and interleaved with inserts — exactly the access pattern of Dijkstra, A*, scheduling, and event queues.

---

## Binary heap — diagram

```
ARRAY  layout (the source of truth):
  index:    0    1    2    3    4    5
  value:  [  6 , 15 , 46 , 77 , 21 , 91 ]

TREE projection (built by CompleteBinaryTree from index math):
  parent(i) = floor((i-1) / 2)
  left(i)   = 2i + 1
  right(i)  = 2i + 2

                       index=0
                          6                ← root, smallest
                       ╱     ╲
                  index=1     index=2
                     15          46
                    ╱  ╲         ╱
              index=3 index=4 index=5
                 77     21      91

Heap property at every node:
  min-heap → parent.key ≤ both children.key
  max-heap → parent.key ≥ both children.key

OPERATIONS — both touch O(log n) nodes:

  Insert(value):
    1. push to end of array         (length+1)
    2. heapifyUp: swap with parent  ← sift toward root
       until heap property holds

  Extract(root):
    1. swap heap[0] with heap[last] (move root to end)
    2. pop last element             (the old root)
    3. heapifyDown: swap with       ← sift toward leaves
       smaller (or larger) child
       until heap property holds

Every swap during build or extract is recorded in swapSequence
[ [i,j], [k,l], ... ] and replayed at delayLoop intervals by
the page (binary-heap/page.tsx L40–L57) to animate the bars.
```

---

## In this codebase

**File:** `src/utils/data_structures/BinaryHeap.ts`
**Classes:** `MinHeap`, `MaxHeap`, `CompleteBinaryTree`
**Used by:** `src/app/trees/binary-heap/page.tsx`, `src/utils/data_structures/PriorityQueue.ts`, indirectly by Dijkstra in `Graph2.ts`.

Key line ranges inside `BinaryHeap.ts`:

- Module-level `swap` helper: L15–L21
- `MinHeap` class: L23–L133
  - `heapifyUp`: L50–L63
  - `insert`: L70–L74
  - `heapifyDown`: L86–L112
  - `getMin`: L120–L132
- `MaxHeap` class: L136–L243
  - `heapifyUp`: L161–L174
  - `insert`: L181–L185
  - `heapifyDown`: L197–L223
  - `getMax`: L231–L242
- `heap_sort` (uses MinHeap, repeated getMin): L252–L279
- `CompleteBinaryTree` (array → tree for rendering): L296–L321
- `iterative_heapify`: L360–L386
- `iterative_heap_sort`: L395–L415 (in-place, no MinHeap object)
- `recursive_heapify` / `recursive_heap_sort`: L435–L474

The page (`src/app/trees/binary-heap/page.tsx`):

- `enableHeap` L78–L90: instantiates MinHeap or MaxHeap, inserts the sample data, calls `satisfyHeapAndAnimateInUI`
- `satisfyHeapAndAnimateInUI` L40–L57: walks `swapSequence` and animates each swap with `delayLoop`
- `insertHeapNode` L100–L130: insert via the heap class, then replay the new swaps
- `extractHeap` L137–L164: pops the root, updates state — animation TODO at L162

The decoupling (record-then-replay) lives in the `swapSequence` arrays at L26 / L32 / L139. The heap is otherwise unaware of the visualizer.

---

## Elaborate

### Where this pattern comes from

J. W. J. Williams introduced the binary heap in 1964 as the backing structure for heap-sort — an in-place O(n log n) sort with O(1) extra space. The array representation was the load-bearing trick: by storing a complete tree as a flat array with parent-child relationships in the index, you got tree operations without pointers. Pointers were expensive in 1964 because memory was small and indirection was a cache problem even before "cache" was the right word. The same property — locality, no pointer chasing — is why modern priority queues still ship as array-backed heaps in 2026.

### The deeper principle

Implicit structure over explicit pointers. The heap's tree doesn't exist as objects; it exists as a math relationship between array indices. The lesson generalizes: any time the structure of your data is regular enough (complete trees, fixed-arity grids, contiguous segments), you can encode topology in the index and skip the pointer overhead entirely. This is the same idea that makes flat arrays beat linked lists for almost every real workload, and the same idea behind cache-friendly data layouts in game engines.

### Where this breaks down

The array representation requires completeness — every level full except the last. A general binary tree (like a BST under random inserts) doesn't have that property, so you can't store it as a flat array without wasting slots. The heap's win is also exactly its limit: it gives you the min OR the max at the root, not both. If you need both (a double-ended priority queue), reach for a min-max heap or an interval heap.

It also breaks down when "priority" isn't a fixed scalar — when you need to update an item's priority after it's in the heap, the heap has no idea where the item is. You need an auxiliary lookup (which is exactly what `PriorityQueue.ts` adds with `valueIndicesLookup`).

### What to explore next

- Priority queue with updatePriority → see [10-priority-queue.md](./10-priority-queue.md); adds a lookup dictionary so Dijkstra can decrease-key in O(log n)
- Fibonacci heap → amortized O(1) decrease-key; theoretical Dijkstra win, but the constant factors are large enough that array-backed binary heaps usually win in practice
- d-ary heaps → branching factor d instead of 2; shallower trees, fewer comparisons per level, used in cache-sensitive code

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬────────────────────────┬────────────────────────┐
│ Cost dimension   │ Array-backed heap      │ Tree-with-pointers     │
│                  │ (this codebase)        │ (explicit Node)        │
├──────────────────┼────────────────────────┼────────────────────────┤
│ Insert           │ O(log n), one push     │ O(log n), node alloc   │
│ Extract          │ O(log n), swap+pop     │ O(log n), pointer fix  │
│ Memory per node  │ 8 bytes (number)       │ ~24 bytes (3 pointers) │
│ Cache locality   │ excellent (contiguous) │ poor (heap allocs)     │
│ Code complexity  │ index math only        │ pointer rewiring       │
│ Visualizable?    │ needs index→tree pass  │ direct render          │
│ Heapify-build    │ O(n) (bottom-up)       │ O(n log n)             │
│ updatePriority   │ no — needs aux lookup  │ no — needs aux lookup  │
└──────────────────┴────────────────────────┴────────────────────────┘
```

### Sub-block 1 — what we gave up

**Direct visualization.** The heap is an array, not a tree. To render boxes-and-lines, the codebase ships a separate `CompleteBinaryTree` class (L296–L321) that reconstructs an explicit tree from the heap array. That's ~25 lines of code purely for rendering. A tree-with-pointers heap wouldn't need this projection step.

**The "update priority" gap.** The heap has no idea where an arbitrary value lives in the array. To find value `v`, you'd `arr.indexOf(v)` — O(n). That's exactly the gap `PriorityQueue.ts` fills with `valueIndicesLookup: { [value]: heapIndex }` (L38, L44). The bare heap doesn't support `decrease-key`, which is the operation Dijkstra needs.

**Discoverability for the reader.** The fact that `arr[2*i+1]` is the left child of `arr[i]` is not obvious. A new contributor opening `heapifyDown` reads index math and has to mentally project it to a tree. A tree-with-pointers version reads `node.left.value` and the topology is in the syntax.

### Sub-block 2 — what the alternative would have cost

If the codebase used a tree-with-pointers heap, every node would be a heap allocation (V8 allocates objects on the heap memory, not contiguously). For a heap of 100k integers, that's 100k separate allocations of ~24 bytes each, scattered across memory. The array form is one contiguous allocation of 800KB — one cache-friendly block. The difference shows up as a 5-10× slowdown on `heapifyDown` because each level descent is a cache miss in the pointer form vs a cache hit in the array form.

The pointer form would also break the swap-sequence-as-data trick. The codebase records `[parent_index, child_index]` pairs into `swapSequence`. With pointers, you'd record `[parentNodeRef, childNodeRef]` — but React state doesn't render object identities, it renders array values. The visualizer would need a separate id-to-position map to know where to highlight. The array form keeps the animation contract trivial: index in, position out.

### Sub-block 3 — the breakpoint

Fine as a pure binary heap until the workload needs to update an item's priority after it's been inserted. At that breakpoint, wrap the heap in a priority queue with a value-to-index lookup (which is what `PriorityQueue.ts` does at L38–L44). The bare heap is the building block; the priority queue is the production-ready surface. Use the heap directly when you only insert and extract-root — heap-sort, top-k selection, streaming median. Use the priority queue wrapper when you need to mutate priorities — Dijkstra, A*, event loops with deadlines.

### Sub-block 4 — what wasn't actually a tradeoff

Using a library priority queue (`@datastructures-js/priority-queue` is listed in `package.json`) was not a real alternative for the *visualization* side. The library's heap mutates the internal array but doesn't expose a swap log, so there'd be no way to animate the heapify steps. The codebase needed the heap class to record every swap into a public field for the page to replay. A library replacement would have meant wrapping the library with a swap-recording proxy — more code, more indirection, and the heap class itself is only ~110 lines.

---

## Tech reference (industry pairing)

### Array-backed heap (no library)

- **Codebase uses:** `MinHeap` / `MaxHeap` hand-rolled in `BinaryHeap.ts`. Backed by a plain `any[]` plus a `swapSequence: number[][]` log.
- **Why it's here:** the swap log is the contract the visualizer animates against. A library heap would mutate internally and leave no replay surface.
- **Leading today:** array-backed binary heap — adoption-leading, 2026. Every standard library priority queue uses this structure under the hood.
- **Why it leads:** cache-friendly contiguous memory; parent-child relationships are integer math instead of pointer chasing; in-place sort via the same array.
- **Runner-up:** d-ary heap (branching factor 4 or 8 instead of 2) — innovation-leading for cache-bound priority queue workloads; shallower trees mean fewer cache misses on heapify-down.

### `@datastructures-js/priority-queue` (listed but not directly imported in pages)

- **Codebase uses:** declared in `package.json` but not imported into any page or visualizer. Likely a residue from an earlier glue implementation; the hand-rolled `PriorityQueue.ts` replaces it.
- **Why it's here:** historical. The hand-rolled version exposes `valueIndicesLookup` and a public heap array, both of which a library would hide.
- **Leading today:** library-backed priority queue — adoption-leading for production code, 2026.
- **Why it leads:** battle-tested, generic, drop-in. Most teams don't need to see the swap log; they just need a `PriorityQueue` with `enqueue` / `dequeue` / `peek`.
- **Runner-up:** `heap-js` — innovation-trailing now but still maintained; offers iterator semantics and a `heapify` static method.

### `CompleteBinaryTree` (array → tree projection for rendering)

- **Codebase uses:** `CompleteBinaryTree` class in `BinaryHeap.ts` L296–L321, instantiated in `binary-heap/page.tsx` L28 as `new CompleteBinaryTree(sampleData, 0)`.
- **Why it's here:** `BinaryVisualizer` renders an explicit tree of `Node { key, left, right }`. The heap is an array. This class is the index-math-to-pointer projection.
- **Leading today:** ad-hoc projection (this codebase's approach) for visualization-only — adoption-leading, 2026.
- **Why it leads:** no library exists for "render an array as a binary tree" because it's a one-screen helper; every visualization library hand-rolls it.
- **Runner-up:** D3 hierarchy (`d3.hierarchy(...)` + `d3.tree()`) — adoption-leading when the visualization needs to compute layout (node positions, link paths). Overkill for static rendering against a known shape.

---

## Summary

A binary heap is the data structure that turns "give me the smallest (or largest) item, repeatedly" from an O(n²) loop into an O(n log n) loop, by maintaining one invariant — root is the extremum — and storing the whole complete-tree in a flat array with parent-child relationships computed by index math. In this codebase, `BinaryHeap.ts` ships `MinHeap` and `MaxHeap` as two near-identical classes; each records every swap into a public `swapSequence` array, which the `/trees/binary-heap` page replays with `delayLoop` to animate the heapify steps. The constraint that forced the array form was the visualizer contract: the page needs a deterministic swap log to animate against. The cost paid is that a separate `CompleteBinaryTree` class has to reconstruct an explicit tree from the array for the SVG renderer, and the bare heap can't update priorities — that gap is filled by `PriorityQueue.ts`.

Key points to remember:

- A binary heap is a complete binary tree stored as an array; parent of `i` is `floor((i-1)/2)`, children are `2i+1` and `2i+2`.
- Heap property: root is the smallest (min-heap) or largest (max-heap); the same holds recursively at every subtree.
- Insert: append, then heapifyUp — at most O(log n) swaps.
- Extract: swap root with last, pop, heapifyDown — at most O(log n) swaps.
- The bare heap doesn't know where an arbitrary value lives — that's the gap `PriorityQueue.ts` fills with `valueIndicesLookup`.
- The swap sequence (`heap.swapSequence`) is recorded at build time and replayed at render time; the heap class itself never awaits anything.
- Heap-sort is "insert all, extract all" — O(n log n), in-place if you do it via `iterative_heap_sort` (L395–L415) instead of via the MinHeap class.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about heaps, they're not asking for the definition. They're asking: do you know why the array representation is the standard one, do you know which problems a heap is the right answer to (vs a BST, vs a sorted array, vs a hash map), and do you know its blind spot (the inability to find arbitrary items)?

### Likely questions

[mid] Q: Walk me through how you'd extract the minimum from a min-heap.

A: Three steps. Swap the root (`heap[0]`) with the last element (`heap[heap.length - 1]`), then `pop` the array to remove the old root in O(1). Now the new root might violate the heap property, so call `heapifyDown` from index 0: compare the root against its smaller child, swap if the child is smaller, and recurse on the swapped position until the property holds or you reach a leaf. The whole operation touches at most `log n` levels.

Diagram:
```
Before extract:  [3, 15, 6, 77, 21, 91, 46]   root=3

Step 1 — swap(0, last):
                 [46, 15, 6, 77, 21, 91, 3]

Step 2 — pop():
                 [46, 15, 6, 77, 21, 91]      removed=3

Step 3 — heapifyDown from idx=0:
   46 vs children 15 and 6 → smaller is 6 → swap(0, 2)
                 [6, 15, 46, 77, 21, 91]
   46 vs children 91 (no right) → 46 < 91, stop.

Result: [6, 15, 46, 77, 21, 91], returned 3.
```

[senior] Q: Why did you store the heap as an array instead of as explicit tree nodes?

A: Two reasons. First, cache locality — a heap of 100k integers is one contiguous 800KB allocation, and every `heapifyDown` descent reads adjacent memory. The pointer form scatters nodes across the heap memory and every descent is a potential cache miss. Second, the swap-sequence-as-data trick. The visualizer animates by replaying `[parent_index, child_index]` pairs; with pointers, those pairs would be object references that React state can't render directly. The array form makes the animation contract trivial.

Diagram:
```
                  │ Array-backed   │ Tree-with-ptrs │
──────────────────┼────────────────┼─────────────────
 100k integers    │ 800KB contig.  │ ~2.4MB scattered
 Cache misses on  │ near zero      │ one per level
   heapifyDown    │                │ (log n misses)
 Swap log shape   │ [i, j] pairs   │ [nodeA, nodeB]
                  │ — render-ready │ — needs id map
 Implementation   │ ~110 lines     │ ~150 lines
```

[arch] Q: A teammate wants to use a heap to power a queue of pending notifications, sorted by send-at time. They also need to cancel notifications by ID. Will your heap work for that?

A: Not as-is. The bare heap can find the earliest notification (root, O(1)) and remove it (extractMin, O(log n)), but it has no way to find a notification by ID. `arr.indexOf` is O(n) and breaks the whole win. They need to wrap the heap in a priority queue that maintains a `valueIndicesLookup: { [notificationId]: heapIndex }` dictionary — that's exactly what `PriorityQueue.ts` does at L38–L44. With the lookup, cancellation by ID becomes O(log n) instead of O(n).

Diagram:
```
What breaks first as the access pattern broadens:

  Pure heap (BinaryHeap.ts):
    insert        ✓ O(log n)
    extract-min   ✓ O(log n)
    find by id    ✗ O(n) — heap has no lookup
    cancel by id  ✗ O(n) + O(log n)

  Heap + valueIndicesLookup (PriorityQueue.ts):
    insert            ✓ O(log n)
    extract-min       ✓ O(log n)
    find by id        ✓ O(1)
    cancel by id      ✓ O(log n)
    updatePriority    ✓ O(log n)  ← Dijkstra needs this
```

### The question candidates always dodge

Q: Heap operations are O(log n). BST operations are also O(log n). Why use a heap instead of a BST?

A: Different operations are cheap. A heap gives O(1) read of the extremum and O(log n) extract of the extremum. A BST gives O(log n) search by any key and O(n) sorted iteration. If your workload is "give me the smallest, repeatedly" — a priority queue, Dijkstra, top-k — the heap is strictly better because the read is free. If your workload is "find this specific key" or "iterate in sorted order" — the BST wins because the heap can't do either cheaply (finding a specific value in a heap is O(n)). The codebase uses a heap for the binary-heap visualizer because the only operation is extract-root, and uses a BST for the binary-search-tree visualizer because the operations are search/successor/inorder — different shapes, different structures.

Diagram:
```
Same complexity tier, different access patterns:

                 │ Heap (MinHeap) │ BST            │
─────────────────┼────────────────┼─────────────────
 Read extremum   │ O(1)           │ O(log n) descent
 Extract extreme │ O(log n)       │ O(log n)
 Search key=v    │ O(n) — no idx  │ O(log n)
 Sorted iterate  │ O(n log n)     │ O(n) — inorder
                 │ (extract all)  │
 Successor of v  │ O(n)           │ O(log n)
 Insert          │ O(log n)       │ O(log n)

Pick by which row matches your hot path.
```

### One-line anchors

- "A heap gives you O(1) read of the extremum — that's the whole point. If you don't need that, you don't need a heap."
- "The array representation is the trick; parent-child relationships live in the index, not in pointers."
- "Heap-sort is just insert-all then extract-all. The 'sort' is two heap-property repairs."
- "The bare heap can't find arbitrary items — that's why Dijkstra needs the priority queue wrapper with a value-to-index lookup."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On paper, draw the array `[6, 15, 46, 77, 21, 91]` as a binary heap tree. Label every index. Verify the heap property at every node.

Open the file. Compare against the diagram above.

Pass: your tree matches structure and indices, and every parent is ≤ both children.
Fail: re-read the index math section, then try again with a smaller array first (`[3, 5, 8]`).

### Level 2 — Explain it out loud

Explain `heapifyUp` to a colleague who's seen heaps explained as trees but not as arrays. No notes. Under 90 seconds.

Checkpoints:
- Did you give the parent-index formula (`floor((i-1)/2)`)?
- Did you explain the loop terminates when either you reach index 0 OR the heap property holds?
- Did you reference `BinaryHeap.ts` L50–L63?

### Level 3 — Apply it to a new scenario

You have a stream of incoming events, each with a timestamp. You need to always know the *next* event to fire, and events can arrive out of order (a new event might need to fire before an event already in the queue). One million events expected per day.

Walk through whether a bare MinHeap is sufficient. Then open `PriorityQueue.ts` L34–L65 and check whether the operations you need are already covered by the priority queue wrapper.

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the codebase ships two separate classes (`MinHeap` and `MaxHeap`) instead of one parameterized class.

"If you were refactoring `BinaryHeap.ts` today, would you collapse `MinHeap` and `MaxHeap` into one parameterized class with a comparator? Why or why not? What would the comparator parameter cost in readability vs what the duplication costs in maintenance?"

Reference `BinaryHeap.ts` L23–L133 (`MinHeap`) and L136–L243 (`MaxHeap`) and name the lines that would collapse.

### Quick check — code reference test

Without opening any files:
- What file does `MinHeap` live in?
- What field records each swap during heapifyUp?
- What method on `MinHeap` is the extract operation?

Open the file and verify.

Pass: you named the file (`BinaryHeap.ts`), the field (`swapSequence`), and the method (`getMin`).
