# Graph: adjacency list representation

**Industry name(s):** Adjacency list, sparse graph representation
**Type:** Industry standard · Language-agnostic

> The data shape underneath every graph algorithm in this codebase — nodes hold a dictionary of their neighbors, not a row of an n×n matrix.

**See also:** → 15-bfs-with-parent-tracking.md · → 16-dfs-traversal.md · → 17-dijkstras-shortest-path.md · → 18-state-space-bfs.md

---

## Why care

You're building a "Who follows whom" page for a social app. You've got 10,000 users. The natural shape is a map: `Record<UserId, UserId[]>` — for each user, the array of accounts they follow. You write the loop that renders the page: for the current user, look up their follow list (one map lookup), iterate it, render a row per followee. Fast, obvious, fine.

Now imagine you'd done it the other way. One big `boolean[10000][10000]` matrix where `m[a][b] === true` if A follows B. Same information, technically. But to render the current user's follows, you'd scan their entire row — 10,000 boolean checks to find the dozen `true` values. And you'd be holding 100 million booleans in memory for a graph where the average user follows ~50 people.

The question that scenario answers is *which shape to use when storing the edges of a graph*. Not how to traverse them, not how to find shortest paths — just *where the edges live in memory*. The adjacency list is the same `Record<NodeId, NodeId[]>` you built for the follow page. The adjacency matrix is the 10000×10000 boolean grid you'd never actually write but textbooks insist on showing first.

**Why you need to answer that question at all:** because every graph operation in reincodes — BFS in `breadth_first_search`, DFS in `dfs_traversal`, Dijkstra in `DijkstrasAlgorithm`, the state-space BFS in `solve_pg_bfs` — iterates neighbors. *How fast you can iterate `node X's neighbors`* is the inner loop of all of them. The adjacency list makes that O(degree); the matrix makes it O(V). For sparse graphs (most real graphs), the difference is two or three orders of magnitude.

Without an adjacency list:
- Every neighbor iteration is O(V) — scan a whole row, mostly `false`
- Space is O(V²) — 100 million cells for 10k nodes
- Adding a new node means re-allocating the matrix

With an adjacency list:
- Neighbor iteration is O(degree) — touch only the actual neighbors
- Space is O(V + E) — proportional to what's actually there
- Adding a new node is `nodes.push(new Node2(...))`

The adjacency list is the same `Record<UserId, UserId[]>` you'd build for any "group X by Y" page — applied to graph edges. The full mechanics are below.

---

## How it works

### Move 1 — The mental model: a `Record<NodeId, NodeId[]>`

Picture the data structure you'd reach for if someone said "give me a list of todos grouped by status." You'd write:

```
const groups: Record<Status, Todo[]> = {};
for (const todo of todos) {
  (groups[todo.status] ??= []).push(todo);
}
```

An adjacency list is the same shape, applied to graph edges. For each node, store the array of nodes it's directly connected to. To get the neighbors of node 3, look up `adj[3]` — one map lookup, then iterate.

```
adjacency list for the graph below

       0 ─── 1 ─── 2
             │
             3 ─── 4

  adj[0] = [1]
  adj[1] = [0, 2, 3]
  adj[2] = [1]
  adj[3] = [1, 4]
  adj[4] = [3]
```

The strategy in one line: store edges where you'll need to read them — under the node they leave from — not in a big symmetric grid that mostly contains zeros.

### Move 2 — Two list shapes in this codebase

The repo has two adjacency-list classes: `Graph` (`src/utils/data_structures/Graph.ts`) and `Graph2` (`src/utils/data_structures/Graph2.ts`). They store the same idea differently. Walk both.

**Sub-section A: `Graph` — flat adjacency list, integer keys**

`Graph` stores neighbors as a 2D array of integers: `adjList: number[][]`. For node `u`, `adjList[u]` is the array of neighbor indices.

```
Graph (older form)
─────────────────────────────
adjList: number[][]
   ┌─────────┬─────────────────────┐
   │ index 0 │ [1]                 │
   │ index 1 │ [0, 2, 3, 4]        │  ← node 1's neighbors
   │ index 2 │ [1]                 │
   │ index 3 │ [1, 5]              │
   │ index 4 │ [1]                 │
   │ index 5 │ [3]                 │
   └─────────┴─────────────────────┘
```

