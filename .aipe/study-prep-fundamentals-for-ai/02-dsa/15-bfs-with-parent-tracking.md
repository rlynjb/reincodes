# BFS with parent tracking

**Industry name(s):** Breadth-first search, BFS shortest-path reconstruction, predecessor array
**Type:** Industry standard · Language-agnostic

> Layer-by-layer graph traversal that records each node's parent on first visit, so the caller can walk the parent chain backwards from any node to reconstruct the shortest unweighted path from the start.

**See also:** → 14-graph-adjacency-list.md · → 16-dfs-traversal.md · → 17-dijkstras-shortest-path.md · → 18-state-space-bfs.md

---

## Why care

You've got a `useEffect` that fires off four `fetch` calls when a page mounts. Each response triggers two follow-up fetches (related items, comments) — those resolve and each fires one more (preview thumbnails). You want them all done before showing the page. The naive shape is one big `Promise.all` of nested promises; the cleaner shape is a *queue of pending requests* that you drain in FIFO order, where every completed request can enqueue more. You don't run the deepest request first — you run all the level-1 requests first, then all of level-2, then level-3. Same total work, but you know how far along you are at every moment.

That queue-drain shape is breadth-first search. Not the "search a maze" framing — the *layer-by-layer expansion* framing. Each layer is one hop away from the previous. The "start node" is the page mount; the "edges" are "this response triggers this follow-up." BFS visits everything reachable, in order of how many hops away it is.

**Why you need to answer that question at all:** because once you know the layer each node sits in, you know the shortest *unweighted* path to every reachable node. Layer 0 is the start. Layer 1 is one hop. Layer 2 is two hops. By the time the queue is empty, every node knows its shortest-hop distance from the start. And if every node remembers *who put it in the queue* (its parent), you can walk that parent chain backwards and reconstruct the actual path, not just the distance.

Without parent tracking:
- BFS visits everything but you only get a `visited[]` array — you know what's reachable, not how
- Reconstructing "how did I get from start to node 7" needs a second pass or a re-search
- The grid visualizer can't draw the path, only the search frontier

With parent tracking:
- Every node knows its predecessor on the shortest path from start
- Path reconstruction is `while (cur !== -1) { path.push(cur); cur = parent[cur]; }`
- The `solve_pg_bfs` river-crossing solver reconstructs the move sequence from this chain

BFS-with-parent is the same shape as a `fetch` queue where every response enqueues follow-ups — but each follow-up carries a back-pointer to the request that spawned it, so you can trace any leaf back to the root that started it. The full mechanics are below.

---

## How it works

### Move 1 — The mental model: a FIFO queue draining one layer at a time

Picture an array `queue` that starts with one item — the start node. You loop: take the front item (`queue.shift()`), look at its neighbors, push any never-seen neighbors to the back. Repeat until the queue is empty. By the time you stop, every reachable node has been seen exactly once, in order of distance from the start.

```
Initial state for a 6-node graph, BFS from node 0:

     0 ─── 1 ─── 2
     │     │
     3 ─── 4 ─── 5

  queue:    [0]
  visited:  [T, F, F, F, F, F]
  parent:   [-1, -1, -1, -1, -1, -1]
```

The strategy in one line: process nodes in the order they were *discovered*, not the order their neighbors were *finished*. FIFO is what makes it breadth-first; if you swapped to a stack (LIFO), you'd get depth-first.

### Move 2 — The three parallel arrays

`breadth_first_search` in `Graph2.ts` carries three pieces of state. Each one earns its place.

**Sub-section A: the `visited` array — guard against revisiting**

`visited: boolean[V]` marks each node `true` the moment it's enqueued. Without it, a node with multiple incoming edges (like node 4 in the graph above — reachable from both 3 and 1) would get re-enqueued and re-processed, and a cycle would loop forever.

```
visited's job:
   ┌─────────────────┐
   │ on enqueue:     │
   │ visited[n] = T  │   ← critical: mark BEFORE next iteration
   └─────────────────┘   reads it, not after dequeue
```

If you're coming from React, this is the same idea as a `Set` of "already requested" URLs that a fetch-with-retry hook keeps so it doesn't fire the same request twice. The boundary condition: you mark on *enqueue*, not on *dequeue*. If you mark on dequeue, a node can be enqueued multiple times before it's processed once.

