# Dijkstra's shortest path

**Industry name(s):** Dijkstra's algorithm, single-source shortest path (SSSP)
**Type:** Industry standard · Language-agnostic

> Finds the shortest path from a start node to every other node in a weighted graph with non-negative edges. Visualized at `/graphs/finding-shortest-path`.

**See also:** → [09-min-heap-priority-queue](./09-min-heap-priority-queue.md) · → [11-graph-adjacency-list](./11-graph-adjacency-list.md) · → [12-bfs](./12-bfs.md)

---

## Why care

You want directions from A to B on a road network with varying road lengths. BFS doesn't help — it ignores edge weights. Dijkstra is the algorithm: it's the GPS-routing engine for non-negative-weight graphs, the foundation of OSPF (routing protocols), and the canonical example of "BFS but with priority instead of FIFO."

Dijkstra is the canonical single-source shortest-path algorithm — same shape as Prim's MST (minor variation), generalised by A* (Dijkstra + heuristic). For non-negative weights, no faster algorithm exists in the general case.

---

## How it works

Picture a flood that flows along roads, faster on highways and slower on dirt paths. The flood always picks the next-fastest unexplored road. At each step you pluck the cheapest-reachable node, then update its neighbours if you found a faster route through it.

### The algorithm

```
function Dijkstras(g, start):
  cost = new Array(numNodes).fill(Infinity)
  parent = new Array(numNodes).fill(-1)
  pq = new MinPriorityQueue()

  cost[start] = 0
  pq.enqueue(start, 0)
  for each other node i: pq.enqueue(i, Infinity)

  while !pq.isEmpty():
    u = pq.dequeue()           // node with smallest tentative cost

    for each edge (u, v, weight) of u:
      if pq.inQueue(v):
        newCost = cost[u] + weight
        if newCost < cost[v]:
          cost[v] = newCost
          parent[v] = u
          pq.updatePriority(v, newCost)

  return parent
```

### Trace on 4-node graph with weights

```
Graph:
       0 ──5── 1
       │ \     │
      10  6    2
       │   \   │
       3 ──1── 2

Initial:
  cost = [0, Inf, Inf, Inf]
  pq   = [(0,0), (1,Inf), (2,Inf), (3,Inf)]

Iter 1: dequeue u=0 (cost=0)
  edges: (0,1,5), (0,2,6), (0,3,10)
  relax 1: newCost=0+5=5 < Inf → cost[1]=5, parent[1]=0
  relax 2: newCost=0+6=6 < Inf → cost[2]=6, parent[2]=0
  relax 3: newCost=0+10=10 < Inf → cost[3]=10, parent[3]=0
  pq = [(1,5), (2,6), (3,10)]

Iter 2: dequeue u=1 (cost=5)
  edges: (1,2,2)
  relax 2: newCost=5+2=7 NOT < 6, skip
  pq = [(2,6), (3,10)]

Iter 3: dequeue u=2 (cost=6)
  edges: (2,3,1)
  relax 3: newCost=6+1=7 < 10 → cost[3]=7, parent[3]=2
  pq = [(3,7)]

Iter 4: dequeue u=3, no relaxations
  pq = []

Final:
  cost   = [0, 5, 6, 7]
  parent = [-1, 0, 0, 2]

Shortest path 0 → 3: 3 ← parent[3]=2 ← parent[2]=0
Path: [0, 2, 3]  total cost 7
```

### Complexity

- With binary-heap PQ: O((V + E) log V).
- With Fibonacci heap: O(E + V log V) — theoretically faster, practically slower.
- Space: O(V) for cost, parent, plus the heap.

### When Dijkstra fails

Negative edge weights. Dijkstra's correctness depends on "once dequeued, cost is final" — which only holds if no later path can be cheaper. Negative edges break that. Use Bellman-Ford for negative weights (O(VE)).

### The principle

This is what people mean by *greedy + invariant*. Dijkstra is greedy (always pick lowest cost next) but the greedy choice is *provably correct* because of the non-negative invariant — every step adds weight, so you can't get cheaper by going through a longer path.

The full picture is below.

---

## Dijkstra — diagram

```
Initial (start=0):                  After processing 0:
  cost = [0, ∞, ∞, ∞]                cost = [0, 5, 6, 10]
                                      parent = [-, 0, 0, 0]

       0(0)──5── 1(∞)                  0(0)──5── 1(5)
        │ \      │                      │ \      │
       10  6     2                     10  6     2
        │   \    │                      │   \    │
       3(∞)──1── 2(∞)                  3(10)──1── 2(6)

After processing 2:                  Final (after processing 3):
  cost = [0, 5, 6, 7]                  cost = [0, 5, 6, 7]
  parent = [-, 0, 0, 2]                shortest paths:
                                         0→1: cost 5
       0(0)──5── 1(5)                    0→2: cost 6
        │ \      │                       0→3: cost 7 via [0,2,3]
       10  6     2
        │   \    │
       3(7) ─1── 2(6)
```

---

## In this codebase

**Implementation:** `src/utils/data_structures/DijkstrasAlgorithm.ts` L1–L55.
**Page-local variant:** `src/app/graphs/finding-shortest-path/page.tsx` L192–L273 — the `Dijkstras` closure with path reconstruction at the end.

GitHub: `[DijkstrasAlgorithm.ts](https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/DijkstrasAlgorithm.ts)`.

---

## Elaborate

### Where this pattern comes from
Edsger Dijkstra published in 1959, calling it the simplest example of a "greedy algorithm." Originally designed to demonstrate the new ALGOL language, found to be foundational. Same paper introduced the algorithm to compute the shortest path AND the proof that the greedy strategy works.

