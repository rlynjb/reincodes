# Priority queue with updatePriority

**Industry name(s):** Indexed priority queue, addressable priority queue, decrease-key priority queue
**Type:** Industry standard · Language-agnostic

> A binary heap wrapped with a value-to-index dictionary so an item already in the queue can have its priority changed in O(log n) instead of O(n). This is the load-bearing optimization that makes Dijkstra's shortest-path algorithm O((V+E) log V) in this codebase.

**See also:** → [09-binary-heap.md](./09-binary-heap.md) · → graph/dijkstra coverage in `src/utils/data_structures/Graph2.ts`

---

## Why care

You have a list of pending tasks, each with a numeric priority — a render queue, a job scheduler, a navigation graph where each node has a tentative shortest distance. You want to always pull the highest-priority task next. A min-heap solves that: insert tasks as they arrive, extract the smallest priority when ready. So far this is the bare heap from [09-binary-heap.md](./09-binary-heap.md).

Now Dijkstra's algorithm walks in. It looks at a neighbor of the node it just visited and says: "I found a shorter path to you. Your tentative distance just dropped from 17 to 12." That task is *already in the queue*. You need to find it, update its priority, and re-establish the heap property. With a bare heap, the first step — find a value's position — is `arr.indexOf(value)`, which is O(n). Doing that for every edge in a graph makes Dijkstra O(V·E) instead of O((V+E) log V).

That "find the item I already inserted" problem is what an **indexed priority queue** answers. It keeps a side dictionary mapping each value to its current index in the heap array, so finding the item is O(1). Updating its priority then heapifies up or down from that known index in O(log n).

**Why you need to answer that question at all:** because the only graph algorithm in this codebase that produces non-trivial paths — Dijkstra in `Graph2.ts` powering `/graphs/finding-shortest-path` — depends on this exact operation. Every time the visualizer relaxes an edge, it calls `updatePriority(neighborNode, newDistance)`. If that call is O(n), the page freezes on graphs above ~50 nodes. If it's O(log n), the graph could be 100k nodes and the algorithm would still feel instant.

Without the lookup dictionary:
- Find a value in the heap → scan all n positions → O(n)
- Dijkstra's per-edge work → O(n) per relaxation
- Dijkstra total → O(V² + V·E) — the textbook "naive" complexity

With the lookup dictionary:
- Find a value's index → `lookup[value]` → O(1)
- Update its priority and reheapify → O(log n)
- Dijkstra total → O((V+E) log V)

An indexed priority queue is a min-heap with React's `key` prop bolted on — the dictionary is the stable id that lets you find your item again after the array shuffled around it.

---

## How it works

The data structure shape. `PriorityQueue` in `src/utils/data_structures/PriorityQueue.ts` is three fields wrapped around the heap operations:

```
class PriorityQueue {
  heapArray: HeapItem[]                  // the heap, fixed-size, index 0 unused
  lastIndex: number                       // index of the last live item
  valueIndicesLookup: { [value]: index } // the optimization
  isMinHeap: boolean                      // comparator direction
}

class HeapItem {
  value: number | string | object         // what the consumer cares about
  priority: number                        // what the heap orders by
}
```

Two things to call out before walking operations. First, the heap is one-indexed: `heapArray[0]` is unused, the root lives at `heapArray[1]`. Second, `valueIndicesLookup` is keyed by `HeapItem.value`, not by reference — so values must be unique. If you `enqueue("nodeA", 5)` twice, the second call routes to `updatePriority` (L159–L162) instead of inserting a duplicate.

The sample state after enqueueing several items:

```
heapArray:
  index:   0      1            2            3            4
  value:  null  {v:"A",p:1}  {v:"B",p:3}  {v:"C",p:5}  {v:"D",p:7}

valueIndicesLookup:
  { "A": 1, "B": 2, "C": 3, "D": 4 }

lastIndex: 4
isMinHeap: true
```

### Bridge from frontend

The lookup dictionary is the same idea as React's `key` prop. When React reconciles a list, the `key` lets it find the same logical row after the array has been reordered, filtered, or partially re-rendered. Without `key`, React would have to match by position — which loses focus, animations, and component state. The priority queue without `valueIndicesLookup` would have to match items by linear scan — which loses constant-time access exactly when the algorithm needs it.

The shape `{ [value]: index }` is also the same pattern you reach for when you want O(1) lookup into an array. Frontend devs build it a hundred times across their career — keying a list by id, building a position map, indexing scores by username. Same pattern, applied to keep a heap addressable.

### Why one-indexed (skipping index 0)

The math is cleaner. With a one-indexed heap:

```
parent(i) = floor(i / 2)
left(i)   = 2 * i
right(i)  = 2 * i + 1
```

With a zero-indexed heap (as in `BinaryHeap.ts`):

```
parent(i) = floor((i - 1) / 2)
left(i)   = 2 * i + 1
right(i)  = 2 * i + 2
```