**Sub-section B: the `parent` array — record who put this node in the queue**

`parent: number[V]`, initialized to `-1`. When you enqueue neighbor `n` from current node `u`, you set `parent[n] = u`. The neighbor's parent is whoever discovered it.

```
parent's job:
   for each node n (except start),
     parent[n] = the node that enqueued n
   parent[start] = -1   ← stays at -1; start has no predecessor

   to reconstruct path from start → n:
     cur = n
     while cur !== -1:
       path.unshift(cur)
       cur = parent[cur]
```

The bridge from frontend: this is exactly the `breadcrumb` pattern you'd build for a deep page tree — each child page knows its parent route, and you can walk the chain backwards to render the breadcrumb. The "parent" here isn't the parent in a static tree; it's the parent in the *BFS tree*, which is built dynamically from the order BFS discovered nodes.

The practical consequence: BFS produces a *tree* spanning the reachable nodes, even when the underlying graph has cycles. The "BFS tree" has the start as the root, and every node's parent in the tree is whoever discovered it first. Since BFS discovers nodes in shortest-distance order, every parent-chain is a shortest path.

**Sub-section C: the `queue` — FIFO frontier**

`queue: number[]` starts with `[start]`. The loop pulls from the front with `queue.shift()` and pushes new neighbors to the back. This is the part that distinguishes BFS from DFS — FIFO discipline.

```
Layer expansion (BFS over the 6-node graph from node 0):

step  queue (front → back)   processing  push neighbors      parent updates
────  ────────────────────   ──────────  ──────────────────  ──────────────
init  [0]
 1    [1, 3]                 0           push 1, 3           parent[1]=0
                                                             parent[3]=0
 2    [3, 2, 4]              1           push 2, 4           parent[2]=1
                                         (0 already visited) parent[4]=1
 3    [2, 4]                 3           4 visited; skip     (no update)
 4    [4, 5]                 2           push 5 (via 2→5?    parent[5]=2
                                         actually no, 2 only  (depends on
                                         touches 1)           edges)
 5    [5]                    4           5 already visited;
                                         skip
 6    []                     5           neighbors all
                                         visited
done                         queue empty
```

Wait — the trace above made an error. Let me redo it with the exact graph in the diagram:

```
Graph:   0 ─── 1 ─── 2
         │     │
         3 ─── 4 ─── 5

         adjacency:
           0: [1, 3]
           1: [0, 2, 4]
           2: [1]
           3: [0, 4]
           4: [1, 3, 5]
           5: [4]

BFS from start = 0:

step  queue       dequeue  neighbors visited?  enqueue          parent[]
────  ──────────  ───────  ─────────────────   ───────────      ────────────
init  [0]                                                       [-1,-1,-1,-1,-1,-1]
                                                                visited: [T,F,F,F,F,F]
 1    [1, 3]      0        1:F → enq, mark    parent[1]=0
                           3:F → enq, mark    parent[3]=0       [-1,0,-1,0,-1,-1]
                                                                visited: [T,T,F,T,F,F]
 2    [3, 2, 4]   1        0:T skip
                           2:F → enq, mark    parent[2]=1
                           4:F → enq, mark    parent[4]=1       [-1,0,1,0,1,-1]
                                                                visited: [T,T,T,T,T,F]
 3    [2, 4]      3        0:T skip
                           4:T skip                             (no change)

 4    [4]         2        1:T skip                             (no change)

 5    [4, 5]      —        wait, queue is [4] then we
                           dequeue 4...

(corrected trace)

step  queue       dequeue  neighbors visited?  enqueue          parent[]
────  ──────────  ───────  ─────────────────   ───────────      ────────────
init  [0]                                                       all -1
                                                                visited[0]=T
 1    [1, 3]      0        1:F → enq          parent[1]=0
                           3:F → enq          parent[3]=0
 2    [3, 2, 4]   1        0:T, 2:F→enq,4:F→enq parent[2]=1
                                                parent[4]=1
 3    [2, 4]      3        0:T, 4:T            no enq
 4    [4, 5]      2        1:T                 no enq
 4'   [4]         —        wait. node 2's adj
                           is [1]. So step 4
                           enqueues nothing.

(let me redo from step 4 cleanly)

step  queue       dequeue  process                              parent
────  ──────────  ───────  ─────────────────────────────────    ──────
init  [0]
                  -        visited[0]=T
 1    [1,3]       0        neighbors 1,3 unvisited → enq,        p[1]=0
                           mark visited                          p[3]=0
 2    [3,2,4]     1        neighbors 0(T),2(F→enq),4(F→enq)      p[2]=1
                                                                  p[4]=1
 3    [2,4]       3        neighbors 0(T),4(T) → nothing         —
 4    [4]         2        neighbor 1(T) → nothing               —
 5    [5]         4        neighbors 1(T),3(T),5(F→enq)          p[5]=4
 6    []          5        neighbor 4(T) → nothing               —
done                                                              p=[-1,0,1,0,1,4]
```

