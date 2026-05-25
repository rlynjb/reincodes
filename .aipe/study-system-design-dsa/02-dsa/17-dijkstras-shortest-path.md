# Dijkstra's shortest path

**Industry name(s):** Dijkstra's algorithm, single-source shortest path, weighted graph search
**Type:** Industry standard · Language-agnostic

> BFS extended with weights — instead of FIFO, the frontier is a min-priority queue, so the next node to expand is always the one with the cheapest known cost from the start.

**See also:** → 10-priority-queue.md · → 14-graph-adjacency-list.md · → 15-bfs-with-parent-tracking.md · → 16-dfs-traversal.md

---

## Why care

You're building a `fetch` queue where every request has a *cost* attached — a "weight" your code already computes (estimated latency, payload size, retry count). You want to drain the queue, but not in arrival order. You want to drain it cheapest-first — always pick whichever pending request will finish soonest, fire it, watch what new requests it enqueues, and keep going. Sometimes a freshly-enqueued request is cheaper than something that's been sitting in the queue for a while; that's fine, it goes to the front.

That cheapest-first drain order is exactly Dijkstra's algorithm. Not the "shortest path through a city" framing — the *priority-aware queue drain*. The "start node" is your initial request; the "edges" are "this response triggers these follow-ups, each with a cost"; the "shortest path" is the cheapest cumulative cost from the start to any node you care about.

**Why you need to answer that question at all:** because the moment edges carry *weight*, BFS stops finding shortest paths. BFS finds shortest *hop count*. On the reincodes grid pathfinder, every cell-to-cell edge has a `getRandomEdgeWeight(1, 10)` cost — so the 4-hop path through high-cost cells (total cost 32) is *longer* than the 6-hop path through low-cost cells (total cost 14), even though it touches fewer cells. BFS would return the 4-hop path. The user would see a visibly suboptimal "shortest path" highlighted on screen, and the visualizer would be lying.

