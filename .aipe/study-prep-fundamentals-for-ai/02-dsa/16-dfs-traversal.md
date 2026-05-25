# DFS traversal

**Industry name(s):** Depth-first search, recursive graph traversal, iterative DFS with explicit stack
**Type:** Industry standard · Language-agnostic

> Visit a graph by following one branch as deep as possible before backing up — implemented recursively (the natural shape) or with an explicit LIFO stack (when recursion depth threatens the call stack).

**See also:** → 14-graph-adjacency-list.md · → 15-bfs-with-parent-tracking.md · → 17-dijkstras-shortest-path.md

---

## Why care

You're recursively rendering a component tree — a `<Sidebar>` that renders `<Section>`s that each render `<Item>`s that each render `<SubItem>`s. React commits the deepest leaf before it commits the parent that wraps it; you've seen this in the React DevTools profiler, watching the flame chart paint from the leaves up. Now imagine someone asks you "list every component in this tree, in the order React mounted them." The order you'd describe is: section → first child of section → first grandchild → second grandchild → second child of section → ... — full depth first, then back up, then sideways, then deep again.

That recursive-walk order is depth-first search. Not the "explore a maze" framing — the *render-tree walk* framing. The "start node" is the root component; the "edges" are parent → child references. DFS visits everything reachable, going as deep as it can on each branch before backing up.

**Why you need to answer that question at all:** because every graph problem that asks "is this thing reachable from that thing," "how many connected pieces are there," "does this graph have a cycle," or "what's the topological order of these tasks" reduces to DFS. The grid visualizer's BFS-vs-DFS toggle exists so the reader can *see* the difference — DFS dives diagonally to the corner; BFS spreads as a wavefront. Same graph, different exploration order, different applications.

Without DFS:
- Connected-component counts need a different traversal (BFS works too — `Graph.numberOfConnectedComponents` uses BFS)
- Cycle detection needs explicit visited-state machinery beyond what BFS naturally tracks
- Topological sort needs a *post-order* finish time, which DFS gives you for free

With DFS:
- One recursive call per node; the call stack IS the path being explored
- Backtracking is automatic — the function return unwinds the path
- Three colour states (unvisited/in-progress/done) give cycle detection in one pass

DFS-via-recursion is the same shape as a recursive component render — go all the way down one branch, then unwind, then descend the next. DFS-via-stack is the same shape made iterative when recursion depth would blow the JS call stack. The full mechanics are below.

---

## How it works

### Move 1 — The mental model: recurse into one neighbor, fully, before the next

Picture a graph as a directed tree (which DFS effectively turns it into — the DFS tree). The algorithm visits a node, then *recurses into each unvisited neighbor in turn*. Each recursive call goes as deep as possible before returning. By the time you back up to a node, every reachable thing through it has been visited.

```
DFS on the 6-node graph (from node 0, neighbor order 1, 3):

    0
    │ visit 0, recurse into 1
    ▼
    1                                  (call stack: [0, 1])
    │ visit 1, recurse into 0(visited), 2
    ▼
    2                                  (call stack: [0, 1, 2])
    │ visit 2, no unvisited neighbors
    ▼ return
    1                                  back at 1, recurse into 4
    ▼
    4                                  (call stack: [0, 1, 4])
    │ visit 4, recurse into 3, then 5
    ▼
    3                                  (call stack: [0, 1, 4, 3])
    ▼ return (3's neighbor 4 already visited)
    4
    ▼
    5                                  (call stack: [0, 1, 4, 5])
    ▼ return all the way out
```

The strategy in one line: process one neighbor *completely* before moving to the next. The recursive call stack is the "path I'm currently on"; the function return is the backtrack.

### Move 2 — Recursive DFS vs iterative DFS with a stack

The codebase has both. Walk both because they look identical in output but differ in failure modes.

**Sub-section A: recursive DFS — the natural shape**

`Graph.ts` exposes `dfs_traversal` (L241–L273), which delegates to a `dfs_traversal_helper` (L255–L264) that mutates shared state through closure:

```
function dfs_traversal_helper(u, graph, answer, visited):
  visited[u] = true
  answer.push(u)
  for each neighbor v of u:
    if not visited[v]:
      dfs_traversal_helper(v, graph, answer, visited)
```

If you're coming from frontend, this is exactly the recursive `walk(node) { ...; for (const child of node.children) walk(child) }` you'd write to flatten a Tree of `{ id, children }` nodes. The JS engine's call stack does all the bookkeeping for you — every recursive call pushes a frame; every return pops one.