Final state:
- `visited = [T, T, T, T, T, T]` — every node reached.
- `parent = [-1, 0, 1, 0, 1, 4]` — each node's BFS-tree parent.
- BFS-tree edges: 0→1, 0→3, 1→2, 1→4, 4→5.

Reconstructing the path from 0 to 5:

```
cur = 5; path = [5]
cur = parent[5] = 4; path = [4, 5]
cur = parent[4] = 1; path = [1, 4, 5]
cur = parent[1] = 0; path = [0, 1, 4, 5]
cur = parent[0] = -1; stop

shortest path 0 → 5 = [0, 1, 4, 5]  (3 hops)
```

Notice the BFS tree doesn't include edge 3-4, even though it exists in the graph — node 4 was discovered via node 1 first, so 1 is its BFS parent. The tree captures *one* shortest path per node; if there are multiple shortest paths, BFS picks the one whose discoverer was earlier in the queue.

### Move 2.5 — Brute force vs optimal (DSA addition)

The "brute force" approach to "find the shortest path from start to every node" is to enumerate every path and take the shortest. The "optimal" approach is BFS with parent tracking.

**The data shape:**

```
Graph (same 6-node example):
   0 ─── 1 ─── 2
   │     │
   3 ─── 4 ─── 5

Goal: for every reachable node, return the shortest path from node 0.
```

**Brute force — enumerate all paths**

```
function shortest_paths_brute(graph, start):
  paths = {}
  for end in 0..V:
    all_paths = enumerate_paths(graph, start, end)   // recursive DFS, no revisits
    paths[end] = min(all_paths, key=length)
  return paths
```

Execution trace for `enumerate_paths(graph, 0, 5)` — exploring every simple path from 0 to 5:

```
step  current  path so far     action
────  ───────  ──────────────  ───────────────────
 1    0        [0]             explore neighbors 1, 3
 2    1        [0,1]           explore 2, 4
 3    2        [0,1,2]         dead end (no path to 5)
 4    4        [0,1,4]         explore 3, 5
 5    3        [0,1,4,3]       dead end
 6    5        [0,1,4,5]       PATH FOUND len=4
 7    3        [0,3]           explore 4
 8    4        [0,3,4]         explore 1, 5
 9    1        [0,3,4,1]       explore 2
10    2        [0,3,4,1,2]     dead end
11    5        [0,3,4,5]       PATH FOUND len=4
(... etc — every simple path)
```

Then repeat for end=1, end=2, end=3, end=4.

Complexity: O(V! / (V-k)!) per pair in the worst case (a complete graph has up to V! simple paths between any two nodes); for sparse graphs it's still exponential. O(V) space per path.

What goes wrong at scale: a 20-node graph with average degree 5 has tens of thousands of simple paths between distant nodes. Doing this for every (start, end) pair is hopeless before V=15.

**Optimal — BFS with parent tracking**

The insight: every node has *exactly one shortest distance* from the start. BFS visits nodes in distance order — distance 1 nodes before distance 2 nodes before distance 3 nodes. So the first time BFS reaches a node, it's via a shortest path. Record the discoverer as the parent, and you can reconstruct that path without ever enumerating non-shortest paths.

```
function bfs(graph, start):
  visited = array of size V, all false
  parent  = array of size V, all -1
  queue   = [start]
  visited[start] = true

  while queue not empty:
    u = queue.shift()                  // FIFO
    for each edge from u to neighbor n:
      if not visited[n]:
        visited[n] = true
        parent[n] = u                  // record discoverer
        queue.push(n)
  return parent
```

Execution trace was walked above — final state `parent = [-1, 0, 1, 0, 1, 4]` after 6 dequeues.

Complexity: O(V + E) time (every node enqueued once, every edge inspected once), O(V) space.

