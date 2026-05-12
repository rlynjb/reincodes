# Graph as adjacency list

**Industry name(s):** Adjacency list, adjacency-list graph representation
**Type:** Industry standard · Language-agnostic

> A graph stored as an array of nodes, each holding a map of its outgoing edges. Implemented in `Graph2.ts`; used by grid + Dijkstra + state-space BFS visualizers.

**See also:** → [12-bfs](./12-bfs.md) · → [13-dijkstra](./13-dijkstra.md) · → [14-state-space-bfs](./14-state-space-bfs.md) · → [15-grid-graph-construction](./15-grid-graph-construction.md)

---

## Why care

You have a road network and want to find the shortest route. The data shape: nodes (cities) + edges (roads, with distances). Two natural storage choices: an adjacency *matrix* (N×N boolean/weight grid) or an adjacency *list* (each node holds its neighbours). For sparse graphs — where edges « N² — the list wins big.

Adjacency list is the canonical representation for sparse graphs — same shape as the linked-list-of-neighbours that backed every BFS/DFS textbook. The trade is `O(V + E)` space (best for sparse) vs `O(V²)` for matrix (best for dense or when checking edge existence is hot).

---

## How it works

Picture a town's phone book: every business has a list of its delivery routes. The directory is the "node array"; each business's route list is the "adjacency list." Looking up business X's routes is O(1) (find X) + O(degree) (read its routes). Asking "does X deliver to Y?" requires scanning X's routes — O(degree).

### The shape

```
// src/utils/data_structures/Graph2.ts:64-178 (simplified)
class Edge {
  fromNode: number;
  toNode: number;
  weight: number;
  direction?: string;
}

class Node2 {
  index: number;
  label: any;
  edges: { [neighbor: number]: Edge };  // map keyed by neighbour index
  // helpers: getEdge, addEdge, removeEdge, getEdgeList
}

class Graph2 {
  numNodes: number;
  undirected: boolean;
  nodes: Node2[];

  insertEdge(from, to, weight): adds edge; if undirected, also adds reverse
  removeEdge(from, to): removes edge; if undirected, removes reverse
  getEdge(from, to): returns Edge or null
  isEdge(from, to): boolean
  insertNode(label): appends a new Node2
  makeEdgeList(): flat array of every edge
}
```

### Operations and complexity (V = nodes, E = edges)

```
┌────────────────┬──────────────┐
│ Operation      │ Complexity   │
├────────────────┼──────────────┤
│ insertEdge     │ O(1)         │
│ removeEdge     │ O(1)         │
│ isEdge(u,v)    │ O(1) avg     │ ← map lookup
│ getEdgeList(v) │ O(degree(v)) │
│ all neighbours │ O(degree(v)) │
│ BFS/DFS        │ O(V + E)     │
│ Memory         │ O(V + E)     │
└────────────────┴──────────────┘
```

### Construction trace: 4-node undirected graph

```
const g = new Graph2(4, true);  // undirected = true
g.insertEdge(0, 1, 1.0);
g.insertEdge(1, 2, 1.0);
g.insertEdge(2, 3, 1.0);
g.insertEdge(0, 3, 1.0);

After construction:
node 0: edges = { 1: {to:1, w:1}, 3: {to:3, w:1} }
node 1: edges = { 0: {to:0, w:1}, 2: {to:2, w:1} }
node 2: edges = { 1: {to:1, w:1}, 3: {to:3, w:1} }
node 3: edges = { 0: {to:0, w:1}, 2: {to:2, w:1} }
```

The undirected flag means `insertEdge(0,1)` also adds the symmetric `(1,0)` edge.

### Why a map, not an array, for edges

The codebase stores edges as `{ [neighbor]: Edge }`. This makes `getEdge(u, v)` O(1) by key lookup, vs O(degree) for an array of edges. For graphs with high-degree nodes (a grid node has 4 neighbours; a dense graph might have hundreds), this matters.