If you're coming from frontend, this is the `[][]` you'd use to render a grouped list — outer index is the group, inner array is the members. To find node 3's neighbors: `adjList[3]` returns `[1, 5]`, iterate it. To check if 3 is adjacent to 5: scan `adjList[3]` for the value 5 — O(degree), not O(1).

**Practical consequence:** the inner array is unweighted. Edges don't carry weight, direction, or labels — they're just "node X connects to node Y." `Graph` is the right shape for unweighted traversal (BFS for connected components, DFS for cycle detection, the Eulerian-cycle checks). It's wrong for shortest-path-with-weights.

`Graph` builds itself from an *edge list* — `[[0,1], [1,2], ...]` — and converts it to an adjacency list at construction time (`displayAdjacencyList` L286–L301).

**Sub-section B: `Graph2` — list of `Node2` objects, edge objects with weights**

`Graph2` stores nodes as objects. Each `Node2` carries an `edges` map keyed by neighbor index, whose values are `Edge` objects holding the weight.

```
Graph2 (the "from book" form)
─────────────────────────────────────────────
nodes: Node2[]
   ┌──────────────────────────────────────┐
   │ Node2 { index: 0, edges: {...} }     │
   └──────────────────────────────────────┘
   ┌──────────────────────────────────────┐
   │ Node2 {                              │
   │   index: 1,                          │
   │   edges: {                           │
   │     0: Edge { fromNode:1, toNode:0,  │
   │              weight:3.0 }            │
   │     2: Edge { fromNode:1, toNode:2,  │
   │              weight:7.0 }            │
   │   }                                  │
   │ }                                    │
   └──────────────────────────────────────┘
```

The bridge from frontend: if `Graph`'s adjacency list is `Record<NodeId, NodeId[]>`, then `Graph2`'s is `Record<NodeId, Record<NeighborId, EdgeData>>`. Same pattern, one extra layer because each edge now carries fields (weight, direction). The same thing you'd do if a todo's tags needed extra metadata: `Record<TodoId, Record<TagId, TagData>>`.

**Practical consequence:** weights live in the edge object, so the same data structure serves unweighted traversal (BFS, DFS) and weighted shortest-path (Dijkstra). `getEdgeList()` returns the edges as an array sorted by neighbor index; the `breadth_first_search` function in the same file iterates that list and reads `edge.toNode`.

```
Edge addressing in Graph2

graph.nodes[1].edges[2]
       ▲       ▲    ▲
       │       │    └── neighbor's index (key)
       │       └────────── object literal of edges
       └────────────────── array of all nodes

returns: Edge { fromNode: 1, toNode: 2, weight: 7.0, direction: '' }
```

`Graph2` also carries Node2 fields the grid pages set later: `row`, `column`, `obstacle`. The class accepts the abuse — every field is typed `any` — because the visualizer needs to stash render-time metadata on the nodes without subclassing.

### Move 2.5 — Brute force vs optimal (DSA addition)

The "brute force" representation for graphs is the adjacency matrix. The "optimal" representation for sparse graphs is the adjacency list. Walk both side by side.

**The data shape:**

```
Graph with 5 nodes and 4 edges (undirected):
       0 ─── 1 ─── 2
             │
             3 ─── 4

Brute force (adjacency matrix):
       0  1  2  3  4
   0 [ 0  1  0  0  0 ]
   1 [ 1  0  1  1  0 ]
   2 [ 0  1  0  0  0 ]
   3 [ 0  1  0  0  1 ]
   4 [ 0  0  0  1  0 ]

Optimal (adjacency list):
   adj[0] = [1]
   adj[1] = [0, 2, 3]
   adj[2] = [1]
   adj[3] = [1, 4]
   adj[4] = [3]
```

**Brute force — adjacency matrix**