Why it's faster: brute force re-explores the same prefixes thousands of times (the path 0→1→4 gets walked once on the way to 2, once on the way to 5, once on the way to 3). BFS sees each edge exactly twice (once from each endpoint in an undirected graph) and never re-enters a visited node. The `visited` array is the difference between linear and exponential.

**Comparison**

```
┌─────────────────────┬──────────────────────┬──────────────────────┐
│                     │ Brute (enumerate)    │ BFS (parent track)   │
├─────────────────────┼──────────────────────┼──────────────────────┤
│ Time per pair       │ O(V!) worst case     │ O(V + E)             │
│ Time all pairs      │ O(V · V!)            │ O(V · (V+E)) or BFS  │
│                     │                      │ from each start      │
│ Space               │ O(V) recursion stack │ O(V) parent + visited│
│ At V=10, dense      │ ~3.6M paths to enum  │ ~100 edge reads      │
│ Reconstructs path?  │ yes (it's the path)  │ yes (parent chain)   │
│ Handles cycles?     │ requires bookkeeping │ visited[] solves it  │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

**When brute force is fine:** never for shortest paths. It's the right approach when you need to enumerate *all* simple paths (e.g., for a graph-coloring constraint solver), not just find one shortest one.

### Move 3 — The principle

BFS-with-parent is the canonical answer to "shortest path in an unweighted graph." The deeper principle: when the cost of each step is uniform, *order of discovery equals order of distance*. The FIFO queue makes that ordering automatic. Add weights to the steps and the principle breaks — closer-by-hops nodes might not be closer-by-cost, and you need Dijkstra's priority queue to restore the invariant. Strip weights away and BFS is what's left. The full picture is below.

---

## BFS with parent tracking — diagram

```
┌─ State the algorithm carries ─────────────────────────────────┐
│                                                               │
│   queue                visited[]              parent[]        │
│  ┌──────┐             ┌─────────────┐       ┌──────────┐      │
│  │ FIFO │             │ T/F per     │       │ -1 or    │      │
│  │ list │             │ node        │       │ predecessor│    │
│  └──┬───┘             └──────┬──────┘       └────┬─────┘      │
│     │                        │                   │            │
│     │ shift  (dequeue)       │ guard against     │ chain      │
│     │                        │ re-enqueue        │ reconstructs│
│     ▼                        │                   │ path        │
│  ┌──────────────────────┐    │                   │            │
│  │ pull current node    │    │                   │            │
│  └──────────┬───────────┘    │                   │            │
│             │ for each       │                   │            │
│             ▼ neighbor n     │                   │            │
│  ┌──────────────────────┐    │                   │            │
│  │ if !visited[n]:      │◀───┘                   │            │
│  │   visited[n] = true  │                        │            │
│  │   parent[n] = current│ ───────────────────────┘            │
│  │   queue.push(n)      │                                     │
│  └──────────────────────┘                                     │
└───────────────────────────────────────────────────────────────┘

         BFS layer expansion (visualised)

  start (layer 0)        ●  node 0
                         │
  one hop  (layer 1)     ●─────●   nodes 1, 3
                         │     │
  two hops (layer 2)     ●  ●  ●   nodes 2, 4
                                │
  three hops (layer 3)          ●  node 5

  parent edges in the BFS tree:
    0→1, 0→3, 1→2, 1→4, 4→5
