# Breadth-first search (BFS)

**Industry name(s):** Breadth-first search, BFS
**Type:** Industry standard · Language-agnostic

> Visit nodes level by level from a start node, using a queue. Implemented as `breadth_first_search` in `Graph2.ts`; powers grid traversal and the state-space search for river-crossing.

**See also:** → [11-graph-adjacency-list](./11-graph-adjacency-list.md) · → [13-dijkstra](./13-dijkstra.md) · → [14-state-space-bfs](./14-state-space-bfs.md)

---

## Why care

You're playing a game and want to know "what's the shortest sequence of moves to reach state X?" If every move costs the same, BFS finds it in time O(V + E). Same algorithm finds the shortest path in a maze, the minimum number of friends-of-friends to reach someone on a social network, or the fewest tool calls to reach a goal in agent planning.

BFS is the canonical *level-order traversal* — same shape as Dijkstra (with priority replaced by FIFO) and the engine of many other algorithms (shortest path in unweighted graphs, bipartite check, connected components, web crawlers).

---

## How it works

Picture ripples from a stone dropped in a pond: the ripple visits all points 1m away, then all 2m away, then 3m. BFS does that on a graph — visit all 1-hop neighbours, then all 2-hop, then 3-hop, etc. The data structure holding "what to visit next" is a FIFO queue.

### The algorithm

```
function breadth_first_search(graph, start):
  visited = new Array(numNodes).fill(false)
  parent  = new Array(numNodes).fill(-1)
  queue   = []

  queue.push(start)
  visited[start] = true

  while queue.length > 0:
    index = queue.shift()           // FIFO dequeue
    current = graph.nodes[index]

    for edge of current.getEdgeList():
      neighbor = edge.toNode
      if !visited[neighbor]:
        queue.push(neighbor)
        visited[neighbor] = true
        parent[neighbor] = index

  return parent
```

`parent[]` is the BFS tree — `parent[v]` is the node from which `v` was discovered. Reconstructing the path from `start` to any node `t`: follow parents from `t` backward until `start`.

### Trace on a 4-node graph

```
Graph:
       0 ─── 1
       │     │
       │     │
       3 ─── 2

BFS from 0:
  Initial:  queue=[0], visited=[T,F,F,F], parent=[-1,-1,-1,-1]

  Iter 1: dequeue 0
          neighbours: 1, 3
          visited[1]=T, parent[1]=0, queue=[1]
          visited[3]=T, parent[3]=0, queue=[1,3]

  Iter 2: dequeue 1
          neighbours: 0 (visited), 2
          visited[2]=T, parent[2]=1, queue=[3,2]

  Iter 3: dequeue 3
          neighbours: 0 (visited), 2 (visited)
          queue=[2]

  Iter 4: dequeue 2
          neighbours: 1 (visited), 3 (visited)
          queue=[]

Final: parent = [-1, 0, 1, 0]

Shortest path 0 → 2:
  trace back: 2 ← parent[2]=1 ← parent[1]=0
  path: 0, 1, 2  (length 2)
```

### Complexity

- Time: O(V + E) — each node and edge processed once.
- Space: O(V) for `visited`, `parent`, and `queue`.

### "When brute force is fine"

BFS *is* the brute-force shortest-path-in-unweighted-graph. There's no smarter algorithm. The "smart" sibling is Dijkstra (weighted) or A* (heuristic-guided).

### The principle

This is what people mean by *level-order exploration*. By using a FIFO queue, we guarantee that we exhaust all nodes at distance `d` before exploring any at distance `d+1`. Same principle behind iterative deepening DFS, beam search, and the "explore close before far" heuristic in many AI search algorithms.

The full picture is below.

---

## BFS — diagram

```
Graph:                BFS frontier expansion from 0:

      0                       step 1:    {0}
     / \                       
    1   2                     step 2:    {1, 2}
   /|   |\                    
  3 4   5 6                   step 3:    {3, 4, 5, 6}
      \ /
       7                      step 4:    {7}

Queue:   [0]
       → [1, 2]
       → [2, 3, 4]
       → [3, 4, 5, 6]
       → [4, 5, 6]
       → [5, 6]
       → [6, 7]
       → [7]
       → []

Parent: { 0:-1, 1:0, 2:0, 3:1, 4:1, 5:2, 6:2, 7:4 }
```

---

## In this codebase

**Function:** `src/utils/data_structures/Graph2.ts` L201–L225 — `breadth_first_search`.
**Used by:** grid traversal, river-crossing puzzle solver (`solve_pg_bfs` in `River_crossing_puzzles/PG.ts`).
**Animated traversal:** `NetworkDiagram.tsx` highlights nodes in BFS order via `delayLoop`.

GitHub: `[breadth_first_search](https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/Graph2.ts#L201-L225)`.

---

## Elaborate

### Where this pattern comes from
BFS as we know it dates to Moore (1959) for maze traversal. Konrad Zuse used a similar algorithm in 1945 for chess move analysis but didn't publish. It's the simplest correct shortest-path algorithm for unweighted graphs.

### The deeper principle
*Queue discipline = exploration discipline.* FIFO gives breadth-first. LIFO (stack) gives depth-first. Priority queue gives best-first (Dijkstra, A*). The data structure choice is the algorithm choice.

### Where this breaks down
- Weighted graphs: BFS finds shortest *hop count*, not shortest *cost*. Use Dijkstra.
- Very deep graphs: queue can grow large (worst case O(V)).
- Adversarial graphs: if branching factor is huge, queue explodes. Bidirectional BFS or iterative deepening can help.