**Practical consequence:** the call stack holds the *current DFS path* from root to current node. At any moment during execution, the path-being-explored is encoded in the active stack frames. This is why a recursion stack overflow in a deep graph isn't just "out of memory" — it's "the path got too long for V8 to hold."

Execution trace for `dfs_traversal_helper(0, ...)` on the 6-node graph:

```
step  call stack         visited           answer           action
────  ───────────────    ────────────────  ──────────────   ──────────────────
 1    [helper(0)]        [T,F,F,F,F,F]     [0]              push 0, recurse on 1
 2    [helper(0,1)]      [T,T,F,F,F,F]     [0,1]            push 1, recurse on 2
 3    [helper(0,1,2)]    [T,T,T,F,F,F]     [0,1,2]          push 2, all neigh visited
 4    [helper(0,1)]      [T,T,T,F,F,F]     [0,1,2]          return to 1, recurse on 4
 5    [helper(0,1,4)]    [T,T,T,F,T,F]     [0,1,2,4]        push 4, recurse on 3
 6    [helper(0,1,4,3)]  [T,T,T,T,T,F]     [0,1,2,4,3]      push 3, neigh 4 visited
 7    [helper(0,1,4)]    [T,T,T,T,T,F]     [0,1,2,4,3]      return to 4, recurse on 5
 8    [helper(0,1,4,5)]  [T,T,T,T,T,T]     [0,1,2,4,3,5]    push 5, neigh 4 visited
 9    [helper(0,1,4)]                                       return
10    [helper(0,1)]                                         return
11    [helper(0)]                                           return
done
```

Final visit order: `[0, 1, 2, 4, 3, 5]`. Compare to BFS on the same graph: `[0, 1, 3, 2, 4, 5]`. Different order; same set.

**Sub-section B: iterative DFS — the explicit stack form**

The bottom of `Graph2.ts` (L228–L253) has a commented-out iterative DFS. It does the same job using a JS array as a LIFO stack instead of relying on recursion:

```
function depthFirstSearchStack(g, start):
  seen   = new Array(numNodes).fill(false)
  parent = new Array(numNodes).fill(-1)
  toExplore = [start]                        // the stack

  while toExplore.length > 0:
    ind = toExplore.pop()                    // LIFO!
    if !seen[ind]:
      seen[ind] = true
      edges = g.nodes[ind].getEdgeList()
      edges.reverse()                        // so smaller neighbors come off first
      for each edge in edges:
        if !seen[edge.toNode]:
          parent[edge.toNode] = ind
          toExplore.push(edge.toNode)
```

The bridge from frontend: this is the same pattern as a `worklist` you'd build for a tree-shaking pass — a stack of "things to look at," with `pop()` giving LIFO order. The reason it's a stack instead of a queue is the only thing that distinguishes DFS from BFS at the algorithm level.

**Practical consequence:** no recursion means no risk of a JS stack overflow. The `toExplore` array can grow as large as the graph's frontier (up to O(V)) without hitting the engine's ~10,000-frame limit. The `edges.reverse()` line is the subtle bit — by reversing before pushing, neighbors come *off* the stack in sorted order, so the visit sequence matches the recursive version.

The two forms produce the same output on connected graphs from the same start node. They differ in:

```
┌──────────────────┬─────────────────────┬──────────────────────┐
│                  │ Recursive DFS       │ Iterative DFS (stack)│
├──────────────────┼─────────────────────┼──────────────────────┤
│ Code length      │ shorter (5 lines)   │ longer (15 lines)    │
│ Where path lives │ JS call stack       │ explicit stack array │
│ Stack overflow   │ at ~10k depth (V8)  │ never (heap allocs)  │
│ Marking          │ on entry            │ on pop (or push, see │
│                  │                     │   note below)        │
│ Backtracking     │ automatic (return)  │ manual (pop then     │
│                  │                     │   process)           │
└──────────────────┴─────────────────────┴──────────────────────┘
```