```

---

## In this codebase

**File:** `src/utils/data_structures/Graph2.ts`
**Function:** `breadth_first_search` (exported as a free function, not a method)
**Lines:** L201–L225

**Study notebook reference:** `src/utils/notes/Graph/BFSTraversal.ts` — standalone BFS traversal kept outside the `Graph2` class; useful for reading the queue + visited-array bookkeeping without the parent-array reconstruction logic that the visualizer needs.

Trimmed shape:

```
export const breadth_first_search = (g, start) => {
  const visited = new Array(g.numNodes).fill(false);
  const parent  = new Array(g.numNodes).fill(-1);
  const queue   = [];

  queue.push(start);
  visited[start] = true;

  while (queue.length > 0) {
    const index   = queue.shift();
    const current = g.nodes[index];

    for (const edge of current.getEdgeList()) {     // sorted edge list
      const neighbor = edge.toNode;
      if (!visited[neighbor]) {
        queue.push(neighbor);
        visited[neighbor] = true;                   // mark on enqueue
        parent[neighbor] = index;
      }
    }
  }
  return parent;
}
```

A few notes worth pinning:

- The function returns `parent`, not `visited`. The intent is that callers reconstruct a path. `solve_pg_bfs` (the river-crossing solver) is exactly that caller — see `src/utils/data_structures/River_crossing_puzzles/PG.ts` L164.
- `Array.shift()` is O(n) in JavaScript — the entire array gets index-shifted by one. For visualizer-sized graphs (≤ ~200 nodes) this is invisible; at 100k+ nodes it dominates. The right fix is a deque or a two-index ring buffer.
- The author comment at L189–L191 records the IK rename: `seen → visited`, `last → parent`, `pending → queue`. The choice to return `parent` is explicitly so it can drive shortest-path reconstruction.

**Other BFS sites that don't return parent:**

- `Graph.ts` `bfs_traversal` L160–L224 — returns visit order, not parent. Used for connected-component counting.
- `Graph.ts` `numberOfConnectedComponents` L332–L369 — runs BFS from every unvisited node, counts how many independent components.
- `Graph.ts` `isGraphValidTree` L389–L467 — does track parent, but to detect cycles (cross edges), not to reconstruct paths.

**Call sites:**

- `src/utils/data_structures/River_crossing_puzzles/PG.ts` L164 — `solve_pg_bfs` imports and calls it
- `src/app/graphs/grid/page.tsx` L117–L147 — inlines its own animated version for BFS visualization (calls `setHighlight` and `await delayLoop(timer)` between steps)

---

## Elaborate

### Where this pattern comes from

Breadth-first search was named and analysed by Edward F. Moore in 1959 (for solving maze-pathfinding for telephone-switching networks) and independently by Konrad Zuse in his unpublished 1945 work. It's older than most algorithms taught alongside it — depth-first search was studied earlier in graph theory but BFS came first as a *shortest-path* algorithm. The "parent array for reconstruction" trick has no single attribution; it's just what falls out the moment you ask "how do I reconstruct the path, not just the distance?"

### The deeper principle

Order of discovery equals order of distance, when steps are uniform. FIFO is the data structure that enforces "discover in order." Swap to LIFO and you get DFS (depth-first), where order of discovery has nothing to do with distance. Swap to a priority queue with weights and you get Dijkstra, where order of *cheapest-to-extract* equals order of weighted distance.

```
┌─ The same algorithm, three orderings ──────────────────────┐
│                                                            │
│  Frontier type    Discovery order        Algorithm         │
│  ──────────────   ───────────────────    ─────────────     │
│  FIFO queue       hop distance           BFS               │
│  LIFO stack       branch depth           DFS               │
│  Priority queue   weighted cost          Dijkstra          │
│                                                            │
│  All three: explore from the start, mark visited,          │
│  enqueue unvisited neighbors. The only difference is       │
│  which item you extract next.                              │
└────────────────────────────────────────────────────────────┘
```

### Where this breaks down

When edges have non-uniform weights, BFS finds shortest *hop count* but not shortest *cost* — you need Dijkstra. When the graph is implicit and infinite (state-space search), you can't initialise `visited` as a fixed-size array; you need a hash set keyed by state. When the state space is so large that BFS would explore most of it before finding the goal, you need heuristic guidance (A*, IDA*). And when memory is the bottleneck, BFS's O(V) frontier is a hard ceiling; iterative-deepening DFS trades time for space.

### What to explore next

- DFS traversal → 16-dfs-traversal.md → same template, LIFO instead of FIFO
- Dijkstra → 17-dijkstras-shortest-path.md → BFS extended with weighted edges
- State-space BFS → 18-state-space-bfs.md → BFS over an implicit graph generated on the fly
- A* search → BFS + Dijkstra + a heuristic; the standard algorithm for grid pathfinding with diagonals/terrain

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬─────────────────────┬───────────────────────┐
│ Cost dimension   │ BFS w/ parent       │ DFS w/ parent         │
│                  │ (taken)             │ (alternative)         │
├──────────────────┼─────────────────────┼───────────────────────┤
│ Time             │ O(V + E)            │ O(V + E)              │
│ Space            │ O(V) frontier       │ O(V) recursion stack  │
│ Worst frontier   │ wide layer (~V)     │ deep chain (~V)       │
│ Shortest path?   │ yes (unweighted)    │ no (any reachable     │
│                  │                     │   path; not shortest) │
│ Recursive?       │ no (queue)          │ usually yes           │
│ Stack overflow?  │ never               │ at ~10k nodes deep    │
│ Cycle handling   │ visited[]           │ visited[]             │
└──────────────────┴─────────────────────┴───────────────────────┘
```