The cost: iterating edges (`getEdgeList`) requires `Object.keys` and sorting, which is slightly slower than walking an array. The codebase pays that cost in exchange for fast lookup.

### The principle

This is what people mean by *choosing the data layout based on access pattern*. A graph algorithm that asks "what are X's neighbours?" wants an adjacency list. A graph algorithm that asks "is there a direct edge from X to Y?" repeatedly wants a matrix. Pick the representation that makes the hot path cheap.

The full picture is below.

---

## Adjacency list — diagram

```
Graph2 instance (n=4, undirected):

Graph2:
  numNodes: 4
  nodes: [
    Node2(idx=0, edges={ 1:Edge, 3:Edge }),
    Node2(idx=1, edges={ 0:Edge, 2:Edge }),
    Node2(idx=2, edges={ 1:Edge, 3:Edge }),
    Node2(idx=3, edges={ 0:Edge, 2:Edge }),
  ]

As graph:
       0 ── 1
       │    │
       │    │
       3 ── 2

Memory: O(V + E) = 4 nodes + 8 edges (4 undirected × 2 directions) = 12 entries
```

---

## In this codebase

**Class:** `src/utils/data_structures/Graph2.ts` L1–L262 — `Edge`, `Node2`, `Graph2`, plus `breadth_first_search` as a free function.
**Used by:** grid pages (`/graphs/grid`, `/graphs/finding-shortest-path`), `/graphs/river-crossing-puzzle`.

GitHub: `[Graph2.ts](https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/Graph2.ts)`.

---

## Elaborate

### Where this pattern comes from
Adjacency list goes back to the earliest graph algorithm papers — Dijkstra (1959), Kruskal (1956). Adjacency matrix was older still (used in tabular graph theory before computers). The choice between them is one of the first decisions every graph implementation makes.

### The deeper principle
*Sparsity changes everything.* For dense graphs (E ≈ V²), matrix wins on lookup. For sparse graphs (E ≈ V), list wins on memory and traversal. Real-world graphs (road networks, social graphs, web links) are sparse — so adjacency list dominates.

### Where this breaks down
- Very dense graphs: matrix is faster and simpler.
- Heavy edge-existence queries on dense graphs: matrix wins.
- Memory-constrained envs with small V: V² matrix can be smaller than the linked overhead of a list.

### What to explore next
- [12-bfs](./12-bfs.md) — the canonical adjacency-list-driven traversal.
- [13-dijkstra](./13-dijkstra.md) — adjacency list + priority queue.
- [15-grid-graph-construction](./15-grid-graph-construction.md) — building a grid as a graph.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Adjacency list           │ Adjacency matrix         │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Memory           │ O(V + E)                 │ O(V²)                    │
│ isEdge(u,v)      │ O(1) avg (map)           │ O(1) always              │
│ Neighbours(v)    │ O(deg(v))                │ O(V) — scan row          │
│ Add edge         │ O(1)                     │ O(1)                     │
│ Remove edge      │ O(1)                     │ O(1)                     │
│ Best for         │ Sparse (E « V²)          │ Dense (E ≈ V²)           │
│ Cache locality   │ Moderate                 │ Excellent (contiguous)   │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Matrix-style edge presence checking with predictable O(1). The codebase's map-based edges are O(1) average but worst-case depend on JS engine's map implementation.

### What the alternative would have cost

A V² matrix at 400 grid nodes is 160000 cells — most empty for a grid graph (each cell has 4 neighbours, so density is ~1%). Wasteful for sparse graphs.

### The breakpoint

Fine for sparse graphs at any scale. Switch to matrix when graph is dense (E > V²/2) and isEdge queries dominate.

---

## Tech reference (industry pairing)

### Custom adjacency-list graph

