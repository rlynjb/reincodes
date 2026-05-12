# State-space BFS

**Industry name(s):** State-space search, implicit-graph BFS
**Type:** Industry standard · Language-agnostic

> BFS where the "graph" is built on the fly — each node is a state, each edge is a valid move. Used in `/graphs/river-crossing-puzzle` to find the minimum-step solution.

**See also:** → [12-bfs](./12-bfs.md) · → [11-graph-adjacency-list](./11-graph-adjacency-list.md)

---

## Why care

You've got a puzzle: 3 guards and 3 prisoners need to cross a river in a boat that holds 2, and prisoners must never outnumber guards on either shore. What's the minimum number of crossings? You don't have a graph of crossings — you have *rules* about valid states and moves. State-space search builds the graph as it explores.

This is the canonical *implicit-graph* problem. Same shape as: solving the 15-puzzle, finding the shortest sequence of moves in a Rubik's cube, planning agent actions, parser generators (states + transitions). The graph isn't pre-built; it's discovered.

---

## How it works

Picture exploring a hedge maze. You don't have a map — you only know where you are and which directions are open. State-space BFS does that: start at the initial state, generate all valid next states, queue them, repeat. The "map" emerges as the search proceeds.

### The shape

Two functions are needed:

1. **Encode a state** as a hashable key (so you can detect "already visited").
2. **Generate neighbours** from a state (a function `neighbours(state) → [states]`).

Then run BFS — but instead of looking up neighbours from a pre-built graph, *compute them*.

```
function stateSpaceBFS(initial, isGoal, neighbours):
  visited = new Map()
  queue = []
  parent = new Map()

  visited.set(encode(initial), true)
  queue.push(initial)

  while queue.length > 0:
    current = queue.shift()
    if isGoal(current):
      return reconstructPath(parent, initial, current)
    for next of neighbours(current):
      key = encode(next)
      if !visited.has(key):
        visited.set(key, true)
        parent.set(key, current)
        queue.push(next)
  return null  // unreachable
```

### River-crossing example

```
// src/utils/data_structures/River_crossing_puzzles/PG.ts (simplified)

class PGState {
  guards_left: number   // 0..3
  prisoners_left: number
  boat_side: "L" | "R"
  toString(): "${g},${p},${side}"
}

function pg_result_of_move(state, num_guards, num_prisoners):
  // compute new state after moving num_guards + num_prisoners across
  // validate: no negative counts, no prisoner-outnumbering-guard on either side
  // return new PGState or null

function pg_neighbors(state):
  moves = [[1,0], [2,0], [0,1], [0,2], [1,1]]   // 5 possible boat loads
  return moves.map(m => pg_result_of_move(state, m[0], m[1])).filter(Boolean)
```

The state space has 4 × 4 × 2 = 32 possible states (`g_left ∈ 0..3`, `p_left ∈ 0..3`, side `L|R`). Many are invalid (prisoners outnumber guards); BFS skips them.

### Trace: river-crossing initial expansion

```
Initial state: (3, 3, L)   // 3 guards, 3 prisoners, boat on left
Goal:          (0, 0, R)

Step 1: dequeue (3,3,L)
  neighbours via boat moves:
    move (1,0): (2,3,R) — invalid: prisoners 3 > guards 2 on right? on left 2 vs 3.
                          actually on left: 2 guards < 3 prisoners → INVALID
    move (2,0): (1,3,R) — on left: 1 guard < 3 prisoners → INVALID
    move (0,1): (3,2,R) — on left: 3 guards ≥ 2 prisoners ✓
                          on right: 0 guards < 1 prisoner? 0 vs 1 — but G_R=0 doesn't outnumber
                          the rule is "if G > 0 and G < P, invalid". G=0 → OK.
    move (0,2): (3,1,R) — left: 3 vs 1 ✓; right: 0 vs 2, G=0 → OK ✓
    move (1,1): (2,2,R) — left: 2 vs 2 ✓; right: 1 vs 1 ✓
  
  push (3,2,R), (3,1,R), (2,2,R)

Step 2: continue BFS from each.
...

(Eventually reaches (0,0,R) in 11 moves — the classic answer.)
```

### Complexity

- Time: O(S + T) where S = visited states, T = transitions.
- Space: O(S) for visited set.

State-space size matters. For river-crossing, S ≤ 32. For Rubik's cube, S ≈ 4 × 10^19 — too big for plain BFS.

### "When brute force is fine"

State spaces ≤ ~10^7 fit in memory. Above that, you need bidirectional BFS, iterative deepening, or heuristic-guided search (A*, IDA*).

### The principle

This is what people mean by *implicit graph* algorithms. The graph isn't a data structure — it's *defined by code*. Each call to `neighbours()` materialises edges on demand. Same pattern: game tree search, parser state machines, agent planning. The graph is only as big as what you visit.

The full picture is below.

---

## State-space BFS — diagram

```
                     (3,3,L)        initial
                    /   |    \
              (3,2,R) (3,1,R) (2,2,R)
              /  |    /  |    /  |  \
          ...  ...  ... ...  ... ... ...

  Each node = a (guards_left, prisoners_left, boat_side) tuple.
  Each edge = a boat move that produces a valid next state.

  BFS explores breadth-first, finding shortest move sequence to (0,0,R).

  The "graph" is computed lazily by pg_neighbors() — never stored in full.
```

---

## In this codebase

**Solver:** `src/utils/data_structures/River_crossing_puzzles/PG.ts` — `PGState`, `pg_neighbors`, `solve_pg_bfs` (and `create_prisoners_and_guards` which builds the full graph during BFS).
**Page:** `src/app/graphs/river-crossing-puzzle/page.tsx`.