### What we gave up

`Array.shift()` is O(n). Every dequeue shifts the entire array left by one slot. For a 196-node grid the total cost is O(V²) = ~40,000 ops, invisible. For 100,000 nodes it's 10 billion ops, which would take seconds. The honest fix is `dequeue` via a head index and `queue[headIndex++]` instead of `shift()`. The reincodes visualizer never hits this ceiling.

Memory. BFS holds the entire frontier of "discovered but not yet processed" nodes. On a worst-case graph (a binary tree where the deepest layer has V/2 nodes), the queue can grow to ~V/2. DFS holds the *path* from root to current — at most O(depth) frames. For shallow-but-wide graphs BFS uses more memory; for deep-but-narrow graphs DFS does.

### What the alternative would have cost

If `breadth_first_search` had been DFS instead:

```
DFS would find *a* path from 0 to 5: maybe [0, 1, 2, ...] going as deep as possible
                                     first. Then backtracking when it dead-ends.
                                     The path it returns is NOT shortest.
```

The grid pathfinder and the river-crossing solver both depend on shortest paths. DFS would happily return a 47-move river-crossing solution when an 11-move solution exists. The whole *point* of `solve_pg_bfs` is to find the minimum number of crossings. Substituting DFS would collapse the feature.

### The breakpoint

Fine until the graph gets large enough that `Array.shift()`'s O(n) per dequeue matters — roughly 50k+ nodes. Fine until the graph becomes weighted, at which point shortest-hops ≠ shortest-cost and the answer is Dijkstra. Fine until the state space is too large to materialize, at which point you need lazy expansion (which is what `solve_pg_bfs` already does — see 18-state-space-bfs.md).

### What wasn't actually a tradeoff

A bidirectional BFS (search from both start and goal, meet in the middle) — that's only worth doing when you know both endpoints up front. `solve_pg_bfs` does know both endpoints, so bidirectional BFS *could* halve the explored states. Whether that earns its place depends on state-space size: at 16 reachable states in the river-crossing puzzle, the overhead of running two searches exceeds the savings. At a 15-puzzle's 10^13 states, it would be essential.

---

## Tech reference (industry pairing)

### Plain JS `Array` as a queue

- **Codebase uses:** `const queue = []; queue.push(...); queue.shift();` in `breadth_first_search` L204, L206, L210.
- **Why it's here:** the FIFO discipline that distinguishes BFS from DFS. `push` to back, `shift` from front.
- **Leading today:** plain `Array` for in-memory queues — adoption-leading, 2026, in any interview or visualizer context where V is small.
- **Why it leads:** zero dependency, debuggable, matches whiteboard intuition. Every algorithms course uses it.
- **Runner-up:** `@datastructures-js/queue` or a custom ring-buffer dequeue. Worth reaching for when V exceeds ~50k and `Array.shift()`'s O(n) starts dominating. None of the reincodes pages get close.

### `getEdgeList()` for sorted neighbor iteration

- **Codebase uses:** `current.getEdgeList()` at `Graph2.ts` L213, which calls `Node2.getEdgeList()` L52–L61 and returns edges sorted by neighbor index.
- **Why it's here:** deterministic BFS order. Without sorting, JS object key iteration order would still be insertion-order, which is fine but couples BFS output to insertion sequence — sorting makes the BFS tree reproducible regardless of how edges were added.
- **Leading today:** sorted neighbor iteration is the standard approach when you want deterministic results — adoption-leading.
- **Why it leads:** reproducible output for visualizers, tests, and shortest-path comparisons across runs.
- **Runner-up:** unsorted insertion-order iteration. Slightly faster (no allocation of a sorted copy), useful when reproducibility doesn't matter.

---

## Summary