### What to explore next
- [13-dijkstra](./13-dijkstra.md) — weighted-edge version with priority queue.
- [14-state-space-bfs](./14-state-space-bfs.md) — BFS over implicit graph (states + transitions).
- A* search — heuristic-guided BFS.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ BFS                      │ DFS                      │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Data structure   │ FIFO queue               │ LIFO stack / recursion   │
│ Order            │ Level-by-level           │ One-path-then-backtrack  │
│ Shortest path    │ Yes (unweighted)         │ No                       │
│ Memory           │ O(V) — queue holds level │ O(depth)                 │
│ Detection: cycle │ Visited array            │ Visited array            │
│ Use cases        │ Shortest path, distance  │ Topological, conn comp  │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Memory efficiency on deep graphs. BFS holds an entire level in the queue; if the branching factor is high, that's wide. DFS uses O(depth) only.

Path uniqueness. BFS gives *a* shortest path, not all shortest paths. Listing all requires backtracking through `parent`.

### What the alternative would have cost

DFS gives different guarantees: it finds *some* path (not necessarily shortest), it's better for cycle detection and topological sort. For "find any path / find the shortest path / list connected components," BFS is the canonical choice.

### The breakpoint

Fine until you have edge weights or heuristic info. Edge weights → Dijkstra. Goal heuristic → A*.

---

## Tech reference (industry pairing)

### BFS as a free function

- **Codebase uses:** `breadth_first_search(graph, start)` exported from `Graph2.ts`.
- **Why it's here:** the simplest shortest-path-in-unweighted-graph algorithm.
- **Leading today:** Plain BFS — `adoption-leading` for unweighted shortest path, 2026.
- **Why it leads:** asymptotically optimal; teaches the queue-discipline principle.

---

## Summary

### Part 1 — concept recap

BFS visits a graph level-by-level from a start node, using a FIFO queue, and produces a parent map that encodes the BFS tree (which gives shortest unweighted paths back from any node to the start). reincodes implements it in `Graph2.ts` as `breadth_first_search`; the grid pages and river-crossing puzzle both use it. The constraint is "find shortest path when all edges cost the same," and the cost is O(V) memory for the queue and visited array.

### Part 2 — key points to remember

- FIFO queue exhausts all distance-d nodes before any distance-(d+1).
- `parent[v]` builds the BFS tree; trace backward for the path.
- O(V + E) time, O(V) space.
- Foundation for Dijkstra (replace queue with priority queue) and A* (add heuristic).
- The cost is breadth-first memory; the benefit is provably optimal shortest path in unweighted graphs.

---

## Interview defense

### What an interviewer is really asking

When someone asks about BFS, they want to hear you say "queue, level-order, optimal for unweighted shortest path." The follow-up will probably be "vs Dijkstra" or "vs DFS."

### Likely questions

**Q [mid]: How do you reconstruct the shortest path from start to target?**

A: BFS returns a `parent` array where `parent[v]` is the node from which `v` was discovered. Starting from target, follow `parent` backward until you reach the start. Reverse the resulting list to get the forward path.

```
parent = [-1, 0, 1, 0]   start=0, target=2
path: 2 → parent[2]=1 → parent[1]=0 → done
reversed: [0, 1, 2]
```

**Q [senior]: Why is BFS shortest-path-optimal for unweighted graphs but not weighted?**

A: BFS exhausts all distance-1 nodes before any distance-2. In unweighted graphs, "distance" is "hop count" — so the first time a node is discovered, it's via the fewest hops. In weighted graphs, "shortest" means lowest cost; a 2-hop low-weight path could beat a 1-hop high-weight path, but BFS would have committed to the 1-hop already. That's why Dijkstra replaces the queue with a priority queue — to discover by lowest *cost*, not lowest *hop count*.

```
Unweighted:               Weighted:
                          (1-hop, cost=10)
   ┌── 1-hop ── 2-hop      ┌── A ───────── target
A ─┤                      ─┤
   └── 1-hop ── 2-hop      └── B ── C ── target
                              (3-hop, cost=3)

BFS would pick top.       BFS picks top, ignores cheaper 3-hop.
                          Dijkstra picks bottom (lower cost).
```

**Q [arch]: At 1B nodes, can you still BFS?**

A: Memory becomes the question. BFS holds an entire frontier in memory; for a graph with branching factor 10, the frontier at depth 9 has ~10^9 nodes — the queue alone is GBs. Mitigations: (1) bidirectional BFS (search from both source and target, meet in middle), (2) external BFS with disk-backed queues, (3) approximate algorithms (random walks, sampling).

### One-line anchors

- "FIFO queue gives level-order traversal."
- "Optimal for unweighted shortest path."
- "Parent array IS the BFS tree."
- "Generalises to Dijkstra (PQ) and A* (PQ + heuristic)."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a graph with 6 nodes and trace BFS from node 0, showing queue contents at each step.

### Level 2 — Explain it out loud
"How does BFS guarantee shortest path?"

### Level 3 — Apply it to a new scenario
"Find the smallest number of word transformations to turn `cat` into `dog`, where each step changes one letter (`cat → cot → dot → dog`). BFS, Dijkstra, or A*?"

### Level 4 — Defend the decision you'd change
"Would you replace this BFS with DFS for the grid?"

### Quick check
- File? → `src/utils/data_structures/Graph2.ts`.
- Function name? → `breadth_first_search`.
- Time complexity? → O(V + E).

✓ Pass: all three.