Note on marking: the iterative version marks on *pop* (when it first dequeues an item and confirms it hasn't been processed). This means the same node can be pushed multiple times — but the `if !seen[ind]` check on pop ensures it's processed once. That's a subtle difference from BFS's "mark on enqueue" rule, and it's correct for DFS because LIFO order can revisit-and-skip without losing path information.

### Sub-section C: DFS as connected-component counter

`Graph.numberOfConnectedComponents` (L332–L369) is built on BFS in this codebase, but the same logic works with DFS by trivial substitution. The shape:

```
function count_components(graph):
  visited = new Array(V).fill(false)
  count = 0
  for i in 0..V:
    if not visited[i]:
      count += 1
      dfs(graph, i, visited)        // one DFS run per component
  return count
```

If you're coming from frontend: this is the same pattern as iterating over a list of routes, lazily loading whichever route the user hasn't visited yet — except instead of `users.forEach`, you're starting a new traversal at every unvisited node, and counting how many traversals you had to start. Each traversal exhausts one connected component.

```
Sample 6-node graph with two components:

   0 ─── 1     3 ─── 4
                     │
   2                 5

   adjacency:
     0: [1]      3: [4]
     1: [0]      4: [3, 5]
     2: []       5: [4]

   walk:
     i=0: !visited → component += 1; DFS visits {0, 1}
     i=1: visited (skip)
     i=2: !visited → component += 1; DFS visits {2}
     i=3: !visited → component += 1; DFS visits {3, 4, 5}
     i=4,5: visited (skip)

   result: 3 components
```

Three components, two DFS-runs reached more than one node. `Graph.numberOfConnectedComponents` uses BFS for the inner traversal; either traversal works for the *count*, because the question is "how many connected pieces" — and both algorithms exhaust one component before stopping.

### Move 2.5 — Brute force vs optimal (DSA addition)

For "visit every node reachable from start," the brute-force baseline is repeated reachability checks — for each node, run a path-existence query from the start. The optimal approach is a single DFS.

**The data shape:**

```
Same 6-node graph as before:
   0 ─── 1 ─── 2
   │     │
   3 ─── 4 ─── 5

Goal: produce the list of all nodes reachable from node 0.
```

**Brute force — V reachability checks**

```
function reachable_brute(graph, start):
  result = []
  for target in 0..V:
    if has_path(graph, start, target):    // one reachability query per node
      result.push(target)
  return result

function has_path(graph, u, target, visited = new Set()):
  if u == target: return true
  visited.add(u)
  for n in graph.adj[u]:
    if !visited.has(n) and has_path(graph, n, target, visited):
      return true
  return false
```

Each `has_path` call is itself a DFS — so brute force is "do V DFSes, throw V-1 of them away." Complexity: O(V · (V + E)) time. Space: O(V) per query, freed between queries.

What goes wrong at scale: redundant work. Every `has_path(start, target)` traverses the same prefix of the graph until it finds `target`. For a chain graph `0-1-2-3-...-V-1`, asking `has_path(0, V-1)` walks the whole chain — and so does `has_path(0, V-2)`, and `has_path(0, V-3)`, ... The total work is `O(V²)` even on a graph with `E = V-1` edges.

**Optimal — one DFS**

The insight: every node reachable from start gets discovered exactly once in a single DFS. You don't need to ask "is X reachable" V times; you just need to mark every node visited as you go.

```
function reachable_optimal(graph, start):
  visited = new Array(V).fill(false)
  result  = []

  function dfs(u):
    visited[u] = true
    result.push(u)
    for n in graph.adj[u]:
      if !visited[n]:
        dfs(n)

  dfs(start)
  return result
```

Execution trace was walked in Sub-section A. The function returns after one full traversal — `[0, 1, 2, 4, 3, 5]`.

Complexity: O(V + E) time, O(V) space.

Why it's faster: brute force re-traverses the graph's prefix for every target; DFS visits each edge at most twice (once from each endpoint in an undirected graph) and never re-enters a visited node. The `visited` array is the difference between O(V·(V+E)) and O(V+E).

**Comparison**

```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│                     │ Brute (V queries)   │ Single DFS          │
├─────────────────────┼─────────────────────┼─────────────────────┤
│ Time                │ O(V · (V + E))      │ O(V + E)            │
│ Space               │ O(V)                │ O(V)                │
│ V=100, sparse       │ ~10,000 edge reads  │ ~200 edge reads     │
│ V=1,000, sparse     │ ~1M edge reads      │ ~2,000 edge reads   │
│ Reachable set?      │ yes                 │ yes                 │
│ Order of visit?     │ unspecified         │ depth-first         │
└─────────────────────┴─────────────────────┴─────────────────────┘
```

**When brute force is fine:** never for full reachability. It's the right shape when you genuinely need a *single* yes/no for one pair and can't afford to compute everything — e.g., a constant-time-after-preprocessing structure (union-find for undirected, Tarjan SCCs for directed) is overkill if you'll only ever ask once.

### Move 3 — The principle

DFS and BFS are the same algorithm with two different frontier disciplines. Swap the queue for a stack and BFS becomes DFS; swap the stack for a priority queue and DFS becomes "best-first search." The general principle: graph traversal is *frontier management*, and the data structure you use for the frontier defines the algorithm. DFS's LIFO discipline makes the call stack the natural place to keep it — which is why DFS is almost always recursive, and why the iterative form looks more complicated than the recursive form despite doing the same thing. The full picture is below.

---

## DFS traversal — diagram

```
┌─ Recursive DFS: the call stack IS the path ──────────────────┐
│                                                              │
│  dfs(0)  ◀── frame 1                                         │
│    │                                                         │
│    │ for n in neighbors(0): dfs(1)                           │
│    ▼                                                         │
│  dfs(1)  ◀── frame 2                                         │
│    │                                                         │
│    │ for n in neighbors(1): dfs(2)                           │
│    ▼                                                         │
│  dfs(2)  ◀── frame 3 — leaf-ish; returns                     │
│    ▲                                                         │
│    │ pop frame, back at 1                                    │
│    │ for n in neighbors(1): dfs(4)                           │
│    ▼                                                         │
│  dfs(4)  ◀── frame 3 again                                   │
│    │                                                         │
│    │ for n in neighbors(4): dfs(3), dfs(5)                   │
│    ▼                                                         │
│  ... etc                                                     │
│                                                              │
│  At any point: active frames = path from root to current.    │
│  Returning = backtracking. No bookkeeping needed.            │
└──────────────────────────────────────────────────────────────┘

┌─ Iterative DFS: explicit stack ──────────────────────────────┐
│                                                              │
│  Stack (top → bottom)                                        │
│                                                              │
│  init      [0]                                               │
│   pop 0  → [3, 1]   (push neighbors in reverse order so      │
│                      smallest comes off top)                 │
│   pop 1  → [3, 4, 2]                                         │
│   pop 2  → [3, 4]   (neighbors all visited)                  │
│   pop 4  → [3, 5, 3]                                         │
│   pop 3  → [3, 5]                                            │
│   pop 5  → [3]                                               │
│   pop 3  → []       (already visited; skip)                  │
│                                                              │
│  visit order = pop order = [0, 1, 2, 4, 3, 5]                │
└──────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `src/utils/data_structures/Graph.ts`
**Function:** `dfs_traversal` (with inner `dfs_traversal_helper`)
**Lines:** L241–L273 (helper at L255–L264)

**Study notebook reference (in `src/utils/notes/Graph/`):**

- `DFSTraversalRecursion.ts` — standalone recursive DFS, the pure-algorithm sibling of the class-bound `Graph.dfs_traversal`.
- `DFSTraversalRecursionWithComponent.ts` — DFS that also tracks connected-components count; the building block for `numberOfConnectedComponents` in `Graph.ts`.

```
dfs_traversal(n, edges) {
  const visited = new Array(n).fill(false)
  const answer = []

  const dfs_traversal_helper = (u, graph, answer, visited) => {
    visited[u] = true
    answer.push(u)
    for (const v of graph[u]) {
      if (!visited[v]) {
        dfs_traversal_helper(v, graph, answer, visited)
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (!visited[i]) {
      dfs_traversal_helper(i, this.adjList, answer, visited)
    }
  }
  return answer
}
```

Note the outer `for` loop — it runs DFS from every unvisited node, so the function works on disconnected graphs. Each `for`-iteration that triggers a recursive call exhausts one connected component.

**File:** `src/utils/data_structures/Graph2.ts`
**Iterative DFS (commented out):**
**Lines:** L228–L253

This is the explicit-stack version, kept as a reference for when recursion depth would matter. It's intentionally not exported — the visualizer code paths that need DFS use the animated, page-local versions.

**Animated DFS in the grid page:**

**File:** `src/app/graphs/grid/page.tsx`
**Function:** `dfs_traversal` (inner `dfs_recursive`)
**Lines:** L156–L189

```
const dfs_traversal = async (g) => {
  const seen = new Array(g.numNodes).fill(false)
  const last = new Array(g.numNodes).fill(-1)

  const dfs_recursive = async (g, nodeIndex, seen, last) => {
    seen[nodeIndex] = true
    const currentNode = g.nodes[nodeIndex]
    for (const edge of currentNode.getEdgeList()) {
      const neighbor = edge.toNode
      if (!seen[neighbor]) {
        await delayLoop(timer)               // animation pause
        setHighlight(prev => [...prev, neighbor])
        last[neighbor] = nodeIndex
        await dfs_recursive(g, neighbor, seen, last)
      }
    }
  }

  for (let ind = 0; ind < g.numNodes; ind++) {
    if (!seen[ind]) {
      await delayLoop(timer)
      setHighlight(prev => [...prev, ind])
      await dfs_recursive(g, ind, seen, last)
    }
  }
  return last
}
```

The recursion is `async` because every step pauses with `await delayLoop(timer)` to make the animation visible. Each `setHighlight` mutation triggers a re-render that paints the next cell.

**Call sites:**
- `src/app/graphs/network/page.tsx` L132 (commented out) — `graph.dfs_traversal(edgeList.length, edgeList)`
- `src/app/graphs/grid/page.tsx` L331 — `<a onClick={() => dfs_traversal(graph)}>DFS</a>`

---

## Elaborate

### Where this pattern comes from

Depth-first search was systematically analysed by Robert Tarjan in his 1972 paper *Depth-first search and linear graph algorithms*, which proved that DFS could solve strongly-connected-components, biconnectivity, and several other problems all in linear time. Before Tarjan, DFS was used informally; after, it became the foundation of an entire family of algorithms. The "recursive call stack as path" framing is so natural that DFS is sometimes described as "graph traversal that just falls out of recursion."

### The deeper principle

The DFS tree. When DFS runs on an undirected graph, the edges it actually *traverses* form a spanning forest (one tree per connected component). The edges it sees but doesn't traverse (because the neighbor was already visited) are called *back edges*. Back edges are the secret to several DFS-built algorithms:

```
┌─ DFS classifies edges into two kinds ──────────────────────┐
│                                                            │
│  Tree edge:                                                │
│     dfs(u) discovered v for the first time via this edge   │
│                                                            │
│  Back edge:                                                │
│     dfs(u) saw v but v was already visited                 │
│     ⇒ in undirected graphs, this means cycle               │
│     ⇒ in directed graphs, more nuance (forward, cross)     │
│                                                            │
│  Counting tree edges per DFS-run = component sizes         │
│  Detecting any back edge = cycle exists                    │
│  Post-order finish times = topological order               │
└────────────────────────────────────────────────────────────┘
```

Three families of DFS-built algorithms fall out of these observations: connectivity (component count, articulation points, bridges), cyclicity (cycle detection, topological sort), and strong connectivity (Tarjan's SCC, Kosaraju's SCC).

### Where this breaks down

When recursion depth exceeds the engine's stack limit. V8 caps the call stack at roughly 10,000 frames. For a chain graph `0 → 1 → 2 → ... → V-1`, recursive DFS goes V frames deep and overflows at V ≈ 10,000. The fix is iterative DFS with an explicit stack — exactly the commented-out form in `Graph2.ts` L228–L253. When you need shortest paths instead of any-reachable path, DFS is wrong — use BFS. When you need to enumerate paths in a particular order (cheapest-first, fewest-hops-first), DFS is wrong — use a priority queue (Dijkstra) or BFS.

### What to explore next

- BFS with parent tracking → 15-bfs-with-parent-tracking.md → DFS's FIFO twin
- Adjacency list → 14-graph-adjacency-list.md → the storage that makes DFS's neighbor iteration efficient
- Dijkstra → 17-dijkstras-shortest-path.md → DFS/BFS with weights
- Topological sort → DFS post-order finish times; not covered here but the natural next algorithm

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬─────────────────────┬───────────────────────┐
│ Cost dimension   │ Recursive DFS       │ Iterative DFS (stack) │
│                  │ (used by Graph.ts)  │ (in Graph2.ts comment)│
├──────────────────┼─────────────────────┼───────────────────────┤
│ Time             │ O(V + E)            │ O(V + E)              │
│ Stack memory     │ JS call stack       │ Heap-allocated array  │
│ Max depth (V8)   │ ~10,000 frames      │ unbounded             │
│ Code length      │ 5 lines             │ 15 lines              │
│ Backtracking     │ implicit (return)   │ explicit (pop loop)   │
│ Readability      │ matches the algo    │ extra plumbing        │
│ Animation        │ async/await works   │ harder to interleave  │
│                  │ naturally           │ with delayLoop        │
│ Debugging        │ devtools shows path │ stack is data         │
└──────────────────┴─────────────────────┴───────────────────────┘
```

### What we gave up

Stack-overflow safety. A 14×14 grid (196 nodes) recursing diagonally can go ~28 frames deep — safe. A 100×100 grid (10,000 nodes) recursing along a chain hits the V8 ceiling. The grid page caps width and height at small values, but a contributor who raises the cap to 1000 would discover this the hard way.

Cognitive uniformity. The codebase has *recursive* DFS in `Graph.ts` and an *iterative* DFS reference in `Graph2.ts` (commented out). Two shapes for the same algorithm is one more thing to keep in your head. The unification you'd want is: `Graph2` exports both, callers pick based on expected depth.

### What the alternative would have cost

If the codebase used only iterative DFS everywhere:

```
The animated DFS in src/app/graphs/grid/page.tsx would have to manage
an explicit stack alongside the React state, AND interleave delayLoop
inside the loop's `pop` step. That's two extra concerns at every step.
```

The recursive version is shorter and the `await delayLoop` falls naturally between recursive calls. Going iterative would have meant either dropping the animation (the visualizer's entire point) or building a coroutine-like step generator — far more code than the recursion saves.

### The breakpoint

Fine until the graph depth approaches 10,000 nodes deep — a chain or near-chain. Fine until the visualizer adds a "very-large grid" option (200×200 with no obstacles is a 40,000-node grid; a long-path DFS would go ~400 frames deep, still safe). The recursive form earns its place until either of those caps lifts.

### What wasn't actually a tradeoff

Trampolining the recursion (converting to continuation-passing style and reifying frames as objects). That technique solves stack overflow at the cost of *much* more complex code, but JavaScript's lack of tail-call optimization means trampolining doesn't actually help here unless the recursion happens to be tail-recursive — and DFS isn't (the recursive call is followed by a loop over remaining neighbors). The proper fix at scale is iterative DFS with an explicit stack, not trampolining.

---

## Tech reference (industry pairing)

### Plain JS recursion for DFS

- **Codebase uses:** the nested `dfs_traversal_helper` function in `Graph.ts` L255–L264, and the `dfs_recursive` closure in `src/app/graphs/grid/page.tsx` L162–L177.
- **Why it's here:** the recursion stack IS the DFS path. Every active frame is one node on the current root-to-leaf path.
- **Leading today:** plain recursion for DFS — adoption-leading, 2026. Every algorithms course, every whiteboard interview, every educational visualizer uses it.
- **Why it leads:** matches the mental model exactly; the function shape mirrors the algorithm. Five lines of code, debuggable in devtools.
- **Runner-up:** iterative DFS with an explicit `Array` as stack — used when recursion depth threatens the engine limit or when you want to interleave fine-grained state updates that don't fit cleanly between recursive calls.

### `async`/`await` for animated traversal

- **Codebase uses:** `await delayLoop(timer)` between `setHighlight` calls in `src/app/graphs/grid/page.tsx` L170, L174, L182.
- **Why it's here:** turns each algorithm step into a paint frame; without the await, the entire traversal would finish before React's next render and the user would see only the final state.
- **Leading today:** `async`/`await` for educational animation — adoption-leading, 2026. The whole reincodes site uses `delayLoop(ms)` as its animation primitive.
- **Why it leads:** native language feature, no library; the function reads like the algorithm with `await` markers between steps.
- **Runner-up:** `requestAnimationFrame` callbacks driven by a step-generator function. More idiomatic for game-loop style animations; overkill for the linear DFS step-through where you just want a pause between mutations.

---

## Summary

DFS explores a graph by recursing into one neighbor as deep as possible before backing up to try the next. In reincodes, the recursive form lives in `Graph.ts` (`dfs_traversal` L241–L273) and an animated variant in the grid page (`dfs_traversal` L156–L189); the iterative form sits commented out at the bottom of `Graph2.ts` as a reference for when recursion depth would matter. The constraint that made recursion the right call is that the visualizer animates between recursive calls via `await delayLoop(timer)`, which falls naturally into the recursion's shape. The cost is a stack-depth ceiling around V=10,000 which the visualizer never approaches.

- DFS uses LIFO; LIFO is what makes it depth-first. Swap to FIFO and you get BFS.
- The recursion stack IS the path being explored — active frames trace from root to current node.
- DFS finds reachable nodes and visit order; it does NOT find shortest paths.
- Iterative DFS with an explicit stack avoids the engine's call-stack limit but adds boilerplate.
- Three families of algorithms fall out of DFS: connectivity, cyclicity, strong connectivity. Same traversal, different bookkeeping.

---

## Interview defense

### What an interviewer is really asking

When the interviewer asks for "DFS," they're checking whether you reach for recursion naturally, whether you know its failure modes (stack overflow, no shortest paths), and whether you can convert it to an iterative form on demand. The hidden question behind "implement DFS iteratively" is "do you understand that the call stack IS the explicit stack — just managed for you by the language?"

### Likely questions

[mid] Q: Write DFS on a graph represented as an adjacency list. Recursive form.

A: I'd write a helper that takes the current node, a visited array, and the graph. Mark the current node visited, then iterate its neighbors and recurse on each unvisited one. The outer function loops over all nodes and starts the helper on any node that hasn't been visited yet — that handles disconnected graphs. The base case is implicit: when no neighbors are unvisited, the function returns naturally.

Diagram:

```
function dfs(graph, start, visited):
  visited[start] = true
  for n in graph.adj[start]:
    if not visited[n]:
      dfs(graph, n, visited)

  ┌─────────────┐
  │ enter node  │
  ├─────────────┤
  │ mark seen   │
  ├─────────────┤
  │ for each    │
  │ unvisited n │
  │   recurse   │ ◀── one frame deeper
  ├─────────────┤
  │ return      │ ◀── pop frame, backtrack
  └─────────────┘
```

[senior] Q: Why does `Graph.ts`'s `dfs_traversal` use recursion when `Graph2.ts` has a comment with the iterative version? Wouldn't you standardize on one?

A: They serve different call sites. The recursive form in `Graph.ts` is for the static network-diagram page — small graphs, no animation, depth never approaches the V8 limit. The iterative reference in `Graph2.ts` is documentation for when you'd reach for it: if a future page renders a 1000×1000 grid, recursion would overflow. The animated DFS in the grid page is *also* recursive because `await delayLoop` interleaves cleanly between recursive calls; an iterative version would need a step-generator pattern that's much more code. Standardizing on iterative would clean up the codebase but cost the simple `await` integration in the visualizer. The split as it stands matches the use cases — small graphs get the readable form, the iterative form is documented for when it's needed.

Diagram:

```
What we picked vs the "standardize on iterative" suggestion

┌──────────────────┬───────────────────┬──────────────────────┐
│ Form             │ Recursive         │ Iterative (stack)    │
├──────────────────┼───────────────────┼──────────────────────┤
│ Lines            │ 5                 │ 15                   │
│ await delayLoop  │ between calls,    │ needs coroutine /    │
│ animation hook   │ natural           │ generator pattern    │
│ Max safe depth   │ ~10k frames       │ unbounded            │
│ Used where       │ Graph.ts +        │ commented reference  │
│                  │ grid page (small) │ in Graph2.ts         │
└──────────────────┴───────────────────┴──────────────────────┘

Standardizing on iterative would cost the animation hook simplicity
without gaining anything until graphs exceed 10k depth.
```

[arch] Q: How would the DFS in `Graph.ts` need to change to handle a graph with 1 million nodes?

A: Three layers break. The recursion overflows at ~10k depth on a chain-like graph, so I'd switch to the iterative form. The `visited` array is fine at 1M (one byte per node = 1 MB). The `answer` array is fine. The `adjList` is the size concern — if the graph has 5M edges, that's 5M+ JS objects, which is heap-pressuring but survivable. The actual bottleneck at 1M nodes is that the visualizer can't render it; the algorithm itself is O(V + E) and runs in roughly half a second.

Diagram:

```
What breaks first at 1M nodes

┌─ Recursion depth ───────────────────────────────┐
│  worst-case ~1M frames ◀── BREAKS at ~10k       │
│                            (V8 limit)           │
└─────────────────────────────────────────────────┘
┌─ Visited array ─────────────────────────────────┐
│  1M booleans → ~1MB    ◀── fine                 │
└─────────────────────────────────────────────────┘
┌─ Adjacency list ────────────────────────────────┐
│  1M + E objects        ◀── fine if E is sparse  │
│                            (5-10M total)        │
└─────────────────────────────────────────────────┘
┌─ Rendering layer ───────────────────────────────┐
│  React DOM             ◀── BREAKS: can't paint  │
│  visualizer                10^6 nodes           │
└─────────────────────────────────────────────────┘

Fix the algorithm with iterative DFS; the rendering layer is
a separate problem.
```

### The question candidates always dodge

Q: DFS doesn't find shortest paths. So why is it ever the right choice over BFS?

A: Two reasons. First, DFS uses O(depth) stack memory; BFS uses O(width) frontier memory. For a deep narrow graph, DFS is cheaper. Second, DFS is the foundation of an entire family of algorithms — topological sort, strongly-connected components, biconnectivity, cycle detection — that BFS can't easily produce because they depend on *finish times* (the order in which DFS *returns from* each node, not enters it). The recursive call stack naturally tracks finish times for free; BFS has no equivalent notion. When someone says "I need to topologically sort tasks with dependencies," BFS is genuinely wrong. The "DFS doesn't find shortest paths" framing assumes the question is shortest-path; for the other half of graph problems, DFS is the right tool and BFS is the worse one.

Diagram:

```
When DFS earns its place over BFS

┌──────────────────────────────┬────────────────────────────────┐
│ Problem                       │ Why DFS                        │
├──────────────────────────────┼────────────────────────────────┤
│ Topological sort              │ post-order finish times        │
│ Strongly-connected components │ Tarjan/Kosaraju depend on DFS  │
│ Cycle detection (directed)    │ in-progress / done coloring    │
│ Articulation points / bridges │ low-link values via DFS tree   │
│ Generate all simple paths     │ recursive enumeration          │
│ Deep + narrow exploration     │ O(depth) vs O(width)           │
└──────────────────────────────┴────────────────────────────────┘

BFS owns: shortest unweighted paths, level-by-level processing.
DFS owns: everything that needs finish times or path information.
```

### One-line anchors

- "DFS uses LIFO; BFS uses FIFO. That's the only algorithmic difference."
- "The recursion stack IS the DFS path being explored."
- "DFS doesn't find shortest paths — but it does find topological order, cycles, and components."
- "Iterative DFS exists for when recursion would overflow; the reincodes graphs never get that big."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the 6-node graph (`0-1-2`, `0-3`, `1-4`, `3-4`, `4-5`) and trace recursive DFS from node 0. At each step, write the call stack (which frames are active) and the answer array.

Open the file. Compare with the trace in Move 2 sub-section A.

✓ Pass: final answer `[0, 1, 2, 4, 3, 5]` and your call-stack trace matches frame-by-frame.
✗ Fail: re-read Move 2 sub-section A. Wait 10 minutes. Try again.

### Level 2 — Explain it out loud

Explain recursive DFS from `Graph.ts` to an imaginary colleague who just asked "wait, where does the path live during a DFS — there's no path array anywhere?" No notes. Under 90 seconds.

Checkpoints — did you:
- Name the specific file and function?
  → `src/utils/data_structures/Graph.ts`, `dfs_traversal` L241–L273 (helper at L255–L264)
- Explain that the JS call stack of active frames IS the current path?
- Name the failure mode (stack overflow at ~10k depth)?

### Level 3 — Apply it to a new scenario

Without looking at the file, answer:

A user reports that the grid page hangs when they bump the width/height sliders past 80×80 and click DFS. The page becomes unresponsive for ten seconds before recovering. Walk through what's happening and what your three options are to fix it.

Write your answer. 3–5 sentences minimum. Then open `src/app/graphs/grid/page.tsx` L156–L189 to check whether your diagnosis matches the animated DFS code.

### Level 4 — Defend the decision you'd change

The biggest tradeoff in this file is recursive vs iterative DFS. Answer in writing:

"If you were rewriting the grid page's DFS today, knowing that contributors might bump the grid size past 100×100, would you keep the recursive form or switch to iterative? Why? What changes in `dfs_traversal` at `src/app/graphs/grid/page.tsx` L156–L189?"

Reference the actual code when you answer:
- Point to `src/app/graphs/grid/page.tsx` L156–L189 (the recursive form)
- Point to `src/utils/data_structures/Graph2.ts` L228–L253 (the iterative reference)

### Quick check — code reference test

Without opening any files, answer:
- What file defines the recursive `dfs_traversal` (in the `Graph` class)?
- What does the function return?
- Where is the iterative-DFS reference (commented out)?

Then open both files and verify.

✓ Pass: you named `src/utils/data_structures/Graph.ts` (the `Graph.dfs_traversal`).
✓ Pass: you said it returns the visit-order array (`answer`).
✓ Pass: you named `src/utils/data_structures/Graph2.ts` for the iterative version.
✗ Fail on lines: that's fine — line numbers change.