BFS visits every reachable node in layer order — distance from the start — using a FIFO queue and a `visited` array. Adding a `parent` array, updated the moment each node is enqueued, turns BFS into a shortest-path algorithm: the parent chain backwards from any node reconstructs the actual path from the start. `breadth_first_search` in `Graph2.ts` is the canonical implementation; `solve_pg_bfs` in the river-crossing puzzle is the canonical consumer. The constraint that made BFS the right call is that every step in the river-crossing puzzle and the grid pathfinder costs the same — one move — so shortest-by-hops equals shortest-by-cost. The cost is O(V) frontier memory and O(V) `parent` array, plus the O(V²) total cost of `Array.shift()` that the visualizer never feels.

- BFS uses FIFO; FIFO enforces layer-by-layer expansion; layer order equals shortest-hop order.
- The `visited` array prevents revisits and infinite loops; mark on enqueue, not dequeue.
- The `parent` array records each node's discoverer; walk it backwards to reconstruct paths.
- BFS finds shortest *unweighted* paths. For weighted edges, swap the queue for a priority queue (Dijkstra).
- `Array.shift()` is O(n); the visualizer's small graphs make this invisible but it's the first bottleneck at scale.

---

## Interview defense

### What an interviewer is really asking

When the interviewer asks "find the shortest path in this graph," they're checking three things: do you reach for BFS (not DFS), do you remember why BFS gives shortest paths (FIFO + uniform step cost), and do you track parents so you can return the actual path? Anyone who returns just the distance is missing the point of the question.

### Likely questions

[mid] Q: How does BFS find the shortest path?

A: BFS visits nodes in the order they were *discovered* — and because it uses a FIFO queue, that order is also the order of distance from the start. The first time BFS reaches a node, it's via a shortest path. If I record `parent[neighbor] = currentNode` on every enqueue, I can walk the parent chain backwards from any node to reconstruct that path. This works when every step costs the same; for weighted edges I'd need Dijkstra.

Diagram:

```
BFS layer expansion from start = 0

         layer 0:       [0]            ← start
                          │
         layer 1:       [1, 3]          ← one hop
                         │   │
         layer 2:       [2, 4]          ← two hops
                            │
         layer 3:        [5]            ← three hops

  First time a node is dequeued = its shortest distance.
  parent[5] = 4, parent[4] = 1, parent[1] = 0
  → reconstruct: 5 ← 4 ← 1 ← 0
```

[senior] Q: Why does `breadth_first_search` mark `visited[neighbor] = true` when it enqueues, not when it dequeues?

A: If you mark on dequeue, a node with multiple incoming edges can get enqueued multiple times before it's processed once. Imagine node 4 reachable from both 1 and 3. Process 1 first, push 4. Process 3 next, see 4 not visited, push 4 again. Now 4 is in the queue twice — wasted work, and worse, `parent[4]` gets overwritten when 4 is finally dequeued and re-examines its neighbors. Marking on enqueue is the invariant: a node enters the queue exactly once, in the order of its shortest distance.

Diagram:

```
Mark-on-enqueue vs mark-on-dequeue

  Mark-on-enqueue (taken)         Mark-on-dequeue (buggy)

  visited[n] = T at push         visited[n] = T at shift
       │                                │
       ▼                                ▼
  queue holds each n once         queue can hold n twice
  parent[n] set once              parent[n] possibly overwritten

  ✓ each node processed once      ✗ duplicate work
  ✓ parent stays consistent       ✗ parent chain can break
```

[arch] Q: The river-crossing puzzle has 16 reachable states. What would change in `solve_pg_bfs` if you swapped it for the 15-puzzle, which has ~10^13 reachable states?

A: Three things break. The `Graph2` accumulator that grows during search becomes a memory hog — 10^13 `Node2` objects can't fit anywhere. The `visited` dict keyed by `state.toString()` becomes a billion-key hashmap. And BFS without guidance explores most of the state space before finding the goal; you'd want A* with a heuristic (Manhattan distance for the 15-puzzle) to cut the explored set by 99%+. The right move is bidirectional A* with a transposition table, not BFS scaled up.

Diagram:

```
What breaks first at 10^13 state-space nodes

┌─ Materialised graph ────────────────────────────┐
│  Graph2.insertNode()  ◀── BREAKS: can't allocate│
│  10^13 Node2 objects     even 0.0001% of them   │
└─────────────────────────────────────────────────┘
┌─ visited hash table ────────────────────────────┐
│  state→index dict     ◀── BREAKS: too large to  │
│                           keep in RAM           │
└─────────────────────────────────────────────────┘
┌─ Search strategy ───────────────────────────────┐
│  uninformed BFS       ◀── BREAKS: explores most │
│                           of state space        │
└─────────────────────────────────────────────────┘
                          │
                          ▼
                  Switch to A* with
                  Manhattan-distance
                  heuristic. Drop the
                  materialised graph;
                  expand states lazily.
```