```
class GraphMatrix:
  matrix: boolean[V][V]              // V×V grid of booleans

  addEdge(u, v):
    matrix[u][v] = true              // O(1)
    matrix[v][u] = true              // O(1) for undirected

  neighbors(u):
    result = []
    for i in 0..V:                   // scan entire row
      if matrix[u][i]:
        result.push(i)
    return result                    // O(V)

  isEdge(u, v):
    return matrix[u][v]              // O(1)
```

Execution trace for `neighbors(1)` on the 5-node graph above:

```
step  i  matrix[1][i]  action
────  ─  ────────────  ─────────────
 1    0  true          push 0 → result = [0]
 2    1  false         skip
 3    2  true          push 2 → result = [0, 2]
 4    3  true          push 3 → result = [0, 2, 3]
 5    4  false         skip
 (5 row reads, 3 useful)
```

Complexity: O(V) per neighbor lookup, O(V²) space.

What goes wrong at scale: at V=10,000 with average degree 50, the matrix is 100,000,000 booleans (12.5 MB even as a packed bitfield, 100 MB as JS booleans). Every BFS step touches 10,000 cells to find ~50 neighbors. That's 99.5% wasted work per step.

**Optimal — adjacency list**

The insight: most graphs are sparse — average degree is way less than V. The matrix stores a `false` for every non-edge. If you only store edges where they exist, you stop paying for non-edges entirely.

```
class GraphList:
  adj: NodeId[][]                    // array of arrays

  addEdge(u, v):
    adj[u].push(v)                   // O(1) amortized
    adj[v].push(u)                   // O(1)

  neighbors(u):
    return adj[u]                    // O(1), already there

  isEdge(u, v):
    return adj[u].includes(v)        // O(degree)
```

Execution trace for `neighbors(1)`:

```
step  action
────  ─────────────
 1    return adj[1]
       → [0, 2, 3]   (3 reads, 3 useful)
```

Complexity: O(degree) per neighbor lookup, O(V + E) space.

Why it's faster: you stopped scanning non-edges. For neighbor iteration — which is the inner loop of every graph algorithm in this codebase — list is `(degree / V)` cheaper. With degree=50, V=10000, that's 200× faster per step.

**Comparison**

```
┌─────────────────────┬──────────────────┬──────────────────┐
│                     │ Adjacency matrix │ Adjacency list   │
├─────────────────────┼──────────────────┼──────────────────┤
│ Space               │ O(V²)            │ O(V + E)         │
│ Add edge            │ O(1)             │ O(1)             │
│ Remove edge         │ O(1)             │ O(degree)        │
│ isEdge(u, v)        │ O(1)             │ O(degree)        │
│ neighbors(u)        │ O(V)             │ O(degree)        │
│ V=10,000, E=500k    │ 100M cells       │ 510k cells       │
│ BFS over whole graph│ O(V²)            │ O(V + E)         │
└─────────────────────┴──────────────────┴──────────────────┘
```

**When brute force is fine:** when the graph is *dense* (E close to V²), like a 30×30 grid of cells with all-pairs distances — the matrix is the same size as the list anyway. Or when `isEdge(u, v)` is the dominant operation and you can't afford O(degree) lookups; matrix's O(1) check wins. The grid visualizers in `/graphs/grid` and `/graphs/finding-shortest-path` happen to use `Graph2`'s adjacency list even for grids — they're losing matrix's O(1) edge check, but they trade it for the per-node `row`, `column`, `obstacle` metadata that the matrix can't carry.

### Move 3 — The principle

Pick your data structure to match where the inner loop is. Almost every graph algorithm's inner loop is *iterate the neighbors of the current node*. Optimize that, and everything downstream gets faster. The general principle: if your hottest operation is "look up the things attached to X," your storage should be keyed by X. This is the same insight behind index-by-foreign-key in databases, key-prop in React reconciliation, and grouping by a field before rendering a list. The reader has built versions of this pattern dozens of times without naming it. The full picture is below.

---

## Adjacency-list shape — diagram

