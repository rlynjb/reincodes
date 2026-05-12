# Min-heap priority queue

**Industry name(s):** Priority queue (PQ), min-priority queue
**Type:** Industry standard · Language-agnostic

> A thin wrapper over `BinaryHeap` that exposes `enqueue(item, priority)`, `dequeue()`, `inQueue(item)`, and `updatePriority(item, newPriority)`. Used by Dijkstra.

**See also:** → [08-binary-heap](./08-binary-heap.md) · → [13-dijkstra](./13-dijkstra.md)

---

## Why care

Every scheduler, every shortest-path algorithm, every event-simulation system needs the same operation: "give me the highest-priority pending item." A plain queue does FIFO; a priority queue does "smallest first" (or "largest first"). For Dijkstra, it's the engine — pull the lowest-cost node, explore, update neighbour costs, push back.

Priority queues are the canonical *priority-ordered* collection — same family as schedulers (OS task lists), event loops (timer wheels), and traffic-shaping queues. Implementations: binary heap (this codebase), Fibonacci heap (theoretical), pairing heap (practical alternative), and bucket queues (for bounded priorities).

---

## How it works

Picture an emergency room. Patients arrive constantly; nurses see them by triage priority (cardiac first, sprained ankle last). The triage list isn't FIFO — it's priority-ordered. Adding a patient is O(log n) (insertion finds the right slot). Calling next patient is O(1) read + O(log n) reshuffle. A patient's condition worsens? Update their priority — O(log n) to reshuffle.

### The shape

```
class PriorityQueue {
  heap: BinaryHeap;
  positionMap: { [item]: index };  // optional, for updatePriority

  enqueue(item, priority): heap.insert({item, priority})
  dequeue(): return heap.extractMin().item
  peek(): return heap.peek().item
  inQueue(item): return positionMap.has(item)
  updatePriority(item, newPriority):
    idx = positionMap[item]
    heap[idx].priority = newPriority
    siftUp(idx) or siftDown(idx)
}
```

The `positionMap` is what enables `updatePriority` in O(log n) — without it, `updatePriority` requires O(n) scan to find the item first.

### In this codebase

```
// src/utils/data_structures/PriorityQueue.ts (simplified)
class PriorityQueue {
  enqueue(item, priority)
  dequeue()
  inQueue(item)
  updatePriority(item, newPriority)
  isEmpty()
}
```

Used in Dijkstra (`src/utils/data_structures/DijkstrasAlgorithm.ts`):

```
const pq = new PriorityQueue(0, true);   // min-priority
pq.enqueue(start_index, 0.0);            // start node priority 0
for (let i = 0; i < num_nodes; i++) {
  if (i !== start_index) pq.enqueue(i, Infinity);
}
// later: pq.updatePriority(neighbor, currentNode_newCost);
```

### Operations and complexity

```
┌─────────────────┬──────────────┐
│ Operation       │ Time         │
├─────────────────┼──────────────┤
│ enqueue         │ O(log n)     │
│ dequeue         │ O(log n)     │
│ peek            │ O(1)         │
│ inQueue         │ O(1) w/ map  │
│ updatePriority  │ O(log n)     │
└─────────────────┴──────────────┘
```

### Trace: Dijkstra's PQ usage

```
Initial graph: 5 nodes, start=0.

enqueue(0, 0):           pq = [(0, 0)]
enqueue(1, Inf):         pq = [(0,0), (1,Inf)]
enqueue(2, Inf):         pq = [(0,0), (1,Inf), (2,Inf)]
enqueue(3, Inf):         pq = [(0,0), (1,Inf), (2,Inf), (3,Inf)]
enqueue(4, Inf):         pq = [(0,0), (1,Inf), (2,Inf), (3,Inf), (4,Inf)]

dequeue → 0              pq = [(1,Inf), (2,Inf), (3,Inf), (4,Inf)]
explore 0's neighbours
updatePriority(1, 5):    pq = [(1,5), (2,Inf), (3,Inf), (4,Inf)]
updatePriority(2, 3):    pq = [(2,3), (1,5), (3,Inf), (4,Inf)]

dequeue → 2              pq = [(1,5), (3,Inf), (4,Inf)]
... continue
```