GitHub: `[PG.ts](https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/River_crossing_puzzles/PG.ts)`.

---

## Elaborate

### Where this pattern comes from
State-space search has roots in operations research and early AI (Newell & Simon's General Problem Solver, 1959). Every puzzle-solving paper from the 1970s uses it. The "implicit graph" framing crystallised once graph terminology became dominant.

### The deeper principle
*If the graph fits in memory, BFS solves it.* When it doesn't, you need heuristic guidance (A*), bidirectional search, or sampling. State-space BFS is the floor; everything more sophisticated improves on this base.

### Where this breaks down
- State space too big: exponential blow-up in agent planning, full game trees.
- States hard to encode for visited: encoding bugs are the #1 source of state-space search bugs.
- Non-uniform move costs: use Dijkstra over the implicit graph.

### What to explore next
- [12-bfs](./12-bfs.md) — the underlying algorithm.
- A* with admissible heuristic for larger state spaces.
- IDA* (iterative deepening A*) for memory-constrained search.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ State-space BFS          │ Pre-built graph + BFS    │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Memory at start  │ O(1)                     │ O(V + E) up front        │
│ Memory at end    │ O(visited)               │ O(V + E)                 │
│ Code shape       │ neighbours() function    │ Build graph, then BFS    │
│ Suits            │ Puzzles, planning, games │ Known fixed graphs       │
│ Lazy             │ Yes — only visit needed   │ No — all built          │
│ Visited encoding │ Critical — bugs here =   │ Just node indices         │
│                  │ wrong answer             │                          │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Compile-time check on graph structure. When you build a graph explicitly, you can validate it before searching. With state-space BFS, neighbour bugs surface as wrong answers.

### What the alternative would have cost

Pre-building the river-crossing graph would mean enumerating all 32 states up front and adding edges per move — same end result, more memory and code. For small state spaces it's a wash; for big ones, implicit wins.

### The breakpoint

Fine when state space fits in memory. Switch to A* or sampling when state space exceeds ~10^7.

---

## Tech reference (industry pairing)

### Implicit graph + BFS

- **Codebase uses:** `PGState.toString` for hashable encoding + `Graph2.insertNode` to build the explicit subgraph as BFS proceeds.
- **Why it's here:** the only feasible way to solve puzzle-shape problems without enumerating states up front.
- **Leading today:** State-space search — `adoption-leading` for combinatorial puzzles, 2026.
- **Why it leads:** the natural fit when "graph" is defined by rules.

---

## Summary

### Part 1 — concept recap

State-space BFS treats the search problem as an implicit graph: each state is a node, each valid move is an edge, and BFS finds the shortest move sequence to a goal. reincodes implements it for river-crossing — `PGState` encodes a state, `pg_neighbors` generates valid next states, `solve_pg_bfs` runs BFS. The constraint is "graph defined by rules, not data," and the cost is correctness depends entirely on the encoding + neighbour function.

### Part 2 — key points to remember

- Each state hashes to a string (`PGState.toString`) for the visited set.
- `neighbours(state)` returns valid moves; rules are encoded in `pg_result_of_move`.
- The graph is materialised lazily — only states reached are stored.
- Shortest path back to start = minimum move count.
- Foundation for game-tree search, planning, parsing.

---

## Interview defense

### What an interviewer is really asking

When someone asks about state-space search, they want to hear "implicit graph, BFS, hashable state, neighbour function." The follow-up: "what if the state space is huge?" — then A*, bidirectional, iterative deepening.

### Likely questions

**Q [mid]: How do you avoid revisiting states?**

A: Encode each state to a hashable string (or tuple) and store it in a `Set`. When BFS generates a neighbour, check the set first — skip if already there. The encoding *must* be canonical: `(3,2,L)` and `(3,2,L)` must produce the same string.

**Q [senior]: How big is the state space for an n-disk Tower of Hanoi, and would state-space BFS work?**

A: 3^n states (each disk on one of 3 pegs). For n=15, that's ~14M states — BFS works but memory is tight. For n=25, 850 billion states — infeasible. The trick is that Tower of Hanoi has a *closed-form* solution (recursive structure with provably optimal moves), so BFS is overkill anyway. For genuine search problems without closed form (15-puzzle, ~10^13 states), use IDA* with the Manhattan-distance heuristic.

**Q [arch]: At Rubik's cube scale (~10^19 states), what changes?**

A: Plain BFS is impossible — memory and time both blow up. Mitigations: (1) IDA* with pattern-database heuristics (precomputed lower bounds on remaining moves), (2) bidirectional BFS from start and goal, meet in middle (cuts effective depth by half), (3) approximate algorithms — Kociemba's two-phase algorithm doesn't find the optimal solution but finds a good one in ms.

### One-line anchors

- "Graph is defined by code, not data."
- "Visited set keyed by canonical state encoding."
- "BFS gives shortest move sequence."
- "At big scale → IDA* with admissible heuristic."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the first 2 levels of the state-space tree for river-crossing starting from `(3,3,L)`. Mark invalid states.

### Level 2 — Explain it out loud
"How does state-space BFS know when it's seen a state before?"

### Level 3 — Apply it to a new scenario
"Wolf-goat-cabbage puzzle. Define the state and neighbour function in 2 sentences each."

### Level 4 — Defend the decision you'd change
"Would you use Dijkstra instead of BFS for river-crossing?"

### Quick check
- File? → `src/utils/data_structures/River_crossing_puzzles/PG.ts`.
- State encoding? → `${g_left},${p_left},${side}`.
- Why BFS not DFS? → BFS gives shortest move count.

✓ Pass: all three.