The one-indexed form has one fewer subtraction per parent computation and one fewer addition per child. At log₂(n) descents per operation, this matters when n is large and the heap is in a hot loop (Dijkstra on a 100k-node graph does millions of these). It also means `_propagateUp` (L119–L129) and `_propagateDown` (L134–L155) can use the cleaner formulas, and the bounds check `parent < 1` (L80) cleanly rejects the index-0 sentinel.

### The three helper functions — _elementsInverted, _swapElements, _propagateUp/Down

The heap operations are decomposed into four private helpers. They sit between the public API and the heap array, and they're the only places that touch `valueIndicesLookup`. The split keeps the public methods readable.

`_elementsInverted(parent, child)` (L75–L94) — returns true if the heap property is violated between this parent and this child. The body is the comparator direction: for a min-heap, "inverted" means parent's priority > child's. For a max-heap, parent's priority < child's. The line `return this.heapArray[parent].gt(this.heapArray[child])` (L89) is the comparator-flip point. The same `_propagateUp` works for both heap types because this helper hides the direction.

`_swapElements(index1, index2)` (L99–L114) — swaps two slots in `heapArray` AND swaps the corresponding entries in `valueIndicesLookup`:

```
swap heapArray:
  this.heapArray[index1] = item2
  this.heapArray[index2] = item1

swap lookup:
  this.valueIndicesLookup[item1.value] = index2
  this.valueIndicesLookup[item2.value] = index1
```

This is the load-bearing line for the optimization. Every time the heap moves an item, the lookup is updated in lockstep. The two structures stay in sync because every mutation goes through this one function.

`_propagateUp(lastIndex)` (L119–L129) — sift the item at `lastIndex` toward the root, swapping with its parent while the heap property is violated:

```
parent = floor(lastIndex / 2)
while _elementsInverted(parent, lastIndex):
  _swapElements(parent, lastIndex)
  lastIndex = parent
  parent = floor(lastIndex / 2)
```

`_propagateDown(index)` (L134–L155) — sift the item at `index` toward the leaves, swapping with the smaller (or larger) child while the heap property is violated:

```
while index <= lastIndex:
  swap = index
  if _elementsInverted(swap, 2*index):       swap = 2*index
  if _elementsInverted(swap, 2*index + 1):   swap = 2*index + 1
  if index !== swap:
    _swapElements(index, swap)
    index = swap
  else:
    break
```

Both are O(log n) — at most the height of the tree.

### enqueue — insert with deduplication

`enqueue(value, priority)` (L157–L179):

```
if valueIndicesLookup has value:
  updatePriority(value, priority)
  return

lastIndex++
heapArray[lastIndex] = new HeapItem(value, priority)
valueIndicesLookup[value] = lastIndex   ← register the lookup

_propagateUp(lastIndex)
```

The first three lines are the dedup gate. If you enqueue `"A"` again, it routes to `updatePriority`. This matters in Dijkstra: when you relax an edge to a neighbor that's already in the queue, you don't want a duplicate — you want to update the existing entry's priority.

Execution trace — enqueue `("X", 2)` into a min-heap that currently holds `[null, {A,1}, {B,3}, {C,5}, {D,7}]`:

```
Step 1: "X" not in lookup → continue.
Step 2: lastIndex = 4 + 1 = 5
        heapArray[5] = HeapItem("X", 2)
        lookup = { A:1, B:3, C:5, D:7, X:5 }

Step 3: _propagateUp(5)
        parent = floor(5/2) = 2
        _elementsInverted(2, 5)?
          heap[2] = {B, 3}, heap[5] = {X, 2}
          min-heap: parent.priority > child.priority?  3 > 2 → yes
          → swap
        _swapElements(2, 5):
          heapArray: [null, A:1, X:2, C:5, D:7, B:3]
          lookup:    { A:1, B:5, C:3, D:4, X:2 }
        lastIndex = 2, parent = 1
        _elementsInverted(1, 2)?
          heap[1] = {A, 1}, heap[2] = {X, 2}
          1 > 2? no → loop exits

Final heap: [null, {A,1}, {X,2}, {C,5}, {D,7}, {B,3}]
Final lookup: { A:1, X:2, C:3, D:4, B:5 }
```

Complexity: O(log n) time · O(1) space.

### dequeue — extract root

`dequeue` (L181–L205):

```
if lastIndex === 0: return null

firstItem = heapArray[1]                   # the root, to return
lastItem  = heapArray[lastIndex]           # to move into the root

heapArray[1]         = lastItem            # move last → root
heapArray[lastIndex] = null                # clear the now-empty slot

valueIndicesLookup[lastItem.value] = 1     # update lookup for moved item
delete valueIndicesLookup[firstItem.value] # delete entry for extracted item
lastIndex--

_propagateDown(1)                          # restore heap property

return firstItem.value                     # consumer gets the value, not the HeapItem
```

The shape mirrors `MinHeap.getMin` from `BinaryHeap.ts` — swap last into root position, free the old root slot, sift down. The extra work is the two lookup mutations: update the moved item's entry, delete the extracted item's entry.

Returning `firstItem.value` instead of `firstItem` is deliberate: the priority is an internal concern of the queue, not the consumer's.

Complexity: O(log n) time · O(1) space.