```
┌─ Graph2 (the canonical form used by BFS, DFS, Dijkstra) ───────┐
│                                                                │
│  Graph2                                                        │
│  ├── numNodes: 5                                               │
│  ├── undirected: true                                          │
│  └── nodes: Node2[]                                            │
│                                                                │
│       ┌─────────────────────────────────────────────┐          │
│       │ index: 0    label: null    row/column/      │          │
│       │                            obstacle (opt)   │          │
│       │ edges: {                                    │          │
│       │   1: Edge { fromNode:0, toNode:1, weight:_ }│          │
│       │ }                                           │          │
│       └─────────────────────────────────────────────┘          │
│                                                                │
│       ┌─────────────────────────────────────────────┐          │
│       │ index: 1                                    │          │
│       │ edges: {                                    │          │
│       │   0: Edge { ..., toNode:0, ... }            │          │
│       │   2: Edge { ..., toNode:2, ... }            │          │
│       │   3: Edge { ..., toNode:3, ... }            │          │
│       │ }                                           │          │
│       └─────────────────────────────────────────────┘          │
│       (... one Node2 per index)                                │
│                                                                │
│  Reading the neighbors of node 1:                              │
│                                                                │
│  graph.nodes[1].getEdgeList()                                  │
│       │                                                        │
│       ▼ returns sorted array of Edge objects                   │
│  [ Edge → 0, Edge → 2, Edge → 3 ]                              │
│       │                                                        │
│       ▼ each algorithm reads edge.toNode (and edge.weight      │
│         when it cares — Dijkstra does, BFS doesn't)            │
└────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `src/utils/data_structures/Graph2.ts`
**Class:** `Edge`
**Lines:** L7–L19

**Class:** `Node2`
**Lines:** L21–L62

**Class:** `Graph2`
**Lines:** L64–L178

The `Graph2` constructor pre-allocates the node array:

```
constructor(numNodes, undirected = false) {
  this.numNodes = numNodes;
  this.undirected = undirected;
  this.nodes = Array.from({ length: numNodes }, (_, j) => new Node2(j));
}
```

`insertEdge` (L102–L117) calls `Node2.addEdge` (L44) which writes `this.edges[neighbor] = new Edge(...)`. For undirected graphs, both endpoints get the edge.

**File:** `src/utils/data_structures/Graph.ts`
**Class:** `Graph`
**Lines:** L50–L593

`displayAdjacencyList` (L286–L301) converts an edge list to a 2D array. `addEdge` (L70–L76) pushes into both endpoints' arrays for undirected graphs. The traversal methods (`bfs_traversal` L160–L224, `dfs_traversal` L241–L273, `numberOfConnectedComponents` L332–L369) all iterate `this.adjList[u]` directly.

**Call sites:**
- `src/app/graphs/network/page.tsx` L68 — `new Graph(n, edgeList)` for the D3 network diagram
- `src/app/graphs/grid/page.tsx` L86 — `new Graph2(numNodes, true)` for the grid
- `src/app/graphs/finding-shortest-path/page.tsx` L86 — same for the Dijkstra grid
- `src/utils/data_structures/River_crossing_puzzles/PG.ts` L94 — `new Graph2(0, true)` then grown via `insertNode` as state-space BFS discovers new states

---

## Elaborate

### Where this pattern comes from

The adjacency list / adjacency matrix split is roughly as old as graph theory's encounter with computers — Robert Sedgewick's textbooks formalized the tradeoff in the 1980s, and every algorithms course since has covered it in week one of graph algorithms. The naming is direct: "adjacent" means "directly connected by an edge." A list of adjacent nodes per node = adjacency list. A matrix indicating adjacency for every pair = adjacency matrix.

### The deeper principle

Store data where it'll be read. The matrix stores edges in a layout optimized for `isEdge(u, v)` — direct cell access. The list stores edges in a layout optimized for `neighbors(u)` — pre-grouped under the node. Which one is "right" depends entirely on which operation dominates the inner loop. Almost every graph algorithm worth knowing iterates neighbors; the few that don't (transitive closure with Warshall's algorithm, matrix-multiplication-based reachability) genuinely want the matrix.

```
┌─ Generalised: storage layout matches hot operation ─────────┐
│                                                             │
│  Hot operation             Right shape                      │
│  ──────────────────────    ─────────────────────────        │
│  "neighbors of X"          group-by-X                       │
│  "is X linked to Y"        matrix (constant-time pair)      │
│  "any edge with weight W"  edge list, sorted by weight      │
│  "shortest edge from X"    priority queue per node          │
└─────────────────────────────────────────────────────────────┘
```

### Where this breaks down

When the graph is dense, the matrix wins on both space and cache locality. When edges carry many attributes and are frequently mutated (add weight, remove, re-add), the list of `Edge` objects becomes object-allocation-heavy and the matrix's flat layout is faster. When you need *all pairs* shortest paths — Floyd-Warshall is `O(V³)` either way, but on a matrix the inner loop is a contiguous memory scan; on a list it chases pointers.

### What to explore next

- BFS with parent tracking → 15-bfs-with-parent-tracking.md → the canonical neighbor-iteration loop
- DFS traversal → 16-dfs-traversal.md → the same neighbor loop, with recursion instead of a queue
- Dijkstra's shortest path → 17-dijkstras-shortest-path.md → why `Edge.weight` matters
- State-space BFS → 18-state-space-bfs.md → adjacency list grown lazily during search

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬─────────────────────┬───────────────────────┐
│ Cost dimension   │ Adjacency list      │ Adjacency matrix      │
│                  │ (Graph2 — taken)    │ (not used)            │
├──────────────────┼─────────────────────┼───────────────────────┤
│ Space            │ O(V + E)            │ O(V²)                 │
│ For 14×14 grid   │ ~700 cells          │ 38,416 cells          │
│ neighbors(u)     │ O(degree) ≤ 4       │ O(V) = 196 cells      │
│ isEdge(u, v)     │ O(degree)           │ O(1)                  │
│ Add node         │ O(1) push           │ O(V) reallocation     │
│ Animation        │ iterate sorted      │ iterate fixed row     │
│                  │ edge list           │ order                 │
│ Per-node fields  │ free (it's an obj)  │ separate parallel array│
│ Cache locality   │ pointer-chase       │ contiguous            │
└──────────────────┴─────────────────────┴───────────────────────┘
```