### The principle

This is what people mean by *priority-ordered work scheduling*. The PQ doesn't care about insertion order; it cares about priority order. Every algorithm that processes "the most urgent thing next" uses one: schedulers, A* search, Dijkstra, event simulators.

The full picture is below.

---

## Priority queue — diagram

```
              PriorityQueue
                   │
                   ▼
          BinaryHeap (min-heap)
          stored as flat array
                   │
                   ▼
       [(start,0), (n1,5), (n2,3), ...]
                   ▲
                   │
       Operations:
         enqueue(item, p)  → heap.insert
         dequeue()         → heap.extractMin
         updatePriority    → siftUp/down

  Dijkstra usage:
                     ┌──────────┐
   start_node ──────▶│enqueue(0)│
                     └──────────┘
                          │
                          ▼
                    dequeue → 0
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
      explore neighbours      updatePriority
      compute newCost         (relaxation)
              ▼                       ▼
       enqueue/update          repeat until empty
```

---

## In this codebase

**Class:** `src/utils/data_structures/PriorityQueue.ts`.
**Library used internally:** `@datastructures-js/priority-queue` v6.3.2 (per package.json) — though the codebase has its own wrapper.
**Used by:** `DijkstrasAlgorithm.ts` and the shortest-path page (`src/app/graphs/finding-shortest-path/page.tsx`).

GitHub: `[PriorityQueue.ts](https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/PriorityQueue.ts)`.

---

## Elaborate

### Where this pattern comes from
Priority queues predate computers — physical triage in hospitals, traffic control, mail-sorting workflows. As a data-structure abstraction, dates to the 1960s; implementations evolved from sorted arrays → binary heap → Fibonacci heap.

### The deeper principle
*Separating priority from arrival order is what makes systems work under load.* A FIFO queue treats every item equally — bad when some items are urgent. A PQ is the simplest mechanism to express "process the most important thing next."

### Where this breaks down
- Bounded priorities (e.g., 0–100): bucket queues are O(1) and beat heaps.
- Frequent decrease-key dominated workloads: Fibonacci heap theoretically faster.
- Items that change priority constantly: the PQ must support `updatePriority`, and you need a side-map.

### What to explore next
- [13-dijkstra](./13-dijkstra.md) — the canonical PQ-driven algorithm.
- A* search — PQ with `f(n) = g(n) + h(n)` as priority.
- Event-driven simulation — every event scheduled by future timestamp in a PQ.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Binary heap PQ           │ Sorted array              │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ enqueue          │ O(log n)                 │ O(n)                      │
│ dequeue          │ O(log n)                 │ O(1) (from end)           │
│ peek             │ O(1)                     │ O(1)                      │
│ updatePriority   │ O(log n) w/ side-map     │ O(n)                      │
│ Memory           │ Heap array               │ Flat array                │
│ Best when        │ Workload mixes ins+del   │ Mostly read after build   │
│ Worst when       │ Bounded discrete priori- │ Frequent inserts          │
│                  │ ties (use bucket queue)  │                           │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

`updatePriority` requires a side-map for O(log n). Without it, finding an item is O(n). The codebase's PriorityQueue implements this with `inQueue()` — internally tracking which items are still in the heap.

### What the alternative would have cost

A FIFO queue gives O(1) insert and dequeue but loses priority ordering. For Dijkstra, that's fatal — you'd process nodes in BFS order instead of shortest-path-cost order.

### The breakpoint

Fine for unbounded-priority workloads. Switch to bucket queue if priorities are bounded integers (e.g., 0–99 task priorities); switch to Fibonacci heap if decrease-key dominates (rare).

---

## Tech reference (industry pairing)

### Priority queue + binary heap

- **Codebase uses:** Custom `PriorityQueue` wrapping the codebase's `BinaryHeap`.
- **Why it's here:** Dijkstra needs `updatePriority`; standard JS arrays don't.
- **Leading today:** `@datastructures-js/priority-queue` — `adoption-leading` for production JS priority queues, 2026.
- **Why it leads:** typed, tested, fast (binary heap under the hood).

---

## Summary

### Part 1 — concept recap