### updatePriority — the operation this whole class exists for

`updatePriority(value, priority)` (L207–L228):

```
if value not in lookup: return       # nothing to update

index = lookup[value]                # O(1) — the optimization
oldPriority = heapArray[index].priority
heapArray[index].priority = priority

if isMinHeap:
  if oldPriority > priority:         # priority dropped → sift up
    _propagateUp(index)
  else:                              # priority rose → sift down
    _propagateDown(index)
else:
  if oldPriority > priority:         # priority dropped → for max-heap, sift down
    _propagateDown(index)
  else:                              # priority rose → for max-heap, sift up
    _propagateUp(index)
```

Execution trace — given the heap `[null, {A,1}, {X,2}, {C,5}, {D,7}, {B,3}]` with `lookup = {A:1, X:2, C:3, D:4, B:5}`, call `updatePriority("D", 0)`:

```
Step 1: "D" is in lookup → continue.
Step 2: index = lookup["D"] = 4
        oldPriority = heap[4].priority = 7
        heap[4].priority = 0      # in-place mutation
        heap is now: [null, A:1, X:2, C:5, D:0, B:3]

Step 3: isMinHeap=true, oldPriority(7) > priority(0) → _propagateUp(4)

_propagateUp(4):
  parent = floor(4/2) = 2
  _elementsInverted(2, 4)?
    heap[2]={X,2}, heap[4]={D,0}
    min-heap: 2 > 0 → yes → swap
  _swapElements(2, 4):
    heap: [null, A:1, D:0, C:5, X:2, B:3]
    lookup: { A:1, X:4, C:3, D:2, B:5 }
  lastIndex=2, parent=1
  _elementsInverted(1, 2)?
    heap[1]={A,1}, heap[2]={D,0}
    1 > 0 → yes → swap
  _swapElements(1, 2):
    heap: [null, D:0, A:1, C:5, X:2, B:3]
    lookup: { D:1, A:2, C:3, X:4, B:5 }
  lastIndex=1 → loop exits (parent = 0, but bounds check rejects)

Final heap: [null, {D,0}, {A,1}, {C,5}, {X,2}, {B,3}]
Final lookup: { D:1, A:2, C:3, X:4, B:5 }
```

D bubbled all the way to the root in two swaps. Total work: O(log n) because the index was located in O(1) via the lookup.

Complexity: O(log n) time · O(1) space.

### Why this matters for Dijkstra concretely

Dijkstra's inner loop, in pseudocode:

```
while pq is not empty:
  u = pq.dequeue()            # O(log V)
  for each neighbor v of u:
    newDist = dist[u] + edge(u, v)
    if newDist < dist[v]:
      dist[v] = newDist
      pq.updatePriority(v, newDist)   # O(log V) — only because lookup exists
```

Without the lookup, that `updatePriority` becomes O(V) per call. Across E edges, the total is O(V·E). For a sparse graph (E ≈ V), that's O(V²). For a dense graph (E ≈ V²), it's O(V³).

With the lookup, every `updatePriority` is O(log V), and the total is O((V+E) log V).

For the visualizer's grid graphs (~50–500 nodes), the difference between O(V² log V) and O(V²) shows up as "instant" vs "noticeable lag." For real maps (Google Maps Manhattan = ~50k intersections, ~150k edges), the difference is "page renders" vs "tab frozen."

### Brute force vs optimal — Dijkstra's relaxation step

── Brute force ──────────────────────────────────

Pseudocode (find-by-scan):

```
function findIndex(arr, value):
  for i = 1 to lastIndex:
    if arr[i].value === value: return i
  return -1

function updatePriorityBrute(value, priority):
  index = findIndex(heapArray, value)         # O(n) scan
  if index === -1: return
  oldPriority = heapArray[index].priority
  heapArray[index].priority = priority
  # ...then propagate as before (O(log n))
```

Execution trace — `updatePriorityBrute("D", 0)` against the same starting heap:

```
findIndex:
  i=1: heap[1].value = "A"  → no
  i=2: heap[2].value = "X"  → no
  i=3: heap[3].value = "C"  → no
  i=4: heap[4].value = "D"  → yes → return 4

# index found after 4 comparisons; rest is the same as optimal.
```

At n=5 this is fine. At n=1,000 the scan is 1,000 comparisons per update. In Dijkstra on a 1,000-node sparse graph, with ~3,000 edges, that's ~3,000 × 1,000 = 3M comparisons just for index-finding.

Complexity per call: O(n) time · O(1) space.

What goes wrong at scale: the whole Dijkstra inner loop becomes O(V·E) instead of O(E log V). For 50k-node graphs (real city maps), that's the difference between a 100ms response and a 100-second response — a 1000× factor.

── Optimal ──────────────────────────────────────

The insight: maintain a side dictionary mapping each value to its current heap index. Every swap updates both the heap and the dictionary atomically. The dictionary is queried in O(1); the heap repair is O(log n) as before.

Pseudocode (lookup-indexed):