### What we gave up

`isEdge(u, v)` becomes O(degree) instead of O(1). In practice the only place this would hurt is a hypothetical "are these two grid cells connected" check during obstacle placement, and the grid already tracks obstacles by `(row, column)` separately — the `obstacle` field on `Node2` is the real check, not edge existence.

Cache locality. A matrix is a flat block of memory; a list of node objects with edge maps is a pointer-chase. For a 14×14 grid (196 nodes, ~756 directed-pair edges) the list takes ~30 KB of JS objects vs a matrix's ~24 KB of booleans. The list wins on size by a hair and loses on locality. For an in-browser visualizer with 200 nodes, neither cost is measurable.

### What the alternative would have cost

If `Graph2` had stored a matrix:

```
graph.matrix: boolean[V][V]
graph.weights: number[V][V]
```

Every BFS step would scan a 196-element row to find ≤4 grid-neighbors — 50× wasted work per step. For Dijkstra on the 14×14 grid, the inner loop runs `V` times per dequeue (196 reads to find ≤4 weighted neighbors). At 14×14 the animation `delayLoop(200)` swallows the difference; at 100×100 (10k nodes), the matrix BFS becomes visibly slower. And every `Node2` field (`row`, `column`, `obstacle`) would need a parallel array — three more 196-element arrays alongside the matrix.

The choice cost ~6 KB of JS object overhead and bought 50× faster neighbor iteration plus free per-node metadata. Not a hard call.

### The breakpoint

Fine until the graph becomes dense — average degree exceeds V/2. At that point the list's per-edge object overhead matches or exceeds the matrix's flat layout, and the matrix's cache locality wins. Also fine until `isEdge(u, v)` becomes the hot operation, which happens in some classic graph problems (transitive closure, matrix-vector iteration). Neither breakpoint is anywhere near reincodes' use cases.

### What wasn't actually a tradeoff

A typed-array-backed matrix (`Uint8Array(V*V)`). That would have been more compact than the boolean matrix, but it still costs O(V²) bytes — for V=10,000 that's 100 MB, which isn't a real option in a browser tab regardless of how compact each cell is.