Without Dijkstra:
- BFS returns shortest-by-hop-count, not shortest-by-weight
- On a weighted grid, the highlighted path looks wrong (it's not the cheapest)
- You can't use the same algorithm for graph problems where edges genuinely carry cost (routing, latency-aware retry, weighted dependency resolution)

With Dijkstra:
- Min-priority queue ensures the next node expanded is always the cheapest-reachable one so far
- The first time a node is popped from the PQ, its cost is finalized — no later relaxation can improve it
- A `parent` array (same trick as BFS) reconstructs the actual path

Dijkstra is what BFS becomes when "the next item to process" is no longer "the one that arrived first" but "the one with the lowest accumulated cost." The frontier discipline is the only change. The full mechanics are below.

---

## How it works

### Move 1 — The mental model: BFS with a priority queue instead of a FIFO

Picture the BFS loop from `breadth_first_search` — pull the front of the queue, expand neighbors, push unvisited ones to the back. Now replace the FIFO array with a min-heap keyed by *cost from start*. Pull the cheapest. Expand its neighbors — but instead of "push if unvisited," do "*relax*": if `cost[u] + edge.weight < cost[neighbor]`, update `cost[neighbor]` and bubble it up in the heap.

```
BFS frontier vs Dijkstra frontier

  BFS:                       Dijkstra:
  ┌─────────────┐            ┌─────────────────────┐
  │ FIFO array  │            │ Min-priority queue  │
  │             │            │ (keyed by cost)     │
  │ [a, b, c]   │            │                     │
  │ shift → a   │            │ extract-min →       │
  │ (a entered │            │   whichever has the │
  │  first)     │            │   lowest cost so far│
  └─────────────┘            └─────────────────────┘
```

The strategy in one line: visit nodes in order of their *cheapest known cost from the start*, not their order of arrival. Once a node is popped, its cost is final — because any later route to it would have had a higher cost (the PQ would have popped that route's intermediate node first).

### Move 2 — The four pieces of state

`Dijkstras` in `DijkstrasAlgorithm.ts` carries four arrays/objects. Each one earns its place.

**Sub-section A: the `cost` array — cheapest cumulative cost so far**

`cost: number[V]`, initialized to `Infinity`, except `cost[start] = 0.0`. At any moment, `cost[u]` is the best (lowest) total weight of any path from start to u that the algorithm has *discovered so far*. It can still go down. Once `u` is popped from the PQ, `cost[u]` is final.

```
Initial cost array for a 5-node graph, Dijkstra from node 0:

   cost = [ 0,  ∞,  ∞,  ∞,  ∞ ]
            ▲   ▲
            │   └── unknown — no path found yet
            └────── known — start is 0 hops from itself
```

If you're coming from frontend, this is the same idea as a `Record<RequestId, EstimatedLatencyMs>` you'd build to track which API call's expected response time is lowest, updating it as new dependency requests refine your estimate.

**Sub-section B: the `parent` array — same trick as BFS**

`parent: number[V]`, initialized to `-1`. When relaxation improves a node's cost via some predecessor `u`, set `parent[neighbor] = u`. At termination, walk the parent chain backwards from any node to reconstruct the cheapest path. This is identical to BFS — the only difference is that Dijkstra's `parent[neighbor]` can be *overwritten* when a cheaper route appears, whereas BFS only ever writes it once (because BFS already visits nodes in shortest-distance order).

**Sub-section C: the priority queue — the frontier**

`pq: PriorityQueue` — a min-heap that supports three operations:

```
pq.enqueue(node, priority)      // insert with priority
pq.dequeue()                    // returns node with min priority
pq.inQueue(node)                // O(1) membership test
pq.updatePriority(node, newP)   // change a node's priority,
                                // re-heapify in O(log n)
```

The fourth operation is the load-bearing one. Without `updatePriority` running in O(log n), Dijkstra falls back to either rebuilding the heap on every relaxation (O(n) per op, so O(V²) overall) or to a linear scan to find the cheapest unvisited node (also O(V²)). The reincodes `PriorityQueue` carries a `valueIndicesLookup` field specifically so `updatePriority` can find a node's heap position in O(1) and then bubble it in O(log n).

The bridge from frontend: this is like maintaining a `useMemo`'d sorted list where you can *change* one item's sort key without re-sorting the whole list. The `valueIndicesLookup` is the index that makes "find this item by value, in the data structure that's normally keyed by sort order" possible.

**Sub-section D: the relaxation step — the inner loop**

For each edge `(u, neighbor)` out of the freshly-popped `u`:

```
if pq.inQueue(neighbor):                       // still unvisited
  new_cost = cost[u] + edge.weight             // would-be cost via u
  if new_cost < cost[neighbor]:                // strictly cheaper?
    pq.updatePriority(neighbor, new_cost)      // re-heapify
    parent[neighbor]  = u
    cost[neighbor]    = new_cost
```

The bridge from frontend: relaxation is the same pattern as a `setState((prev) => Math.min(prev, candidate))` — you only commit the update if the new value beats the old. Every visited neighbor checks "would going through me make this cheaper?" and updates if yes.

**Practical consequence:** because the PQ pops the cheapest unvisited node every time, and because relaxation only ever *decreases* a node's `cost`, the moment a node is popped, no further relaxation can improve it. That's the algorithm's correctness invariant. Skip it and you have Bellman-Ford (which handles negative weights at the cost of running V-1 full edge sweeps).

### Sub-section E: full execution trace on a 5-node weighted graph

Walk a tiny example end-to-end. Graph:

```
       2          3
   0 ─────── 1 ────── 2
   │         │        │
   │ 6       │ 4      │ 1
   │         │        │
   3 ─────── 4 ───────┘
       5         2

  edges (undirected, with weights):
    0–1: 2     1–2: 3     2–4: 1
    0–3: 6     1–4: 4     3–4: 5
```

Run Dijkstra from start = 0:

```
init:
  cost   = [0, ∞, ∞, ∞, ∞]
  parent = [-1,-1,-1,-1,-1]
  pq     = { 0:0, 1:∞, 2:∞, 3:∞, 4:∞ }   // node:priority

step 1: pop 0 (cost 0)
  examine edge 0→1 (w=2): new_cost = 0+2 = 2 < ∞ → update
    cost[1]   = 2;   parent[1] = 0;   pq.updatePriority(1, 2)
  examine edge 0→3 (w=6): new_cost = 0+6 = 6 < ∞ → update
    cost[3]   = 6;   parent[3] = 0;   pq.updatePriority(3, 6)
  cost   = [0, 2, ∞, 6, ∞]
  parent = [-1, 0,-1, 0,-1]
  pq     = { 1:2, 3:6, 2:∞, 4:∞ }

step 2: pop 1 (cost 2)
  examine edge 1→0: 0 not in pq → skip
  examine edge 1→2 (w=3): new_cost = 2+3 = 5 < ∞ → update
    cost[2] = 5; parent[2] = 1; pq.updatePriority(2, 5)
  examine edge 1→4 (w=4): new_cost = 2+4 = 6 < ∞ → update
    cost[4] = 6; parent[4] = 1; pq.updatePriority(4, 6)
  cost   = [0, 2, 5, 6, 6]
  parent = [-1, 0, 1, 0, 1]
  pq     = { 2:5, 3:6, 4:6 }

step 3: pop 2 (cost 5)
  examine edge 2→1: 1 not in pq → skip
  examine edge 2→4 (w=1): new_cost = 5+1 = 6;  6 < 6? NO → skip
  cost   = [0, 2, 5, 6, 6]
  parent = [-1, 0, 1, 0, 1]
  pq     = { 3:6, 4:6 }

step 4: pop 3 or 4 — tie; PQ resolves it by insertion order or heap shape.
        Say pop 3 (cost 6)
  examine edge 3→0: skip
  examine edge 3→4: 4 in pq; new_cost = 6+5 = 11 > 6 → skip
  pq     = { 4:6 }

step 5: pop 4 (cost 6)
  all neighbors not in pq → no updates
  pq     = {}

done. Final:
  cost   = [0, 2, 5, 6, 6]
  parent = [-1, 0, 1, 0, 1]
```

Reconstruct path from 0 to 4:

```
cur = 4; path = [4]
cur = parent[4] = 1; path = [1, 4]
cur = parent[1] = 0; path = [0, 1, 4]
cur = parent[0] = -1; stop

shortest path 0 → 4 = [0, 1, 4]   total cost = 2 + 4 = 6
```

Sanity check the alternative routes:
- 0 → 3 → 4: cost 6 + 5 = 11 (worse)
- 0 → 1 → 2 → 4: cost 2 + 3 + 1 = 6 (equal! but discovered later, parent[4]=1 won the tiebreaker)

Notice the second equal-cost path — `0 → 1 → 2 → 4` — wasn't picked because the relaxation `if new_cost < cost[neighbor]` is *strictly less than*. Equal-cost alternatives don't overwrite. The choice of which equally-cheap path Dijkstra returns depends on the order of edge iteration; this is a feature (deterministic) and occasionally a footgun (you might prefer the equal-cost-but-fewer-hops alternative for application reasons).

### Move 2.5 — Brute force vs optimal (DSA addition)

The "brute force" approach to weighted shortest path is Bellman-Ford or enumerating all simple paths. The "optimal" approach for non-negative weights is Dijkstra with a min-heap.

**The data shape:** the 5-node weighted graph above (`Graph2` adjacency list with `Edge.weight`).

**Brute force — relax all edges V-1 times (Bellman-Ford)**

```
function bellman_ford(graph, start):
  cost = array of V, all Infinity; cost[start] = 0
  parent = array of V, all -1
  for i in 1..V-1:                          // V-1 passes
    for each edge (u, v, w) in graph:        // every edge each pass
      if cost[u] + w < cost[v]:
        cost[v] = cost[u] + w
        parent[v] = u
  return cost, parent
```

Execution trace on the 5-node graph (pass-by-pass, just cost[]):

```
pass  cost                                      improved this pass?
────  ────────────────────────────────────────  ──────────────────
init  [0, ∞, ∞, ∞, ∞]
 1    [0, 2, 5, 6, 6]                           yes (most edges)
 2    [0, 2, 5, 6, 6]                           no
 3    [0, 2, 5, 6, 6]                           no
 4    [0, 2, 5, 6, 6]                           no
```

Final result: same as Dijkstra. But the work done: 4 passes × 6 edges × 2 directions = 48 edge relaxations to reach the steady state — when Dijkstra needed 5 pops and ~6 relaxations total.

Complexity: O(V · E) time, O(V) space.

What goes wrong at scale: Bellman-Ford runs V-1 full edge sweeps regardless of how few edges actually need relaxing. On a sparse graph with V = 10,000 and E = 50,000, that's 5 × 10^8 operations — gigantic — when Dijkstra would finish in roughly 200,000 ops (10x cheaper for the heap operations, 50x cheaper overall).

The one reason to use Bellman-Ford anyway: it handles negative edge weights (Dijkstra requires non-negative). It also detects negative cycles. Neither matters for the reincodes grid (weights are 1–10, never negative).

**Optimal — Dijkstra with a min-heap**

The insight: Bellman-Ford keeps relaxing edges that already won't improve. Dijkstra notices that once you've extracted the cheapest node, no future relaxation can lower it (assuming non-negative weights), so you can finalize it immediately. That's the *only* substantive difference.

```
function dijkstra(graph, start):
  cost = array of V, all Infinity; cost[start] = 0
  parent = array of V, all -1
  pq = min-heap; pq.enqueue(start, 0)
  for i in 0..V-1: if i != start: pq.enqueue(i, Infinity)

  while pq not empty:
    u = pq.dequeue()                            // O(log V)
    for each (u, v, w) in graph.edges(u):
      if pq.inQueue(v):
        if cost[u] + w < cost[v]:
          pq.updatePriority(v, cost[u] + w)     // O(log V)
          parent[v] = u
          cost[v]   = cost[u] + w
  return parent
```

Execution walked above in Sub-section E.

Complexity: O((V + E) log V) time using a binary heap. O(V) space.

Why it's faster than brute force: the cost-finality invariant. Once a node is popped, it's done. The PQ's job is to deliver nodes in cost order; the algorithm trusts that order and never revisits.

**Comparison**

```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│                     │ Bellman-Ford        │ Dijkstra            │
├─────────────────────┼─────────────────────┼─────────────────────┤
│ Time                │ O(V · E)            │ O((V+E) log V)      │
│ Space               │ O(V)                │ O(V)                │
│ V=10k, E=50k        │ ~10^9 ops           │ ~10^6 ops           │
│ Negative weights    │ handles them        │ requires ≥ 0        │
│ Negative cycles     │ detects them        │ undefined behaviour │
│ Per-iteration work  │ scan all E          │ pop + relax neighs  │
│ Frontier discipline │ none (all edges)    │ min-priority queue  │
└─────────────────────┴─────────────────────┴─────────────────────┘
```

**When brute force is fine:** when edges can be negative (financial-arbitrage detection, currency-exchange networks) and you can't transform the graph to make weights non-negative. For the reincodes grid — uniform positive weights — Bellman-Ford is strictly worse.

### Move 3 — The principle

Frontier discipline determines the algorithm. BFS uses FIFO and discovers nodes in hop order. DFS uses LIFO and discovers them in branch order. Dijkstra uses a min-priority queue and discovers them in *cost order*. Same outer loop — pop, examine neighbors, update — three completely different orderings. The general principle: when the inner loop is "process the next item," choose the data structure for the *next* operation, and the algorithm follows from the choice. The full picture is below.

---

## Dijkstra's shortest path — diagram

```
┌─ The four arrays Dijkstra maintains ────────────────────────────┐
│                                                                 │
│  cost[V]               parent[V]              pq                 │
│  ──────────            ───────────            ─────────────      │
│  best-known            predecessor on         min-heap, keyed    │
│  cost from             cheapest-known path    by cost            │
│  start, can            from start                                │
│  go down                                                         │
│                                                                  │
│  init:                  init:                  init:             │
│    cost[start] = 0      all -1                   start:0          │
│    rest = ∞                                      rest:∞          │
└─────────────────────────────────────────────────────────────────┘

┌─ The main loop ────────────────────────────────────────────────┐
│                                                                │
│  while pq not empty:                                           │
│    ┌────────────────────────────┐                              │
│    │ u = pq.dequeue()           │  ◀── cheapest unfinalized    │
│    └────────────┬───────────────┘                              │
│                 │ u is now FINALIZED                           │
│                 │ for each edge (u, v, w):                     │
│                 ▼                                              │
│    ┌────────────────────────────┐                              │
│    │ if v in pq:                │                              │
│    │   nc = cost[u] + w         │                              │
│    │   if nc < cost[v]:         │                              │
│    │     pq.updatePriority(v,nc)│   ◀── O(log V) re-heapify    │
│    │     parent[v] = u          │                              │
│    │     cost[v]   = nc         │                              │
│    └────────────────────────────┘                              │
└────────────────────────────────────────────────────────────────┘

         Path reconstruction (same as BFS):

   end_node → parent[end_node] → parent[parent[end_node]] → ... → start
```

---

## In this codebase

**File:** `src/utils/data_structures/DijkstrasAlgorithm.ts`
**Function:** `Dijkstras`
**Lines:** L1–L55

Trimmed shape:

```
function Dijkstras(g, start_index) {
  const cost   = new Array(g.num_nodes).fill(Infinity);
  const parent = new Array(g.num_nodes).fill(-1);
  const pq     = new PriorityQueue(0, true);

  pq.enqueue(start_index, 0.0);
  for (let i = 0; i < g.num_nodes; i++) {
    if (i !== start_index) pq.enqueue(i, Infinity);
  }
  cost[start_index] = 0.0;

  while (!pq.isEmpty()) {
    const currentMinNode = pq.dequeue();

    for (const edge of g.nodes[currentMinNode].getEdgeList()) {
      const neighbor = edge.to_node;

      if (pq.inQueue(neighbor)) {
        const currentNode_newCost = cost[currentMinNode] + edge.weight;
        if (currentNode_newCost < cost[neighbor]) {
          pq.updatePriority(neighbor, currentNode_newCost);
          parent[neighbor] = currentMinNode;
          cost[neighbor]   = currentNode_newCost;
        }
      }
    }
  }
  return parent;
}
```

Two things worth pinning:

- The function uses `edge.to_node` (snake_case). The actual `Graph2.Edge` class in `Graph2.ts` L7–L19 uses `toNode` (camelCase). This is a real bug in `DijkstrasAlgorithm.ts` — the function as written would always read `undefined`. The grid pathfinder `src/app/graphs/finding-shortest-path/page.tsx` carries an inline copy that correctly reads `edge.toNode` (L224).
- Initializing the PQ with every node at priority `Infinity` is the "lazy initialization" form. The alternative is to push nodes only when they're first relaxed; both forms are correct, this one is simpler.

**Call site (the working copy):**

**File:** `src/app/graphs/finding-shortest-path/page.tsx`
**Function:** `Dijkstras` (inline)
**Lines:** L192–L273

Same algorithm, but reads `edge.toNode` correctly, attaches the inline pathfinder to the React state, and reconstructs the path at the end:

```
const path = [];
let curr = end_index - 1;
while (curr !== undefined) {
  if (curr != -1) path.unshift(curr);
  curr = parent[curr];
}
return path;
```

The path-reconstruction loop is the same trick as `solve_pg_bfs` in the river-crossing puzzle — walk `parent[]` backwards from the goal until you hit `-1`. The `unshift` puts each step at the front so the final order is start-to-end.

**Related:**

- `src/utils/data_structures/PriorityQueue.ts` — the min-heap with `updatePriority` and `inQueue`. The `valueIndicesLookup` field is the key to O(log n) `updatePriority`.
- `src/utils/data_structures/finding_shortest_path/shortest_path.ts` — an older, fully commented-out version of `Dijkstras` from before the refactor. Kept as a historical reference; not imported anywhere.

---

## Elaborate

### Where this pattern comes from

Edsger Dijkstra wrote the algorithm in 1956 on the back of an envelope at a café in Amsterdam, to demonstrate the new ARMAC computer at a public exhibition. He needed an algorithm he could explain to non-programmers — so he chose "shortest route from Rotterdam to Groningen" because everyone in the Netherlands could relate. The original paper appeared in 1959 as *A note on two problems in connexion with graphs* — three pages, no priority queue, O(V²) time. The priority-queue version came later, once the binary heap was popularised by Williams in 1964.

### The deeper principle

Greedy with a correctness invariant. Dijkstra is a greedy algorithm — at every step it picks the locally-cheapest option and commits to it. Greedy algorithms usually don't work (the locally-best choice might block a globally-better one), but Dijkstra works because of a specific structural fact about non-negative weights: once you've found the cheapest node in the frontier, no future relaxation can make it cheaper. The frontier is sorted by cost; everything in the frontier costs at least as much as what you just popped; any path through the frontier adds non-negative weight to that cost. So the popped node's cost is final.

```
┌─ The non-negative-weight invariant ──────────────────────────────┐
│                                                                  │
│  pop u from PQ with cost c                                       │
│                                                                  │
│  any alternative path to u:                                      │
│    ... → x → ... → u    where x is still in the PQ               │
│                                                                  │
│  x's current cost ≥ c     (because we picked u, not x)           │
│  remaining edges weight ≥ 0                                      │
│  ⇒ alternative path cost ≥ c                                     │
│  ⇒ no improvement possible                                       │
│  ⇒ u's cost c is final                                           │
└──────────────────────────────────────────────────────────────────┘
```

Drop the non-negative requirement and the proof collapses. That's why Dijkstra requires it and Bellman-Ford doesn't.

### Where this breaks down

Negative edge weights — the invariant fails; use Bellman-Ford. Graphs where you don't know all edges up front (state-space search with infinite branching) — you can run Dijkstra over the implicit graph, but if the state space is too large you need A* with a heuristic. All-pairs shortest paths on dense graphs — running Dijkstra V times costs O(V(V+E) log V) which is worse than Floyd-Warshall's O(V³) when E is close to V². Graphs where you only care about a single specific source-target pair — bidirectional Dijkstra or A* with a goal-directed heuristic both prune more aggressively.

### What to explore next

- Priority queue → 10-priority-queue.md → the data structure that makes Dijkstra O((V+E) log V)
- BFS with parent tracking → 15-bfs-with-parent-tracking.md → the unweighted predecessor
- A* search → Dijkstra + a heuristic that estimates remaining cost-to-goal; the standard algorithm for grid pathfinding with terrain
- Bidirectional Dijkstra → search forward from start and backward from goal simultaneously; often 2x–4x faster on practical graphs

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬─────────────────────┬───────────────────────┐
│ Cost dimension   │ Dijkstra w/ PQ      │ Dijkstra w/o PQ       │
│                  │ (taken)             │ (linear scan)         │
├──────────────────┼─────────────────────┼───────────────────────┤
│ Time             │ O((V+E) log V)      │ O(V²)                 │
│ Space            │ O(V) heap + arrays  │ O(V) arrays           │
│ V=200, E=400     │ ~1,800 ops          │ ~40,000 ops           │
│ V=10k, E=50k     │ ~660,000 ops        │ ~100M ops             │
│ Code complexity  │ depends on PQ       │ 10 lines, no library  │
│ updatePriority   │ O(log V) w/ index   │ trivial (no PQ)       │
│ Library required │ yes (binary heap)   │ no                    │
└──────────────────┴─────────────────────┴───────────────────────┘
```

### What we gave up

PriorityQueue complexity. The `PriorityQueue` class needs `valueIndicesLookup` — a `Map<value, heapIndex>` that's kept in sync as the heap shifts items during sift-up/sift-down. That bookkeeping makes the heap more complex than a vanilla binary heap. Without it, `updatePriority` would have to scan the heap for the value (O(n)) before updating it, which would dominate the algorithm's cost.

Dependency. `DijkstrasAlgorithm.ts` imports `PriorityQueue` from `@/utils/data_structures`. That import is the *only* reason `PriorityQueue.ts` and `BinaryHeap.ts` are load-bearing in this codebase outside their own visualizer pages. Drop Dijkstra and those files become educational-only.

### What the alternative would have cost

If `Dijkstras` had used a linear scan instead of a priority queue:

```
while (some node has cost != Infinity and is unvisited) {
  let cheapest = find arg-min of cost[v] over unvisited v   // O(V)
  ... relax neighbors as before ...
}
```

Total work: V iterations, each doing an O(V) scan to find the cheapest unvisited, plus O(degree) relaxation = O(V²) overall.

For a 14×14 grid (V=196), that's ~40,000 operations versus the heap's ~1,800 — a 20x difference. With `delayLoop(200)` dominating, the user wouldn't notice. For a 100×100 grid (V=10,000), it's ~100 million ops vs ~660,000 — a 150x difference. At that size the algorithm would noticeably hang the page even without animation delays.

The grid visualizer is small enough that the linear-scan form would *work*. The heap exists so that scaling the grid up doesn't require rewriting the algorithm.

### The breakpoint

Fine until the graph becomes dense (E close to V²) — at that point the `(V+E) log V` term approaches `V² log V`, worse than the linear-scan's `V²`. The grid is sparse (each cell has at most 4 neighbors), so this never bites. Fine until edges become negative — at that point Dijkstra is incorrect, switch to Bellman-Ford. The grid never has negative weights (`getRandomEdgeWeight(1, 10)`).

### What wasn't actually a tradeoff

Fibonacci heaps. Textbooks list them as the "asymptotically optimal" priority queue for Dijkstra — O(1) `decrease-key`, O(log V) `extract-min`, total O(V log V + E) which beats binary-heap's O((V+E) log V). In practice, Fibonacci heaps have horrendous constants, complex implementation, and lose to binary heaps on every graph small enough to fit in memory. No JavaScript ecosystem library uses them; no production codebase reaches for them. They are an academic option only.

---

## Tech reference (industry pairing)

### `@datastructures-js/priority-queue` (wrapped by project `PriorityQueue`)

- **Codebase uses:** `new PriorityQueue(0, true)` in `DijkstrasAlgorithm.ts` L11 (and the inline copy in `finding-shortest-path/page.tsx` L198). The wrapper is `src/utils/data_structures/PriorityQueue.ts`.
- **Why it's here:** Dijkstra needs `extract-min` and `update-priority` on the frontier; without it the algorithm degrades from O((V+E) log V) to O(V²).
- **Leading today:** `@datastructures-js/priority-queue` — adoption-leading for general JS PQ usage, 2026.
- **Why it leads:** TypeScript-typed, zero peer dependencies, supports custom comparators. Used by enough tutorials and codebases that it's the obvious reach.
- **Runner-up:** `heap-js` — innovation-leading binary-heap library with broader heap semantics (max-heap, custom keys, replace-top operation). Roughly equivalent for Dijkstra's needs.

### Plain JS objects/arrays for `cost` and `parent`

- **Codebase uses:** `new Array(g.num_nodes).fill(Infinity)` and `new Array(g.num_nodes).fill(-1)` in `DijkstrasAlgorithm.ts` L6, L9.
- **Why it's here:** dense integer-keyed arrays — the node indices are 0..V-1, so plain arrays are the optimal storage.
- **Leading today:** plain JS arrays for dense integer keys — adoption-leading, 2026. Always.
- **Why it leads:** O(1) indexed access, contiguous memory, no hashing overhead.
- **Runner-up:** `Map<NodeId, Cost>` — used when node IDs are sparse or non-numeric (e.g., string keys for state-space search). For Dijkstra over a numbered graph, plain arrays win every time.

### `Graph2`'s `getEdgeList()` for neighbor iteration

- **Codebase uses:** `g.nodes[currentMinNode].getEdgeList()` in `DijkstrasAlgorithm.ts` L30, returning `Edge` objects with `toNode` and `weight`.
- **Why it's here:** the inner loop reads `edge.weight` for relaxation; the adjacency list keeps weights co-located with neighbor indices.
- **Leading today:** adjacency-list-of-edge-objects — adoption-leading for weighted graphs, 2026. See 14-graph-adjacency-list.md for the full discussion.
- **Why it leads:** O(degree) iteration with weight access, no parallel arrays to keep in sync.
- **Runner-up:** weighted adjacency matrix (`weight[V][V]`) — dense storage with O(1) edge weight lookup. Wins on dense graphs only; loses on the sparse grid.

---

## Summary

Dijkstra's algorithm finds shortest paths in a weighted graph from a single source by extending BFS in one specific way: replace the FIFO queue with a min-priority queue keyed by cost. The reincodes implementation in `DijkstrasAlgorithm.ts` and the inline copy in the grid pathfinder maintain four pieces of state — `cost`, `parent`, the PQ, and edge weights — and run a `pop → relax neighbors` loop until the PQ drains. The constraint that made the priority-queue version the right call is that the grid pathfinder needs cheapest-path on randomly-weighted edges, where BFS's hop-count would visibly mislead the user; the cost is the dependency on `PriorityQueue` with its `valueIndicesLookup` index. That index is what makes `updatePriority` O(log V) rather than O(V).

- Dijkstra is BFS with a min-priority-queue frontier instead of a FIFO.
- The cost-finality invariant — once popped, never relaxed again — only holds for non-negative weights.
- `updatePriority` in O(log V) is what keeps the algorithm at O((V+E) log V); without it, you regress to O(V²).
- The `parent[]` array reconstructs the actual cheapest path the same way BFS does for unweighted graphs.
- Equal-cost alternative paths are NOT updated — `if new_cost < cost[neighbor]` is strict less-than. Tiebreaking depends on edge iteration order.

---

## Interview defense

### What an interviewer is really asking

When the interviewer asks for "shortest path on a weighted graph," they're checking three things: do you immediately say Dijkstra, do you remember it requires non-negative weights, and can you explain why the priority queue matters (not just "it makes it faster" but specifically what asymptotic complexity it buys you and what breaks without it)? The hidden question is whether you understand that Dijkstra is BFS plus a smarter frontier — same outer shape, different data structure for "next item to process."

### Likely questions

[mid] Q: Walk me through Dijkstra's algorithm.

A: Same outer loop as BFS but with three changes. First, the queue is a min-priority queue keyed by cost from start. Second, I maintain a `cost` array where every entry starts at Infinity except start at 0. Third, when I expand a node's neighbors, instead of just enqueueing unvisited ones, I *relax* — if `cost[current] + edge.weight < cost[neighbor]`, I update the neighbor's cost and call `pq.updatePriority`. The first time a node is popped from the PQ, its cost is final because non-negative weights mean no later route can be cheaper. I also keep a `parent` array to reconstruct the path at the end.

Diagram:

```
init: cost[start]=0, rest=∞; parent all -1; pq has every node

  while pq not empty:
       ┌─────────────┐
       │ pop cheapest│      ◀── extract-min
       └──────┬──────┘
              │ u is finalized
              ▼
       ┌─────────────┐
       │ for each    │
       │ (u, v, w):  │
       │   relax v   │      ◀── if cost[u]+w < cost[v],
       └─────────────┘          update cost & parent
```

[senior] Q: Why does your priority-queue need `updatePriority` to run in O(log V) instead of O(V)?

A: Because relaxation happens at most O(E) times across the whole algorithm — every edge can trigger one `updatePriority` call in the worst case. If `updatePriority` is O(V) (which is what you get if you have to scan the heap for the node), the total cost becomes O(E · V), which is the same as Bellman-Ford and worse than the linear-scan O(V²). To stay at O((V+E) log V), `updatePriority` has to find the node's heap position in O(1) and then sift it in O(log V). The `valueIndicesLookup` map in `PriorityQueue` is exactly that — `Map<NodeId, HeapIndex>` kept in sync as the heap shifts items.

Diagram:

```
What we picked vs the "just scan the heap" suggestion

┌──────────────────┬──────────────────────┬─────────────────────┐
│                  │ With valueIndicesLkp │ Without (scan heap) │
├──────────────────┼──────────────────────┼─────────────────────┤
│ Find node in heap│ O(1)                 │ O(V)                │
│ Sift up/down     │ O(log V)             │ O(log V)            │
│ updatePriority   │ O(log V)             │ O(V)                │
│ Total Dijkstra   │ O((V+E) log V)       │ O(E · V) ≈ O(V³)    │
│                  │                      │ on dense graphs     │
│ Per-op overhead  │ Map writes each      │ none                │
│                  │ sift                 │                     │
└──────────────────┴──────────────────────┴─────────────────────┘

The Map writes are constant-factor overhead that buy a log-factor
asymptotic improvement. Almost always worth it.
```

[arch] Q: The grid pathfinder runs Dijkstra on a 14×14 grid in the browser. How would this scale to a 1000×1000 grid?

A: Three breakpoints. The algorithm itself stays O((V+E) log V) = O(10^6 · log 10^6) ≈ 20 million operations, which is roughly 100ms in pure JS — borderline but workable. The animation hits first: `delayLoop(200)` between every relaxation visit would take an hour to animate; you'd batch updates or drop the animation entirely. The bigger structural problem is that uninformed Dijkstra explores nodes in *all* directions equally; on a grid with a known goal, A* with a Manhattan-distance heuristic prunes most of the wasted exploration and is the right algorithm at that scale. So: keep Dijkstra for the algorithm-pedagogy page; add A* for the practical pathfinder.

Diagram:

```
What breaks first at 1000×1000 = 10^6 cells

┌─ Algorithm work ─────────────────────────────────┐
│  (V+E) log V                                     │
│  ~20M ops          ◀── borderline, but workable  │
└──────────────────────────────────────────────────┘
┌─ Animation cadence ──────────────────────────────┐
│  await delayLoop   ◀── BREAKS: hours per run     │
│  per visit                                       │
└──────────────────────────────────────────────────┘
┌─ Exploration strategy ───────────────────────────┐
│  uninformed        ◀── BREAKS: explores most of  │
│  Dijkstra              the grid before reaching  │
│                        goal                      │
└──────────────────────────────────────────────────┘
                          │
                          ▼
                  Add A* with a
                  Manhattan-distance
                  heuristic. Drop
                  animation or batch
                  updates to every Nth
                  visit.
```

### The question candidates always dodge

Q: Why bother with a priority queue at all? Couldn't you just run BFS and call it shortest path?

A: Only if every edge has the same weight. BFS finds shortest *hop count*. On a weighted graph where edges cost 1 to 10, the 4-hop path through high-cost cells might cost 32 while the 6-hop path through low-cost cells costs 14. BFS would return the 4-hop path and the user would see a visibly wrong "shortest" highlight. The whole point of replacing the FIFO with a PQ is to make "next to process" mean "cheapest cumulative cost" instead of "arrived first." If someone insists "BFS is good enough," they're either working on an unweighted graph (where they're right and Dijkstra wastes a log factor) or they haven't noticed their problem has weights yet.

Diagram:

```
What we picked vs the "just use BFS" suggestion

┌──────────────────┬───────────────────┬──────────────────────┐
│ Algorithm        │ BFS               │ Dijkstra             │
├──────────────────┼───────────────────┼──────────────────────┤
│ Frontier         │ FIFO array        │ Min-heap (PQ)        │
│ Visit order      │ hop distance      │ cost distance        │
│ On unweighted    │ correct, optimal  │ correct, log(V) cost │
│ On weighted      │ WRONG ANSWER       │ correct              │
│ Code complexity  │ 10 lines          │ 25 lines             │
│ Dependency       │ none              │ PriorityQueue        │
└──────────────────┴───────────────────┴──────────────────────┘

BFS isn't "good enough" on weighted graphs — it's literally wrong.
The user sees a path that's visibly not the cheapest.
```

### One-line anchors

- "Dijkstra is BFS with a min-priority queue instead of a FIFO."
- "Cost-finality holds because non-negative weights mean no future relaxation can lower an extracted node."
- "`updatePriority` in O(log V) is the difference between O((V+E) log V) and O(V²)."
- "BFS is wrong on weighted graphs — it finds shortest hops, not shortest cost."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the 5-node weighted graph (edges `0-1:2, 0-3:6, 1-2:3, 1-4:4, 2-4:1, 3-4:5`). Run Dijkstra from node 0 by hand. At each step, write the PQ contents, `cost[]`, and `parent[]`.

Open the file. Compare with the trace in Sub-section E.

✓ Pass: final `cost = [0, 2, 5, 6, 6]` and `parent = [-1, 0, 1, 0, 1]`.
✗ Fail: re-read Sub-section E, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain `Dijkstras` from `DijkstrasAlgorithm.ts` to an imaginary colleague who just asked "wait, isn't this just BFS with extra steps?" No notes. Under 90 seconds.

Checkpoints — did you:
- Name the specific file and function?
  → `src/utils/data_structures/DijkstrasAlgorithm.ts`, `Dijkstras` L1–L55
- Explain why the priority queue replaces the FIFO?
- Name the dependency on `updatePriority` running in O(log V)?

### Level 3 — Apply it to a new scenario

Without looking at the file, answer:

A product team asks you to support negative travel times (e.g., portal teleports that subtract time) in the grid pathfinder. Does the current Dijkstra implementation still work? If not, what algorithm would you use instead, and what specifically breaks in Dijkstra when an edge weight goes negative?

Write your answer. 3–5 sentences minimum. Then open `src/utils/data_structures/DijkstrasAlgorithm.ts` L36–L51 and explain which line(s) carry the non-negative assumption.

### Level 4 — Defend the decision you'd change

The biggest tradeoff in this file is min-heap PQ vs linear-scan. Answer in writing:

"If you were rewriting `Dijkstras` today for the 14×14 visualizer (and only the visualizer — no plans to scale), would you still use `PriorityQueue`? Or would you switch to the simpler linear-scan version and drop the dependency? What does each path cost you?"

Reference the actual code when you answer:
- Point to `DijkstrasAlgorithm.ts` L1–L55 for the current shape
- Point to `src/utils/data_structures/PriorityQueue.ts` for the dependency that would disappear

### Quick check — code reference test

Without opening any files, answer:
- What file defines `Dijkstras`?
- What does the function return?
- What's the time complexity?

Then open the file and verify.

✓ Pass: you named the file (`src/utils/data_structures/DijkstrasAlgorithm.ts`) and the return (`parent`).
✓ Pass: you said O((V+E) log V).
✗ Fail on lines: that's fine — line numbers change.