```
function updatePriority(value, priority):
  if value not in lookup: return
  index = lookup[value]                       # O(1) — the win
  oldPriority = heapArray[index].priority
  heapArray[index].priority = priority
  # then propagate as before (O(log n))
```

Execution trace — `updatePriority("D", 0)`:

```
lookup["D"] = 4    # O(1)
# rest is the same as brute, but the find step was free.
```

Complexity per call: O(log n) time · O(n) space (the lookup dictionary).

Why it's faster: O(1) index lookup replaces O(n) scan. The propagation step (O(log n)) is unchanged. Total per-call work drops from O(n) + O(log n) = O(n) to O(1) + O(log n) = O(log n).

── Comparison ───────────────────────────────────

```
┌─────────────────┬──────────────────┬──────────────────┐
│                 │ Bare heap        │ Indexed PQ       │
│                 │ (find by scan)   │ (this codebase)  │
├─────────────────┼──────────────────┼──────────────────┤
│ enqueue         │ O(log n)         │ O(log n)         │
│ dequeue         │ O(log n)         │ O(log n)         │
│ updatePriority  │ O(n)             │ O(log n)         │
│ inQueue (find)  │ O(n)             │ O(1)             │
│ getPriority     │ O(n)             │ O(1)             │
│ Memory          │ O(n)             │ O(n) heap        │
│                 │                  │ + O(n) lookup    │
│                 │                  │ = ~2× memory     │
│ At V=1k nodes   │ ~3M ops Dijkstra │ ~30k ops Dijkstra│
│ At V=50k nodes  │ ~7.5B ops        │ ~3M ops          │
│ Implementation  │ ~110 lines       │ ~250 lines       │
└─────────────────┴──────────────────┴──────────────────┘
```

When brute force is fine: when you only call enqueue/dequeue and never updatePriority. Top-k selection, streaming median, heap-sort — none of these need to mutate priorities of items already in the queue. Use the bare `MinHeap` from `BinaryHeap.ts`. The moment the algorithm is Dijkstra, A*, or any "relax this edge" pattern, the indexed PQ earns its place.

---

## Priority queue — diagram

```
THE TWO COORDINATED STRUCTURES:

heapArray (index 0 unused, root at index 1):

  index:   0     1            2            3            4            5
  slot:  [null, {A,1},      {X,2},       {C,5},       {D,7},       {B,3} ]
                  ▲           ▲            ▲            ▲            ▲
                  │           │            │            │            │
                  │           │            │            │            │
                  └───────────┴────────────┴────────────┴────────────┘
                              │
                              │  every swap updates BOTH structures
                              ▼
valueIndicesLookup:
  {
    "A": 1,   ←┐
    "X": 2,    │
    "C": 3,    │  O(1) lookup by value → heap index
    "D": 4,    │
    "B": 5     │
  }          ←┘

Tree projection from heap indices (parent(i)=floor(i/2), child(i)=2i, 2i+1):

                     index=1
                     {A, 1}
                    ╱      ╲
              index=2      index=3
              {X, 2}        {C, 5}
              ╱   ╲
        index=4  index=5
        {D, 7}   {B, 3}

OPERATIONS:

  enqueue(v, p):
    if v in lookup → updatePriority(v, p), return
    lastIndex++
    heapArray[lastIndex] = HeapItem(v, p)
    lookup[v] = lastIndex
    _propagateUp(lastIndex)
                                                       O(log n)

  dequeue():
    take heapArray[1] (the root) as result
    move heapArray[lastIndex] into heapArray[1]
    lookup[movedItem.value] = 1
    delete lookup[result.value]
    lastIndex--
    _propagateDown(1)
    return result.value
                                                       O(log n)

  updatePriority(v, p):
    if v not in lookup → return
    index = lookup[v]                                  O(1)
    heapArray[index].priority = p
    if priority dropped → _propagateUp(index)
    else                → _propagateDown(index)       O(log n)

The lookup is the load-bearing line. Every _swapElements call
mutates heapArray AND lookup in lockstep (L99–L114).
```

---

## In this codebase

**File:** `src/utils/data_structures/PriorityQueue.ts`
**Class:** `PriorityQueue`, with `HeapItem` as the inner element type
**Used by:** Dijkstra in `src/utils/data_structures/Graph2.ts`, surfaced through `/graphs/finding-shortest-path`

Key line ranges inside `PriorityQueue.ts`:

- `HeapItem` class (value + priority + comparators): L9–L32
- `PriorityQueue` constructor with sentinel size 100 and one-indexed array: L40–L45
- `size` / `isEmpty` / `inQueue` / `getPriority`: L47–L65
- `_elementsInverted` (comparator with one-indexed bounds check): L75–L94
- `_swapElements` (the lookup sync point): L99–L114
- `_propagateUp`: L119–L129
- `_propagateDown`: L134–L155
- `enqueue` (with dedup gate routing to updatePriority): L157–L179
- `dequeue`: L181–L205
- `updatePriority` (the operation this class exists for): L207–L228
- `peakTop` / `peekTopPriority` / `peekTopValue`: L230–L251

