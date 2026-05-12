# Grid graph construction

**Industry name(s):** Grid graph, lattice graph
**Type:** Industry standard · Language-agnostic

> Construct a graph where each cell is a node connected to its grid neighbours, with obstacles as missing nodes/edges. The substrate for `/graphs/grid` and `/graphs/finding-shortest-path`.

**See also:** → [11-graph-adjacency-list](./11-graph-adjacency-list.md) · → [13-dijkstra](./13-dijkstra.md) · → [12-bfs](./12-bfs.md)

---

## Why care

You're solving a maze, a Pac-Man path, or a tile-based shortest route. The underlying data isn't really "a graph" — it's a 2D grid. The grid IS the graph: cell `(r,c)` connects to `(r±1, c)` and `(r, c±1)` (4-connectivity) or also diagonals (8-connectivity). Construction is a `for r * for c` loop that adds edges where applicable.

Same pattern underlies: A* in games (grid navigation), image segmentation (pixel adjacency graph), Conway's Game of Life (neighbour state), and Markov-decision-process grids.

---

## How it works

Picture a chessboard with some squares removed (obstacles). Stand on a square; you can move to any orthogonal neighbour that exists. To find paths between squares, build a graph where every existing square is a node and every legal move is an edge.

### The construction

```
// src/components/GridVisualizer/GridVisualizer.tsx (simplified)
const makeGridGraph = (width, height, obstacles) => {
  const numNodes = width * height
  const g = new Graph2(numNodes, undirected=true)

  for r in 0..height-1:
    for c in 0..width-1:
      idx = r * width + c

      if !isObstacle(r, c):
        // right neighbour
        if c < width-1 and !isObstacle(r, c+1):
          g.insertEdge(idx, idx + 1, weight=1)
        // bottom neighbour
        if r < height-1 and !isObstacle(r+1, c):
          g.insertEdge(idx, idx + width, weight=1)
      
      if isObstacle(r, c):
        g.markObstacle(idx, true)
      
      g.addNodeMatrice(idx, r, c)   // remember (r,c) for rendering

  return g
}
```

Two tricks:
1. **Linear index ↔ (r, c)**: `idx = r * width + c` flattens the 2D grid to a 1D array. The graph's nodes are 0-indexed; the visualizer maps back with `addNodeMatrice`.
2. **Undirected**: setting `Graph2(numNodes, true)` means inserting `(a, b)` also adds `(b, a)`. For a grid, every move is bidirectional.

### Why only right + bottom?

To avoid duplicate edges. When processing cell `(r, c)`, we add edges to `(r, c+1)` and `(r+1, c)`. The cell `(r, c-1)` will have added its edge to `(r, c)` already (when we processed it). Same for `(r-1, c)`. Going only right + bottom processes each pair exactly once.

### Complexity

- Time: O(width × height) — visit each cell once, do O(1) work.
- Space: O(width × height) nodes + O(width × height × 4) ≈ O(WH) edges.

### Trace: 3×3 grid, no obstacles

```
Grid (cells):       Indices:
  ┌─┬─┬─┐            0  1  2
  │ │ │ │             
  ├─┼─┼─┤            3  4  5
  │ │ │ │             
  ├─┼─┼─┤            6  7  8
  │ │ │ │             
  └─┴─┴─┘

After construction (undirected):
  node 0: {1, 3}      node 1: {0, 2, 4}    node 2: {1, 5}
  node 3: {0, 4, 6}   node 4: {1, 3, 5, 7} node 5: {2, 4, 8}
  node 6: {3, 7}      node 7: {4, 6, 8}    node 8: {5, 7}

Edges: 12 (each grid cell × ~3 neighbours / 2 for double-counting = 12)
```

### Adding an obstacle at (1, 1) (idx 4)

```
  ┌─┬─┬─┐
  │ │ │ │
  ├─┼─┼─┤
  │ │█│ │   ← obstacle at center
  ├─┼─┼─┤
  │ │ │ │
  └─┴─┴─┘

Reconstructed adjacency:
  node 0: {1, 3}      node 1: {0, 2}      node 2: {1, 5}
  node 3: {0, 6}      node 4: ∅ (obstacle) node 5: {2, 8}
  node 6: {3, 7}      node 7: {6, 8}      node 8: {5, 7}

The center is unreachable; corners can only reach via the perimeter.
```