---

## Tech reference (industry pairing)

### Plain JS objects/arrays as graph storage

- **Codebase uses:** `Graph2.nodes: Node2[]` where each `Node2.edges` is a plain object keyed by neighbor index. Lives in `src/utils/data_structures/Graph2.ts` L21–L62.
- **Why it's here:** the storage layer for every graph algorithm in the app — BFS, DFS, Dijkstra, state-space BFS all read this shape.
- **Leading today:** plain JS objects/arrays for in-memory graphs — adoption-leading, 2026. Every interview answer, every algorithms course, and every front-end graph visualizer uses this pattern.
- **Why it leads:** zero dependencies, debuggable in devtools, the literal shape an interviewer expects to see on the whiteboard.
- **Runner-up:** `Map<NodeId, Map<NodeId, Edge>>` — the same idea with proper `Map` semantics (typed keys, ordered iteration, `.size`). Industry-standard when keys aren't dense integers; over-engineered when they are.

### `@datastructures-js/priority-queue`

- **Codebase uses:** wrapped via `src/utils/data_structures/PriorityQueue.ts`, used by `DijkstrasAlgorithm.ts` to dequeue the next-cheapest node.
- **Why it's here:** Dijkstra needs `extract-min` + `update-priority` on a frontier set; without it, the algorithm degrades from `O((V+E) log V)` to `O(V²)`.
- **Leading today:** `@datastructures-js/priority-queue` — adoption-leading for JS PQ implementations, 2026.
- **Why it leads:** TypeScript-typed, zero-dependency, supports custom comparators and the `valueIndicesLookup` needed for `updatePriority` in O(log V).
- **Runner-up:** writing the binary heap from scratch — what `BinaryHeap.ts` in this same `data_structures/` folder does. Educational; not what a real production codebase wants.

### D3 (`d3` + `d3-force`)

- **Codebase uses:** `d3-force` for the `NetworkDiagram` component that renders `Graph` for the `/graphs/network` page. Imports in `src/components/NetworkDiagram.tsx`.
- **Why it's here:** rendering the adjacency list as a force-directed graph visualization on screen — the user can see the topology even when the adjacency list is "just data."
- **Leading today:** D3 — adoption-leading for browser-based graph visualisation, 2026. Genuinely no peer for force-directed layout in the browser.
- **Why it leads:** force-directed layout with collision detection, drag interactions, edge crossings minimization — all built in, all configurable.
- **Runner-up:** Cytoscape.js — innovation-leading for larger graphs (10k+ nodes), with built-in pan/zoom and hit-testing. D3 wins below ~1k nodes for simplicity; Cytoscape wins above.

---

## Summary

An adjacency list stores graph edges keyed by node: for each node, the array (or map) of its directly-connected neighbors. In reincodes, `Graph2` uses a list of `Node2` objects where `Node2.edges` is a `Record<NeighborId, Edge>` carrying weight and direction; `Graph` uses a flat `number[][]` for unweighted graphs. The constraint that made adjacency list the right call is that every algorithm here — BFS, DFS, Dijkstra, state-space BFS — iterates neighbors as its inner loop. The cost is O(degree) `isEdge` lookups, which the codebase never uses on the hot path.

- Adjacency list space is O(V + E); matrix is O(V²). For sparse graphs that's two or three orders of magnitude.
- Neighbor iteration on a list is O(degree); on a matrix it's O(V). Every traversal in this repo wins from the list.
- `Graph2` carries weighted edges via `Edge` objects; `Graph` stores unweighted neighbor indices. Pick the class to match whether weights matter.
- `Node2`'s typed-`any` design lets the grid pages stash `row`, `column`, `obstacle` on the node alongside edges — a separate matrix would need parallel arrays for these.
- The pattern generalises: any "look up the things attached to X" problem wants storage keyed by X. Adjacency list, foreign-key indexes, `groupBy` — same insight.

---

## Interview defense

### What an interviewer is really asking