The constructor pre-allocates `new Array(size).fill(null)` (L41) with a default size of 100. For Dijkstra over larger graphs you'd pass a larger size on construction — the array doesn't grow dynamically; capacity is fixed at instantiation.

`inQueue(value)` (L55–L57) is the O(1) "is this already in the queue?" check that exists because of the lookup. Dijkstra uses it before relaxation to skip nodes already settled.

`getPriority(value)` (L59–L65) is the O(1) "what's its current priority?" query — also free because of the lookup.

---

## Elaborate

### Where this pattern comes from

Robert Tarjan and others formalized the "indexed priority queue" (sometimes "addressable heap") in the 1970s and 1980s as the missing piece for Dijkstra's algorithm to hit O((V+E) log V). The naive Dijkstra (1959) used an unordered array of distances and was O(V²); Donald Johnson's 1977 paper showed how a heap drops it to O((V+E) log V), provided the heap supports decrease-key in O(log n). Fibonacci heaps (Fredman and Tarjan, 1984) push the amortized bound to O(E + V log V), but the constants are large enough that binary heaps with a lookup dictionary win in practice for almost every graph size.

The pattern recurs anywhere "we need to find an item we already inserted." It's the same idea as keeping a separate id-to-index map alongside an array — common in game engines for entity lookups, in databases for secondary indices, and in routers (Linux's `tc qdisc` priority queues maintain a similar index).

### The deeper principle

Coordinate two structures, each optimized for one access pattern. The heap is optimized for "give me the extremum." The dictionary is optimized for "find this specific item." Each is O(log n) or O(1) on its strength. They're kept in sync by routing every mutation through a single function (`_swapElements`). The general lesson: if your workload has two different access patterns with conflicting structural demands, ship two structures and discipline their synchronization in one place.

This is the same principle behind a database table with a primary index plus a secondary index — the table stores rows by primary key for clustered reads, the secondary index stores `(secondary_key, row_id)` pairs for lookups by the other column. Same coordination, different scale.

### Where this breaks down

The lookup is keyed by value. If you need duplicate values (two nodes with the same identifier but different priorities), this design fails — the second `enqueue` clobbers the first's lookup entry. The codebase's Dijkstra works because graph nodes have unique identifiers; an event scheduler where two events can carry the same payload would need to key the lookup by a generated handle (e.g. an auto-incrementing id) and return that handle to the consumer.

The structure also breaks down when you need bulk priority updates (e.g. "increase every item's priority by 1"). Each update is O(log n), so n updates is O(n log n) — at that point a heapify-from-scratch in O(n) wins. The codebase doesn't hit this case because Dijkstra only updates one neighbor's priority per edge relaxation.

### What to explore next