### Weighted variant (used in finding-shortest-path)

```
// src/app/graphs/finding-shortest-path/page.tsx
const makeGridGraph = (width, height, obstacles) => {
  ...
  if c < width-1 and !isObstacle(r, c+1):
    g.insertEdge(idx, idx + 1, getRandomEdgeWeight(1, 10))  // ← random 1-10
  if r < height-1 and !isObstacle(r+1, c):
    g.insertEdge(idx, idx + width, getRandomEdgeWeight(1, 10))
  ...
}
```

Edges have random weights 1–10, making the grid graph weighted — exactly what Dijkstra needs.

### The principle

This is what people mean by *spatial-to-graph translation*. Anywhere you have a 2D (or N-D) structure with local connectivity, you can express it as a graph and apply graph algorithms. The 2D structure constrains *which* edges exist; graph algorithms don't care about the geometry.

The full picture is below.

---

## Grid graph construction — diagram

```
Grid                         As graph (undirected):

  0 ─ 1 ─ 2                    0 ── 1 ── 2
  │   │   │                    │    │    │
  3 ─ 4 ─ 5                    3 ── 4 ── 5
  │   │   │                    │    │    │
  6 ─ 7 ─ 8                    6 ── 7 ── 8

Each cell idx = r * width + c

Build loop:
  for r in 0..H-1:
    for c in 0..W-1:
      idx = r*W + c
      if not obstacle:
        edge → right neighbour (c+1)
        edge → bottom neighbour (r+1)

Right + bottom only → no double-edges.
```

---

## In this codebase

**Function:** `makeGridGraph` (inline in both `src/components/GridVisualizer/GridVisualizer.tsx` and `src/app/graphs/finding-shortest-path/page.tsx`).
**Underlying graph:** `Graph2` from `src/utils/data_structures/Graph2.ts`.
**Visualizer:** `GridVisualizer` renders the grid; `highlight` prop accepts a list of cell indices to colour.

GitHub: `[GridVisualizer.tsx](https://github.com/rlynjb/reincodes/blob/main/src/components/GridVisualizer/GridVisualizer.tsx)`.

---

## Elaborate

### Where this pattern comes from
The grid-as-graph idea predates computing — every chess problem book has it. The flat-index trick (`r*W+c`) is the canonical way to store 2D data in 1D memory; predates C, used since FORTRAN.

### The deeper principle
*Geometry constrains connectivity; algorithms ignore the geometry.* A graph algorithm doesn't know it's running on a grid — it just sees edges. That abstraction lets the same algorithm (Dijkstra, BFS) solve grid problems and arbitrary-graph problems uniformly.

### Where this breaks down
- Diagonal moves: 4-connectivity vs 8-connectivity vs knight-move-connectivity — each is a different edge set. Defaults rarely fit; design choice.
- Non-uniform weights: random weights are toy; production grids (traffic maps) need real cost data.
- Obstacles that aren't static: dynamic graphs need re-built or incrementally updated.

### What to explore next
- [11-graph-adjacency-list](./11-graph-adjacency-list.md) — the underlying storage.
- [12-bfs](./12-bfs.md) — unweighted grid traversal.
- [13-dijkstra](./13-dijkstra.md) — weighted grid shortest path.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Grid-as-graph            │ Direct 2D array indexing │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Algorithm reuse  │ All graph algos work     │ Need grid-specific code  │
│ Memory           │ O(WH) + edges            │ O(WH)                    │
│ Edge custom data │ Per-edge weight + dir    │ Implicit (cost=1)        │
│ Code complexity  │ Build step + graph       │ Just nested loops        │
│ Performance      │ Pointer / map traversal   │ Direct array access     │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Direct-indexing speed. Walking neighbours via `node.edges[...]` is slower than `arr[r+1][c]` on raw 2D arrays. For tight inner loops (high-performance game pathfinding), grid-specific code is faster.