When the interviewer says "represent the graph," they're testing whether you reach for the matrix (because that's how textbooks introduce graphs) or the list (because that's what real code uses). The hidden question is: do you know why the list wins for sparse graphs, and can you name when the matrix would actually be the right choice? Anyone who answers "list, always" is missing the second half.

### Likely questions

[mid] Q: How would you represent a graph with 1,000 nodes and 5,000 edges so BFS runs fast?

A: Adjacency list. Each node maps to an array of its neighbors, so iterating one node's neighbors is O(degree) — usually small. With 5,000 edges across 1,000 nodes, average degree is 10, so a BFS step touches 10 cells instead of 1,000 for a matrix. Memory is also tighter: O(V + E) = 6,000 cells versus O(V²) = 1,000,000 cells. In this codebase, `Graph2.nodes[i].edges` is exactly that shape — a dict of neighbor index → Edge.

Diagram:

```
neighbors(node) — list vs matrix at 1,000 nodes, deg=10

  List:    nodes[u].edges → 10 entries
                              │
                              ▼
                         iterate 10 edges

  Matrix:  matrix[u]   → 1,000 cells
                              │
                              ▼
                    scan all 1,000, keep 10
                    (990 wasted reads per step)
```

[senior] Q: Why did you pick `Graph2`'s `{ [neighbor]: Edge }` object over a flat `number[][]` like `Graph`?

A: Two reasons. First, edges carry weight and direction, and shoving those into a flat `number[][]` would mean parallel arrays or tuple gymnastics — the object literal is the cleanest way to attach per-edge data. Second, neighbor lookup is `node.edges[neighborId]` — that's an O(1) check whether a specific edge exists, which is closer to the matrix's O(1) `isEdge` without paying O(V²) space. The cost is that `getEdgeList()` allocates a fresh sorted array on each call, which BFS does on every node visit. For the visualizer-sized graphs the allocation is invisible; at scale you'd cache the sorted list.

Diagram:

```
What we picked vs the alternative

┌──────────────────┬───────────────────┬─────────────────────┐
│                  │ Graph2 (dict)     │ Graph (flat array)  │
├──────────────────┼───────────────────┼─────────────────────┤
│ Per-edge data    │ Edge object       │ none — just index   │
│ isEdge(u, v)     │ O(1)              │ O(degree)           │
│ neighbors        │ alloc sorted list │ direct array ref    │
│ Used by          │ BFS/DFS/Dijkstra/ │ network page only   │
│                  │ state-space BFS   │                     │
└──────────────────┴───────────────────┴─────────────────────┘
```

[arch] Q: The state-space BFS in `solve_pg_bfs` grows the graph during search via `insertNode`. What breaks first if the state space hits 10 million nodes?

A: Three layers. The `Node2` allocation — each is a JS object with an `edges` dict and several `any` fields, conservatively 100 bytes — so 10M nodes is ~1 GB just for nodes, which a browser tab won't tolerate. The `visited` dictionary keyed by `state.toString()` becomes a memory hot spot and a GC pressure source. And `breadth_first_search`'s `queue` (`Array.shift()`) is `O(n)` per dequeue; at 10M it's the dominant cost. The fix is per layer: encode states as integers to drop node overhead, use a `Map<bigint, number>` for visited, and use a proper deque or two-index ring buffer instead of `Array.shift()`.

Diagram:

```
What breaks first at 10M state-space nodes

┌─ Node objects ──────────────────────────────────┐
│  10M × ~100B = ~1 GB  ◀── BREAKS: tab killed   │
└─────────────────────────────────────────────────┘
┌─ visited dict ──────────────────────────────────┐
│  10M string keys     ◀── BREAKS: GC pressure   │
└─────────────────────────────────────────────────┘
┌─ Queue (Array.shift) ───────────────────────────┐
│  O(n) per shift      ◀── BREAKS: O(n²) total   │
└─────────────────────────────────────────────────┘
┌─ Algorithm shape ───────────────────────────────┐
│  BFS over reachable  ◀── still fine; need A*   │
│  state space             with a heuristic to    │
│                          cut the explored set   │
└─────────────────────────────────────────────────┘
```

### The question candidates always dodge

Q: Adjacency matrix gives you `isEdge` in O(1). Why didn't you use it for the grid where you're constantly checking "is cell (r,c) connected to cell (r+1,c)"?

A: I never actually check that. The grid construction in `makeGridGraph` walks every cell in order and calls `insertEdge` if the neighbor isn't an obstacle — that's a write, not a check. During traversal, BFS and Dijkstra both iterate the edges that exist; they don't query "is there an edge between two arbitrary cells." `isEdge` in O(1) sounds useful, but it's the answer to a question I never ask. What I *do* check on every cell is `obstacle` — and that lives on `Node2`, not in an edge. A matrix doesn't help with that and would force me to maintain a parallel `obstacle[V]` array. The matrix's O(1) `isEdge` is a feature looking for a use case in this codebase.

Diagram:

```
Operations the grid actually does

┌──────────────────────────────┬────────────────────────────┐
│ Operation                    │ Hits which structure       │
├──────────────────────────────┼────────────────────────────┤
│ "is cell (r,c) an obstacle?" │ node.obstacle  (O(1))      │
│ "iterate neighbors of cell"  │ node.getEdgeList() (O(deg))│
│ "is cell X adjacent to Y?"   │ never asked                │
└──────────────────────────────┴────────────────────────────┘

The matrix optimizes for the row I never read.
```

### One-line anchors

- "Adjacency list is `Record<NodeId, NodeId[]>` — the same shape as grouping todos by status."
- "Pick storage to match the hot operation. The hot operation here is iterate-neighbors."
- "`Graph2`'s `{ [neighbor]: Edge }` is a list with O(1) `isEdge`, without paying O(V²) space."
- "The matrix would optimise `isEdge`, which this codebase never calls on the hot path."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the `Graph2` data structure for a graph with 4 nodes and edges `(0,1), (1,2), (2,3), (3,0)` (a 4-cycle). Label every box: `Graph2`, `nodes`, each `Node2` with its `index`, each `edges` map with its keys and `Edge` objects.

Open the file. Compare.

✓ Pass: 4 `Node2` objects, each with 2 entries in `edges` pointing at the next and previous node.
✗ Fail: re-read the diagram section. Then try again.

### Level 2 — Explain it out loud

Explain `Graph2`'s adjacency-list shape to an imaginary colleague who just asked "how does the grid page store the edges?" No notes. Under 90 seconds.

Checkpoints — did you:
- Name the specific file and class?
  → `src/utils/data_structures/Graph2.ts`, classes `Graph2`, `Node2`, `Edge` (L7–L178)
- Say why it's a list of objects with a `{ [neighbor]: Edge }` dict instead of a flat `number[][]`?
- Name the tradeoff (O(degree) `isEdge` lookup vs matrix's O(1))?

### Level 3 — Apply it to a new scenario

Without looking at the file, answer:

You're adding a "delete cell" feature to the grid page. When the user clicks a cell, that node should be removed and every edge touching it should disappear. Walk through how you'd implement this on `Graph2`. What changes if the underlying structure was an adjacency matrix?

Write your answer. 3–5 sentences minimum. Then open `Graph2.ts` L48–L50 (`removeEdge`) and L102–L134 to check.

### Level 4 — Defend the decision you'd change

The biggest tradeoff is list vs matrix. Answer in writing:

"If you were starting reincodes today with the same visualizer constraints, would you keep `Graph2`'s adjacency list, or switch one of the pages (say `finding-shortest-path` for a 30×30 grid) to a matrix? What would the migration cost?"

Reference the actual code when you answer:
- Point to `Graph2.ts` L64–L178 to support what exists
- Point to `finding-shortest-path/page.tsx` L86 to show the call site that would change

### Quick check — code reference test

Without opening any files, answer:
- What file defines `Node2`?
- How does `Node2.addEdge(neighbor, weight)` store the edge?
- Approximately what line range is the `Graph2` class?

Then open the file and verify.

✓ Pass: you named the file (`src/utils/data_structures/Graph2.ts`)
✓ Pass: you described `this.edges[neighbor] = new Edge(...)` (L44–L46)
✗ Fail on lines: that's fine — line numbers change.