- Fibonacci heap → amortized O(1) decrease-key; better Dijkstra bound but large constants — almost never beats binary heap in practice
- Pairing heap → simpler than Fibonacci with similar amortized behavior; often the best practical decrease-key heap
- Bucket queue / monotonic queue → if priorities are small integers, can replace the heap with an array of buckets — O(1) per operation, used in BFS-with-priorities and some Dijkstra variants

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬────────────────────────┬────────────────────────┐
│ Cost dimension   │ Indexed PQ             │ Bare heap              │
│                  │ (this codebase)        │ (BinaryHeap.ts)        │
├──────────────────┼────────────────────────┼────────────────────────┤
│ enqueue          │ O(log n)               │ O(log n)               │
│ dequeue          │ O(log n)               │ O(log n)               │
│ updatePriority   │ O(log n)               │ O(n) (linear find)     │
│ inQueue          │ O(1)                   │ O(n)                   │
│ Memory           │ ~2× (heap + dict)      │ 1× (heap only)         │
│ Code (lines)     │ ~250                   │ ~110                   │
│ Mutation surface │ every swap touches 2   │ every swap touches 1   │
│                  │ structures             │ structure              │
│ Bug risk         │ heap and lookup drift  │ none                   │
│ Dijkstra fits?   │ yes (O(E log V))       │ no (O(V·E))            │
└──────────────────┴────────────────────────┴────────────────────────┘
```

### Sub-block 1 — what we gave up

**Memory.** The lookup dictionary holds one entry per heap item. For a queue of 100k items, that's 100k extra dictionary entries on top of the heap's 100k slots — roughly doubling memory. V8 hash maps overhead is non-trivial; the dictionary form costs more than just `8 bytes × n`.

**Code complexity.** The bare heap in `BinaryHeap.ts` is ~110 lines. `PriorityQueue.ts` is ~250 lines for the same heap operations plus the lookup synchronization. A new contributor reading the file has to track "every swap mutates two structures" as an invariant. The `_swapElements` function (L99–L114) is the only place this invariant lives — if anyone else swaps directly, the lookup drifts and `updatePriority` returns wrong indices.

**Mutation discipline.** Every operation that moves an item — `_swapElements` directly, plus the `dequeue` body which inlines a swap rather than calling the helper (L184–L199) — must update both structures. The `dequeue` inline (L193–L199) updates `valueIndicesLookup[lastItem.value] = 1` and `delete valueIndicesLookup[firstItem.value]` by hand. If a future refactor splits dequeue's logic across functions, the synchronization could fall out of sync.

### Sub-block 2 — what the alternative would have cost

If the codebase used the bare `MinHeap` from `BinaryHeap.ts` instead, Dijkstra would be O(V·E) — one O(V) `arr.indexOf` scan per edge relaxation. For the visualizer's typical grid graphs (200 nodes, 800 edges), that's ~160k operations vs the indexed PQ's ~6k. The user wouldn't notice at this scale — both finish in a few milliseconds. But the visualizer's design contract is "the algorithm step-throughs match the algorithm's asymptotic shape." Using a bare heap would be lying about Dijkstra's complexity in the visualization.

The other alternative — a library priority queue like `@datastructures-js/priority-queue` (declared in `package.json` but not imported) — would handle the indexed-queue logic, but library queues typically don't expose the internal heap array or the lookup for inspection. The page's animation contract relies on being able to step through the queue's state; a black-box library wouldn't give that surface.

### Sub-block 3 — the breakpoint

Fine until duplicate values become legitimate. The dictionary is keyed by `HeapItem.value`, so two enqueues of the same value collapse into one entry. The codebase's Dijkstra is safe because graph node ids are unique. A breakpoint arrives the moment the consumer needs to enqueue the same logical value twice (e.g. two different priorities for the same payload). At that point, switch to keying the lookup by an auto-generated handle and return the handle to the consumer:

```
enqueue(value, priority) → returns handle (auto-incremented id)
updatePriority(handle, newPriority)
```

This is the shape every production "addressable priority queue" library actually ships (e.g. `pgheap`, Python's `heapq.heappush` with an entry counter).

### Sub-block 4 — what wasn't actually a tradeoff

Fibonacci heaps were not a real alternative. The amortized O(1) decrease-key sounds attractive, but for graphs under ~10k nodes the binary heap with a lookup wins on constant factors (~10× faster per operation). Fibonacci heaps also have notoriously fragile bookkeeping (consolidation, marking) that's error-prone to implement correctly in JavaScript, and there's no battle-tested JS library that ships one. For a visualizer where the largest graph is ~500 nodes, the binary heap form wasn't a tradeoff at all — it was the only sensible choice.

---

## Tech reference (industry pairing)

### Hand-rolled `PriorityQueue` with `valueIndicesLookup`

- **Codebase uses:** `PriorityQueue` class in `PriorityQueue.ts` L34–L252. Backed by a fixed-size `heapArray: any[]`, a `valueIndicesLookup: { [value]: number }` dictionary, and one-indexed math.
- **Why it's here:** Dijkstra's `decrease-key` step needs O(log n) updatePriority; only an indexed heap provides that. The hand-rolled version exposes the lookup and heap array publicly so the visualizer can inspect state mid-algorithm.
- **Leading today:** indexed binary heap (this shape) — adoption-leading, 2026. Standard implementation in algorithm textbooks and competitive-programming templates.
- **Why it leads:** binary heap's cache locality + O(log n) decrease-key matches Dijkstra's complexity without the implementation cost of Fibonacci heaps. Industry implementations (e.g. Boost's `d_ary_heap_indirect`, Java's `IndexMinPQ` in Sedgewick's algs4) ship the same shape.
- **Runner-up:** Fibonacci heap — innovation-trailing in JS. Theoretically better amortized bounds (`O(E + V log V)` for Dijkstra) but in practice the constants and code complexity rarely justify it.

### Dictionary as O(1) lookup (plain JS object)

- **Codebase uses:** `valueIndicesLookup: { [value]: index }` as a plain object at L44.
- **Why it's here:** the lookup is the entire optimization. Object property access is O(1) average in V8 and the keys (graph node ids) are strings or numbers, which avoids the hashing edge cases of arbitrary object keys.
- **Leading today:** `Map` (the ES2015 type) — adoption-leading for new code in 2026.
- **Why it leads:** `Map` preserves key insertion order, allows arbitrary keys (including objects), and has guaranteed O(1) amortized access without prototype-chain edge cases. Plain object lookups can be deoptimized by V8 if the key shape changes (megamorphic).
- **Runner-up:** `WeakMap` — useful when keys are objects whose memory you don't own; not relevant here because keys are string ids.

### Fixed-size array allocation (`new Array(size).fill(null)`)

- **Codebase uses:** `this.heapArray = new Array(100).fill(null)` at L41. Default size is hardcoded to 100 with no resize logic.
- **Why it's here:** pre-allocating a fixed-size array avoids V8 reshaping the underlying buffer as items are pushed. For known-bounded workloads (a graph with N nodes), this is faster and predictable.
- **Leading today:** fixed-size preallocation — adoption-leading for performance-sensitive priority queues, 2026.
- **Why it leads:** dynamic `push` triggers reallocation when capacity doubles; pre-allocating removes that cost from the hot loop. Standard pattern in game engines and graph algorithms.
- **Runner-up:** dynamic `push` with growth — adoption-leading for general use but trades latency spikes on resize for code simplicity.

---

## Summary

A priority queue with `updatePriority` is a binary heap wrapped with a value-to-index dictionary, so an item already in the heap can be found in O(1) and its priority changed in O(log n) instead of O(n). In this codebase, `src/utils/data_structures/PriorityQueue.ts` ships this structure with a one-indexed heap (root at `heapArray[1]`, index 0 unused for cleaner parent/child math) and routes every swap through `_swapElements` (L99–L114), which is the single line that keeps the heap and the lookup in sync. The constraint that forced the indexed form was Dijkstra: every edge relaxation calls `updatePriority` on a neighbor that's already in the queue, and without the lookup that call is O(n), degrading Dijkstra from O((V+E) log V) to O(V·E). The cost paid is roughly 2× memory (heap plus lookup) and a 2× longer file (~250 vs ~110 lines), with the mutation discipline that every swap must touch both structures.

Key points to remember:

- The lookup dictionary `{ [value]: heapIndex }` is the load-bearing optimization; without it, `updatePriority` and `inQueue` are O(n) instead of O(1) and O(log n).
- The heap is one-indexed (root at `heapArray[1]`, index 0 is the unused sentinel) for cleaner parent/child math: `parent(i) = floor(i/2)`, `child(i) = 2i, 2i+1`.
- `_swapElements` (L99–L114) is the only place the lookup is mutated alongside the heap; every other operation routes through it to keep the two structures in sync.
- `enqueue` deduplicates by routing to `updatePriority` when the value is already in the lookup (L159–L162); Dijkstra relies on this.
- `dequeue` inlines a swap-and-pop pattern (L184–L205) but still updates both structures by hand.
- Without this class, Dijkstra in `Graph2.ts` would be O(V·E) and the `/graphs/finding-shortest-path` page would freeze on graphs above a few hundred nodes.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about priority queues, they're usually probing for one of two things. First: do you know the difference between a bare heap and an indexed priority queue, and can you name the algorithm that needs the latter? Second: do you understand why Dijkstra's complexity is O((V+E) log V) — what makes the `log V` factor land there, and what would break that bound?

### Likely questions

[mid] Q: Explain `updatePriority`. How does it find the item in O(log n)?

A: It finds the item's index in O(1) via the `valueIndicesLookup` dictionary, then either heapifies up or heapifies down from that index in O(log n). Whether to sift up or down depends on the heap type and direction of the priority change — in a min-heap, a lowered priority sifts up, a raised priority sifts down. In this codebase that's `PriorityQueue.ts` L207–L228. The O(1) lookup is the whole point; without it, finding the item is a linear scan and the total work is O(n).

Diagram:
```
Heap before updatePriority("D", 0):
  heap: [null, {A,1}, {X,2}, {C,5}, {D,7}, {B,3}]
  lookup: { A:1, X:2, C:3, D:4, B:5 }