### The deeper principle
*Greedy algorithms work when the local choice can't be undone by a later choice.* For shortest paths with non-negative weights, that invariant holds: extending a path never makes it shorter. For negative weights it fails, which is why Bellman-Ford is needed.

### Where this breaks down
- Negative edge weights: use Bellman-Ford (O(VE)).
- Very dense graphs: A* with a good heuristic beats Dijkstra by exploring fewer nodes.
- Dynamic graphs (edges change): re-run Dijkstra or use incremental SSSP algorithms.

### What to explore next
- Bellman-Ford — handles negative edges.
- A* — Dijkstra + admissible heuristic.
- Floyd-Warshall — all-pairs shortest path, O(V³).

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Dijkstra (binary heap)   │ Bellman-Ford             │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time             │ O((V+E) log V)           │ O(VE)                    │
│ Negative weights │ Fails (gives wrong ans)  │ Handles                  │
│ Negative cycle   │ N/A                      │ Detects                  │
│ Memory           │ O(V) + heap              │ O(V)                     │
│ Implementation   │ ~30 lines + heap         │ ~20 lines                │
│ Use cases        │ Road routing, OSPF       │ Currency arbitrage, BGP  │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Handling negative weights. Dijkstra is incorrect on negative edges — not slow, *incorrect*. For currency-exchange shortest-path (rates can be negative-log encoded), Bellman-Ford is the right tool.

### What the alternative would have cost

BFS works only on unweighted graphs. Bellman-Ford handles negative weights but is O(VE) — slower for the common case. A* needs a heuristic; without one, it degenerates to Dijkstra.

### The breakpoint

Fine for non-negative weights. The breakpoint is "graph allows negative edges" or "graph is very dense and a heuristic is available."

---

## Tech reference (industry pairing)

### Dijkstra + binary-heap PQ

- **Codebase uses:** `Dijkstras` function + `PriorityQueue` (binary heap).
- **Why it's here:** the canonical shortest-path-with-weights algorithm.
- **Leading today:** Dijkstra with binary heap — `adoption-leading` for production routing, 2026.
- **Why it leads:** asymptotically near-optimal; simple; supported everywhere.
- **Runner-up:** A* — `innovation-leading` when a good heuristic exists (e.g., spatial routing using haversine distance as h).

---

## Summary

### Part 1 — concept recap

Dijkstra finds the shortest path from a start node to every other node in a non-negative-weighted graph by repeatedly extracting the lowest-tentative-cost node from a priority queue and relaxing its neighbours. reincodes implements it on `/graphs/finding-shortest-path/page.tsx` over a randomly-weighted grid graph, animating the highlight of each visited cell with `delayLoop`. The constraint is "weighted graph, all weights non-negative," and the cost is O((V+E) log V) with binary heap.

### Part 2 — key points to remember

- Greedy: always dequeue the lowest-cost unvisited node.
- "Relaxation": `if newCost < cost[neighbour], update`.
- Returns `cost[]` (shortest distance to each node) and `parent[]` (path reconstruction).
- O((V+E) log V) with binary heap.
- Negative weights → Dijkstra is wrong. Use Bellman-Ford.

---

## Interview defense

### What an interviewer is really asking

When someone asks about Dijkstra, they want to hear "priority queue + relaxation + non-negative weights." The trap question is "what if there's a negative edge?" — the answer must be "Dijkstra is wrong; use Bellman-Ford."

### Likely questions

**Q [mid]: What does "relax an edge" mean?**

A: For edge `(u, v, w)`: compute `newCost = cost[u] + w`. If `newCost < cost[v]`, then we found a shorter path to `v` through `u` — update `cost[v]` and set `parent[v] = u`. Relaxation is the only place costs change in Dijkstra.

**Q [senior]: Why does Dijkstra fail on negative weights?**

A: Dijkstra's correctness depends on the invariant: *once a node is dequeued, its cost is final*. That's because every edge adds weight, so going through more nodes can never reduce cost. With negative edges, you might dequeue node X with cost 10, then later discover a path through Y that arrives at X with cost 7 — but by then we've already finalised X. The algorithm doesn't reconsider. Bellman-Ford avoids this by relaxing every edge V-1 times.

```
Negative-edge example:
   ┌──5── B ──(-3)── target
A ─┤
   └──1── C ──── target (cost: 1+? higher)

Dijkstra dequeues C first (cost 1), commits.
Never reconsiders going through B → target which is 5-3=2.
Reports wrong answer.
```

**Q [arch]: At 1M road segments (real-world map), is Dijkstra viable?**

A: For point-to-point queries, yes, but at scale you'd use *bidirectional Dijkstra* (search from both endpoints, meet in the middle, ~2× speedup) or *contraction hierarchies* (precompute a shortcut graph, query in milliseconds). For all-pairs, Floyd-Warshall is O(V³) = 10^18 at V=1M, infeasible — you use sketches/oracles.

### One-line anchors

- "BFS with priority instead of FIFO."
- "Relaxation: update cost if found a cheaper path."
- "Non-negative weights only."
- "Foundation of A* (add heuristic) and Prim's MST (slightly different objective)."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a 5-node weighted graph and trace Dijkstra from node 0. Show `cost`, `parent`, and `pq` after each iteration.

### Level 2 — Explain it out loud
"What's the invariant that makes Dijkstra correct?"

### Level 3 — Apply it to a new scenario
"GPS routing with traffic data. Edge weights are 'expected travel time.' Use Dijkstra or A*?"

### Level 4 — Defend the decision you'd change
"Would you use a Fibonacci heap PQ here? Why or why not?"

### Quick check
- File? → `src/utils/data_structures/DijkstrasAlgorithm.ts` (or `finding-shortest-path/page.tsx`).
- Time complexity? → O((V+E) log V) with binary heap.
- Fails when? → negative weights.

✓ Pass: all three.