### The question candidates always dodge

Q: Your BFS returns `parent`, not the path itself. If the caller has to reconstruct the path anyway, why not just return the path directly?

A: Because BFS finds shortest paths to *every* reachable node in one pass, not just one. Returning a single path commits the algorithm to one target, which defeats the point of running BFS in the first place. Look at `solve_pg_bfs` — it runs BFS once from the initial state, then looks up the goal state's index and reconstructs *that one* path. If a future feature asks "show me the shortest path to every intermediate state for debugging," the parent array already has all of them; returning a single path would force a re-run per target. The reconstruction is two lines (`while (cur !== -1) { path.push(cur); cur = parent[cur]; }`), and it's the caller's choice of which target. That's the contract that earns its place.

Diagram:

```
Why BFS returns parent[] instead of a single path

         single path                parent[]
         ───────────                ────────

  BFS run                    BFS run
       │                          │
       ▼                          ▼
   [0,1,4,5]                parent = [-1, 0, 1, 0, 1, 4]
   (path to one target)     (predecessor of every node)
                                  │
                                  │ caller picks target
                                  ▼
                            reconstruct path to ANY node
                            in 2 lines, no re-run

  Re-run for each new target?      Run once, reconstruct anywhere.
  No. The data is already there.
```

### One-line anchors

- "FIFO is what makes it breadth-first; LIFO would make it depth-first."
- "Mark visited on enqueue, not dequeue — that's the invariant that prevents duplicate work."
- "BFS gives shortest *unweighted* paths; weighted edges need Dijkstra."
- "Return `parent[]`, not the path — one BFS run, every shortest path reconstructable on demand."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the 6-node graph from the trace (`0-1-2`, `0-3`, `1-4`, `3-4`, `4-5`). Then run BFS from node 0 on paper. At each step, write down: which node is being dequeued, the current `queue`, the updated `parent` array.

Open the file. Compare with the trace.

✓ Pass: final `parent = [-1, 0, 1, 0, 1, 4]` and your queue trace matches step-by-step.
✗ Fail: re-read Move 2 sub-section C, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain `breadth_first_search` from `Graph2.ts` to an imaginary colleague who just asked "wait, why do you mark visited *before* the next iteration of the loop?" No notes. Under 90 seconds.

Checkpoints — did you:
- Name the specific file and function?
  → `src/utils/data_structures/Graph2.ts`, `breadth_first_search` L201–L225
- Explain why marking on enqueue (not dequeue) prevents double-enqueueing?
- Name the tradeoff (`Array.shift()` is O(n); irrelevant for visualizer sizes)?

### Level 3 — Apply it to a new scenario

Without looking at the file, answer:

The grid pathfinder is rewritten to handle a *weighted* terrain: grass costs 1, mud costs 5, water costs 10. The user clicks "find shortest path." Does the current `breadth_first_search` still work? What breaks, and what's the minimal change?

Write your answer. 3–5 sentences minimum. Then open `src/utils/data_structures/Graph2.ts` L201–L225 and `src/utils/data_structures/DijkstrasAlgorithm.ts` L1–L55 to check.

### Level 4 — Defend the decision you'd change

The biggest tradeoff in this file is BFS vs DFS, and within BFS, return-parent vs return-path. Answer in writing:

"If you were writing `breadth_first_search` from scratch today for the river-crossing solver, would you keep the parent-array API, or change it to return the full path? Why? What does that change cost in the call sites?"

Reference the actual code when you answer:
- Point to `breadth_first_search` L201–L225 for the current API
- Point to `solve_pg_bfs` L164–L196 to see what the caller does with the parent array

### Quick check — code reference test

Without opening any files, answer:
- What file defines `breadth_first_search`?
- What does it return?
- What's the worst-case time complexity?

Then open the file and verify.

✓ Pass: you named the file (`src/utils/data_structures/Graph2.ts`) and the return value (`parent` array).
✓ Pass: you said O(V + E).
✗ Fail on lines: that's fine — line numbers change.