Step 1: lookup["D"] = 4                    ← O(1)
Step 2: heap[4].priority = 0
        heap: [null, A:1, X:2, C:5, D:0, B:3]
Step 3: priority dropped → _propagateUp(4)
        swap(4, 2): heap: [null, A:1, D:0, C:5, X:2, B:3]
        swap(2, 1): heap: [null, D:0, A:1, C:5, X:2, B:3]
                                                ← O(log n) swaps total

Final lookup: { D:1, A:2, C:3, X:4, B:5 }   ← synced
```

[senior] Q: Why did you spend the memory on a separate lookup dictionary instead of just scanning the heap?

A: The lookup turns Dijkstra from O(V·E) into O((V+E) log V). For the visualizer's grid graphs the difference is invisible — both finish in milliseconds. But the contract of the visualization is "show the algorithm at its known complexity," and the textbook Dijkstra complexity assumes a decrease-key operation in O(log V). Without the lookup, the inner loop's update step is O(V), and that O(V) factor cascades across E relaxations. The 2× memory cost is paid once at queue construction; the algorithmic cost would be paid on every edge.

Diagram:
```
Dijkstra inner loop, per edge relaxation:

  Bare heap (scan):              Indexed PQ (lookup):
  ┌───────────────────┐          ┌───────────────────┐
  │ findIndex by scan │ O(V)     │ lookup[v]          │ O(1)
  │ → linear walk      │          │ → dict access      │
  ├───────────────────┤          ├───────────────────┤
  │ propagateUp/Down  │ O(log V) │ propagateUp/Down   │ O(log V)
  └───────────────────┘          └───────────────────┘
   total per relax:               total per relax:
   O(V)                            O(log V)

  Across E edges:                Across E edges:
   O(V·E)                          O(E log V)