- **Codebase uses:** `Graph2` class.
- **Why it's here:** the underlying representation that supports grid, Dijkstra, state-space search.
- **Leading today:** Adjacency list — `adoption-leading` for sparse graph algorithms, 2026.
- **Why it leads:** memory-efficient for the common case (sparse graphs); natural fit for BFS/DFS/Dijkstra.
- **Runner-up:** Compressed Sparse Row (CSR) format — `innovation-leading` for high-performance graph libraries (Spark GraphX, igraph) where cache locality matters at billion-edge scale.

---

## Summary

### Part 1 — concept recap

Adjacency list is the graph representation where each node holds its outgoing edges (as a map in this codebase, for O(1) lookup). reincodes uses `Graph2` to back grid traversal, Dijkstra's shortest path, and state-space BFS. The constraint is "sparse graphs are common," and the cost is map-keyed edges trade compile-time simplicity for runtime flexibility.

### Part 2 — key points to remember

- O(V + E) space — memory-efficient for sparse graphs.
- Per-node map of edges for O(1) `isEdge` lookup.
- Undirected mode adds reciprocal edges automatically.
- Backs every graph algorithm in the codebase.
- The cost is per-node allocation overhead; matrix is better for dense graphs.

---

## Interview defense

### What an interviewer is really asking

When someone asks about graph representation, they want to hear you size the *density* and pick the right shape. Saying "adjacency list because the graph is sparse" with a number ("each grid cell has 4 neighbours out of N possible") is the right answer.

### Likely questions

**Q [mid]: How do you check if there's an edge from node 5 to node 7?**

A: `graph.getEdge(5, 7)` — internally `graph.nodes[5].edges[7]`. Returns the Edge object or null. O(1) average — map lookup.

**Q [senior]: Why a map keyed by neighbour index instead of an array of edges?**

A: Two reasons. (1) O(1) edge-existence check vs O(degree) scan. For algorithms that frequently ask "do these two nodes connect?" (e.g., dense subgraph checks), the difference compounds. (2) Easy removal — `delete node.edges[neighbour]` is O(1) vs array splice. The cost: iterating edges requires `Object.keys` which is slower than walking an array. For this codebase's workload (mostly traversal, not edge-existence checks), an array would have been slightly faster — but the map is more flexible.

**Q [arch]: What changes at 10M nodes?**

A: The map-per-node overhead becomes real — each `{}` is a hash-table allocation, costing ~100 bytes minimum. For 10M nodes that's 1 GB before edges. Production graph libraries use CSR format: one big array of all edges + a per-node "offset into that array." Cache locality is excellent (contiguous), memory drops to (V + E) × 4 bytes. The tradeoff: edge mutation becomes harder. For static graphs (web link analysis, social graph snapshots), CSR is the right shape.

```
At 10M nodes:
┌─ Custom adjacency list ┐
│  ⚠ ~10GB memory        │  ← breaks first
│    map overhead/node    │
└────────────────────────┘
┌─ CSR (production) ─────┐
│  ✓ ~10× less memory     │
│  ✓ Cache-friendly       │
│  ⚠ Mutation expensive   │
└────────────────────────┘
```

### One-line anchors

- "Each node holds its neighbours."
- "O(V + E) for sparse; O(V²) matrix for dense."
- "Map-keyed edges → O(1) edge lookup."
- "Production graphs at scale: CSR format."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a 5-node directed graph and write out its adjacency-list representation in `Graph2` shape.

### Level 2 — Explain it out loud
"Adjacency list vs matrix — when do you pick each?"

### Level 3 — Apply it to a new scenario
"Web graph: 1B pages, ~10 outlinks each. Adjacency list or matrix? Why?"

### Level 4 — Defend the decision you'd change
"Would you switch from map-keyed edges to array edges in `Graph2`?"

### Quick check
- File? → `src/utils/data_structures/Graph2.ts`.
- Edge storage? → map keyed by neighbour index.
- Memory? → O(V + E).

✓ Pass: all three.