### What the alternative would have cost

Without the graph abstraction, you'd write a custom BFS/Dijkstra that knows about rows and columns directly. That's faster but not reusable; the next non-grid problem starts from scratch.

### The breakpoint

Fine for teaching and small-medium grids. For 10000×10000 grid (game maps), production engines use grid-specific algorithms with bit manipulation and flat arrays.

---

## Tech reference (industry pairing)

### Grid-graph + Graph2

- **Codebase uses:** Inline `makeGridGraph` constructor + `Graph2` class.
- **Why it's here:** lets the same code path serve BFS, Dijkstra, and visualisation.
- **Leading today:** Grid-as-graph — `adoption-leading` for teaching and small-scale pathfinding, 2026.
- **Why it leads:** unifies "graph algorithm" and "grid algorithm" under one model.
- **Runner-up:** Hex grids — `innovation-leading` for tile-based games; same idea, different connectivity.

---

## Summary

### Part 1 — concept recap

Grid graph construction maps a 2D grid into an adjacency-list graph: each cell is a node, each orthogonal neighbour is an edge, obstacles are missing nodes/edges. reincodes builds this in two places — `GridVisualizer` (unweighted) and the shortest-path page (random-weighted) — so the same `Graph2` works for both. The constraint is "we want graph algorithms to drive the grid," and the cost is per-cell map allocation overhead compared to raw 2D arrays.

### Part 2 — key points to remember

- Linear index: `idx = r * width + c`.
- Insert edges only to right + bottom neighbours to avoid duplicates.
- Undirected: `Graph2(_, true)` adds reciprocal edges automatically.
- Obstacles: mark via `g.markObstacle(idx, true)`, skip edge insertion.
- Foundation for BFS / Dijkstra / A* on grids.

---

## Interview defense

### What an interviewer is really asking

When someone asks "how do you set up a grid for pathfinding?", they want to hear "linear index, neighbours by ±1 in each direction, skip obstacles." Naming the flat-index trick is the senior-level signal.

### Likely questions

**Q [mid]: Why store the grid as a 1D array instead of `cells[r][c]`?**

A: Both work. 1D with `idx = r*W+c` is the canonical form because graph algorithms expect node indices, and you avoid nested arrays which are slower in JS. The conversion is trivial: `r = idx / W, c = idx % W`.

**Q [senior]: For 4-connected vs 8-connected, what changes?**

A: Just the neighbour-generation step. 4-connected adds edges to (r-1,c), (r+1,c), (r,c-1), (r,c+1). 8-connected adds those four plus (r±1, c±1). Edge weights typically differ — diagonal moves cost √2 if you want Euclidean accuracy, or 1 if you want them equal to orthogonal. The downstream graph algorithm is identical.

**Q [arch]: At 10000×10000 grid (100M cells), is this approach viable?**

A: Memory becomes the bottleneck. Each `Graph2` node carries an `edges` map; 100M maps is GB-scale overhead. Production pathfinding (Recast / NavMesh in games) uses flat bit-arrays for traversability and computes neighbours on the fly — same idea as state-space BFS without ever storing the graph. For 1000×1000 (1M cells), the graph approach is fine on modern hardware.

### One-line anchors

- "idx = r*W + c flattens 2D to 1D."
- "Right + bottom only avoids double edges."
- "Undirected graph mode handles bidirectionality."
- "Obstacles = nodes with no edges."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Build a 4×4 grid graph with an obstacle at (2, 2). Write out the adjacency for cells 0, 5, 10.

### Level 2 — Explain it out loud
"Why do we only add edges to right + bottom?"

### Level 3 — Apply it to a new scenario
"Pacman maze with one-way corridors (some edges directional). What changes about construction?"

### Level 4 — Defend the decision you'd change
"Would you switch to a flat bit-array for production scale (10000×10000)?"

### Quick check
- File? → `src/components/GridVisualizer/GridVisualizer.tsx` (and `finding-shortest-path/page.tsx`).
- Index formula? → `r * width + c`.
- Underlying class? → `Graph2`.

✓ Pass: all three.