A priority queue is a collection that always returns the highest-priority (or lowest, for min-heap) item. reincodes implements one over its `BinaryHeap` class, supporting `enqueue`, `dequeue`, `inQueue`, and `updatePriority`. It's the engine of Dijkstra's algorithm — the algorithm's correctness depends on always processing the next-lowest-cost node. The constraint is "ordered work scheduling at O(log n) per op," and the cost is O(log n) per update with a side-map.

### Part 2 — key points to remember

- Backed by a binary heap; operations match heap operations.
- `updatePriority` requires a side-map; otherwise finding an item is O(n).
- O(log n) for insert / dequeue / updatePriority.
- The canonical engine for Dijkstra, A*, event simulators, schedulers.
- Drop-in replacement: bucket queue if priorities are bounded; Fibonacci heap for decrease-key-heavy workloads.

---

## Interview defense

### What an interviewer is really asking

When someone asks about priority queues, they want to hear you connect them to the algorithm that *uses* them. Saying "Dijkstra needs to repeatedly pull the next-lowest-cost node, and only a PQ does that in O(log n)" demonstrates you understand the *purpose*, not just the structure.

### Likely questions

**Q [mid]: How does Dijkstra use the priority queue?**

A: Initialise the PQ with all nodes, priority = Infinity except start = 0. Loop: dequeue the min-priority node. For each neighbour, compute `newCost = current.cost + edge.weight`; if newCost < neighbour's current priority, call `updatePriority(neighbour, newCost)`. Continue until PQ is empty or you've found the target.

**Q [senior]: Why O(log n) for updatePriority — what's the side-map doing?**

A: The heap stores items in an array, but you don't know where a given item lives by value. To find item X in O(1), you need a map from item → array index. Then once you know the index, you can call siftUp or siftDown (O(log n)). Without the side-map, finding item X requires a full scan (O(n)).

```
heap:        [(0,0), (1,5), (2,3), (3,Inf), (4,7)]
positionMap: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 }

updatePriority(2, 1):
  idx = positionMap[2] = 2
  heap[2] = (2, 1)
  siftUp(2) → swap with parent → ...
  update positionMap as items move
```

**Q [arch]: Production scale — would you still use a binary heap PQ?**

A: For most cases yes; the constants are great and the algorithm is simple. If priorities are bounded integers (e.g., 0–7 task levels), bucket queue beats it (O(1) ops). If the workload is decrease-key dominated (Dijkstra on dense graphs), Fibonacci heap is theoretically better — but in practice, the cache penalty kills it.

### The question candidates always dodge

**Q: You use `Infinity` as the initial priority for unvisited nodes. What happens if the float math returns NaN?**

A: For Dijkstra it shouldn't — `Infinity + any positive number = Infinity`. The bug case is `Infinity - Infinity` or `Infinity * 0`, both NaN; those don't occur in cost addition. The fail-safe is to either (a) use a sentinel like `Number.MAX_SAFE_INTEGER` instead of Infinity, or (b) add an "unvisited" flag to avoid relying on the infinity comparison. The codebase's implementation uses `Infinity` and never hits the NaN path because it only ever does `currentCost + edge.weight` where both are finite.

### One-line anchors

- "Min-heap with extract-min and update-priority."
- "Backs Dijkstra, A*, schedulers, event loops."
- "updatePriority needs a side-map for O(log n)."
- "Switch to bucket queue if priorities are bounded."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Trace 5 enqueues + 3 dequeues with priorities `[(A,5),(B,3),(C,7),(D,1),(E,4)]`. Show the heap after each.

### Level 2 — Explain it out loud
"Why does Dijkstra need a priority queue and not just a regular queue?"

### Level 3 — Apply it to a new scenario
"Sort a stream of 1B integers using only 1KB of memory. PQ or external merge sort?"
(Answer: external merge sort with a k-way merge backed by a PQ on the file heads.)

### Level 4 — Defend the decision you'd change
"Would you replace the custom PriorityQueue with `@datastructures-js/priority-queue` (which is already a dependency)?"

### Quick check
- File? → `src/utils/data_structures/PriorityQueue.ts`.
- Algorithm using it? → Dijkstra.
- Why O(log n) on updatePriority? → side-map + siftUp/Down.

✓ Pass: all three.