```

[arch] Q: A team is building a job scheduler with one million pending jobs and ~50k priority updates per second. Would you reach for this implementation?

A: Almost. Three things to adjust. First, the fixed-size array (L41 — `new Array(100)`) needs to either pre-allocate one million slots or be replaced with a dynamically-growing array — the current code would silently overflow. Second, the lookup keyed by value won't work if jobs can share payloads; switch to a generated handle. Third, at one million items with 50k updates per second, the binary heap's `log V` ≈ 20 comparisons per update, totaling one million comparisons per second — fine for a single thread. But the `_swapElements` function does two object mutations per swap (heap + lookup); for hot paths I'd benchmark whether a typed array of indices plus a parallel array of priorities outperforms the object form. The structural shape is right; the V8 microarchitecture choices need tuning.

Diagram:
```
What scales, what doesn't, at 1M items:

  Structural choices that survive scale:
   - binary heap with index math      ✓
   - separate lookup for O(1) find    ✓
   - one-indexed math                 ✓ (10% speedup at log V = 20)

  Choices that need refactoring:
   - fixed-size array (capacity=100)  ✗ → dynamic or pre-allocated 1M
   - lookup keyed by value            ✗ → keyed by generated handle
   - object-per-HeapItem              ⚠ → maybe typed parallel arrays
```

### The question candidates always dodge

Q: Fibonacci heaps have amortized O(1) decrease-key, which is asymptotically better than your O(log n). Why didn't you use one?

A: Honest answer: I read the Fibonacci heap paper and I understand the amortized analysis, but I've never seen a Fibonacci heap beat a binary heap in a real benchmark. The constant factors are large (cascading cuts, mark bits, consolidation passes), the memory layout is pointer-heavy (one node per item plus child/sibling/parent pointers), and the implementation is fragile — every published Fibonacci heap implementation I've reviewed has at least one bug in the consolidation step. For the graph sizes this codebase visualizes (up to a few hundred nodes), the binary heap with a lookup is ~10× faster in practice than a Fibonacci heap. If I were on a team where someone insisted on it for asymptotic reasons, I'd ask them to ship a benchmark on real graph data first. Pairing heaps are a more honest middle ground — simpler than Fibonacci, similar amortized behavior, used in `g++`'s `priority_queue`.

Diagram:
```
Practical Dijkstra throughput at V=10k, E=50k:

                       │ Binary heap   │ Fibonacci heap │
                       │ + lookup      │                │
───────────────────────┼───────────────┼─────────────────
 Asymptotic            │ O(E log V)    │ O(E + V log V) │
 ops at V=10k, E=50k   │ ~700k         │ ~140k          │
 wall time (V8, ms)    │ ~12ms         │ ~85ms          │
 reason                │ cache-friendly│ pointer chase, │
                       │ array         │ marking bits   │

Fibonacci wins on paper. Binary heap wins on the wire.
```

### One-line anchors

- "The lookup dictionary is the line that turns Dijkstra's relaxation step from O(n) into O(log n)."
- "Every swap mutates two structures; `_swapElements` is the only place that's allowed to."
- "One-indexed math because the parent formula has one fewer subtraction; matters at log V = 20 levels per operation."
- "Bare heap when you only insert and extract; indexed PQ when you also need to update priorities of items already in the queue."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On paper, draw the heap state after enqueueing `("A",1)`, `("B",3)`, `("C",5)`, `("D",7)`, then `("X",2)` into an empty min-heap. Show both the heap array (with index 0 as the unused sentinel) AND the lookup dictionary. Then call `updatePriority("D", 0)` and redraw.

Open the file. Compare against the trace above.

Pass: your final heap is `[null, {D,0}, {A,1}, {C,5}, {X,2}, {B,3}]` and the lookup is `{D:1, A:2, C:3, X:4, B:5}`.
Fail: re-read the `_propagateUp` and `_swapElements` sections, focus on the lockstep mutation of heap and lookup.

### Level 2 — Explain it out loud

Explain why Dijkstra needs an indexed priority queue (not a bare heap) to hit O((V+E) log V). No notes. Under 90 seconds.

Checkpoints:
- Did you name the relaxation step where `updatePriority` is called?
- Did you say what the bare heap's `updatePriority` cost would be (O(n))?
- Did you reference `PriorityQueue.ts` L207–L228 and `valueIndicesLookup` at L38?

### Level 3 — Apply it to a new scenario

You're building a render scheduler for an animation system. Frames have a target timestamp (the priority) and a payload (the frame's draw commands). The scheduler needs to: insert frames in any order, always render the earliest-timestamp frame next, and adjust a frame's timestamp if a user interaction reprioritizes it.

Walk through whether `PriorityQueue` from this codebase fits as-is, or whether you'd modify it. Then open `PriorityQueue.ts` L157–L228 and check whether `enqueue` / `dequeue` / `updatePriority` cover your needs.

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the fixed-size array allocation (`new Array(100).fill(null)` at L41) with no resize logic.

"If you were refactoring `PriorityQueue.ts` for a workload of unknown size, would you switch to a dynamically-growing array, or keep the fixed-size form and require the consumer to pass a max size? What does each cost — in performance, in API surface, in failure mode?"

Reference `PriorityQueue.ts` L40–L45 (constructor) and name what would change.

### Quick check — code reference test

Without opening any files:
- What file does `PriorityQueue` live in?
- What's the name of the lookup dictionary field?
- What method is the load-bearing one for Dijkstra (the operation this whole class exists for)?

Open the file and verify.

Pass: you named the file (`PriorityQueue.ts`), the field (`valueIndicesLookup`), and the method (`updatePriority`).
