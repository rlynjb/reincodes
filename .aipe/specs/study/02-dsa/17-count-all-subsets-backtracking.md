# Count all subsets (backtracking)

**Industry name(s):** Subset enumeration, backtracking, power set generation
**Type:** Industry standard · Language-agnostic

> For a set of size n, enumerate all 2^n subsets by deciding "include or exclude" each element recursively. Visualized at `/recursions/count-all-subsets` with a branching call tree.

**See also:** → [18-n-choose-k](./18-n-choose-k.md) · → [16-fibonacci-recursion](./16-fibonacci-recursion.md) · → [10-n-ary-tree](./10-n-ary-tree.md)

---

## Why care

You're given a set of options and asked "list every combination," or "find the best subset under a constraint," or "test every configuration." All require generating subsets. The textbook approach: for each element, recursively branch into "include" and "exclude." 2^n leaves, one per subset.

Same pattern: every backtracking algorithm (N-queens, sudoku, subset-sum, partition), every brute-force NP search, every powerset generator.

---

## How it works

Picture deciding what to pack for a trip. For each item: pack it or don't. After deciding all items, you have one packed-bag configuration. To list all possible bags, exhaust all decisions — that's 2^n configurations.

### The algorithm

```
function countAllSubsets(items, idx = 0, current = []):
  if idx == items.length:
    record(current)              // a complete subset
    return

  // Branch 1: exclude items[idx]
  countAllSubsets(items, idx + 1, current)

  // Branch 2: include items[idx]
  current.push(items[idx])
  countAllSubsets(items, idx + 1, current)
  current.pop()                  // backtrack
```

The recursion produces 2 children at each level until depth n. Total leaves = 2^n. Total nodes in the tree: 2^(n+1) - 1.

### Trace on `[1, 2, 3]`

```
Call tree (depth 3):

                           idx=0, []
                         /            \
                  exclude 1            include 1
                  idx=1, []            idx=1, [1]
                  /      \              /         \
            ex 2          inc 2      ex 2         inc 2
            idx=2,[]     idx=2,[2]   idx=2,[1]    idx=2,[1,2]
            /  \         /  \         /  \         /  \
          [] [3]      [2] [2,3]    [1] [1,3]    [1,2] [1,2,3]

8 leaves = 2^3 subsets:
  [], [3], [2], [2,3], [1], [1,3], [1,2], [1,2,3]
```

### Complexity

- Time: O(2^n × n) — 2^n subsets, copying each takes O(n).
- Space: O(n) for recursion stack + O(2^n × n) for all subsets if you collect them.

### Backtracking pattern

The pattern is: *make a decision, recurse, undo the decision*. The `current.pop()` after the include branch is the backtrack — it removes what was added so the next branch sees a clean state. Same shape in N-queens (place queen, recurse, remove queen), sudoku (set cell, recurse, unset), and combination generation.

### The principle

This is what people mean by *enumerate by structured decisions*. Each element corresponds to a binary decision; the recursion explores all combinations of decisions. By structuring the decision tree, you guarantee uniqueness (no subset is generated twice) and completeness (every subset is generated).

The full picture is below.

---

## Backtracking subset enumeration — diagram

```
For [1, 2, 3], the decision tree:

                          start
                       (idx=0, [])
                   /                  \
                exclude 1           include 1
                  /                       \
        (idx=1, [])               (idx=1, [1])
            /   \                   /         \
       ex 2    inc 2             ex 2        inc 2
       /         \               /              \
   (idx=2,[])  (idx=2,[2])  (idx=2,[1])   (idx=2,[1,2])
    /   \       /     \       /    \         /      \
 ex 3 inc 3   ex 3 inc 3   ex 3  inc 3    ex 3    inc 3
   |    |     |     |       |    |          |      |
   []  [3]   [2]  [2,3]    [1] [1,3]    [1,2] [1,2,3]

8 leaves, each a unique subset.
Total nodes: 2^(n+1) - 1 = 15 for n=3.
```

---

## In this codebase

**Page:** `src/app/recursions/count-all-subsets/page.tsx`.
**Reference impl:** `src/utils/notes/Recursions/Count_all_subsets.ts`.
**Tree visualizer:** `CallstackVisualizer` reads from a `Tree` instance.

GitHub: `[count-all-subsets/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/recursions/count-all-subsets/page.tsx)`.

---

## Elaborate

### Where this pattern comes from
Backtracking as a named pattern goes back to Walker (1960), formalised by Knuth in *The Art of Computer Programming*. The subset-enumeration variant is the simplest backtracking algorithm — only one recursion per level.

### The deeper principle
*Decisions structure the search space.* Each element is a binary decision; the tree of decisions is the entire search space. The same idea generalises to k-ary decisions (which colour for this node?), constrained decisions (only certain values valid), and pruned decisions (skip subtrees if constraint already violated — that's where backtracking gets its speed).

### Where this breaks down
- n > ~25: 2^25 = 33M subsets, doable. n > 30: 1B, slow. n > 40: infeasible.
- The pattern is brute force by definition — no smarter approach exists for "enumerate all subsets." Speed comes from *pruning* (skip subtrees that can't satisfy constraints) — which turns it into branch-and-bound.

### What to explore next
- [18-n-choose-k](./18-n-choose-k.md) — subsets of exactly k elements.
- Branch-and-bound — backtracking + pruning.
- Dynamic programming over subsets (bitmask DP).

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Backtracking             │ Bitmask iteration        │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time             │ O(2^n × n)               │ O(2^n × n)               │
│ Stack            │ O(n) recursion           │ O(1)                     │
│ Code shape       │ Recursive branches       │ for i in 0..2^n          │
│ Pruning          │ Easy (early return)      │ Hard                     │
│ State tracking   │ Implicit via params       │ Bit operations           │
│ Teaching         │ Demonstrates recursion   │ Demonstrates bit hacks   │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Stack efficiency. Each level adds a stack frame; at n=20 you're 20 frames deep — fine, but stacks are finite. Bitmask iteration uses O(1) stack.

### What the alternative would have cost

Bitmask iteration: `for (let mask = 0; mask < (1<<n); mask++) { ... }` — each `mask` is a subset (bit i = include item i). Faster constant factor, no stack growth, but loses the visual "decision tree" structure.

### The breakpoint

Fine for visualisation up to n=5 (32 subsets, tree fits on screen). For production enumeration at n ≤ 25, both backtracking and bitmask work. Above n=25, you need pruning or DP.

---

## Tech reference (industry pairing)

### Backtracking + Tree visualisation

- **Codebase uses:** Recursive enumeration with each call adding a `TreeNode` for visualization.
- **Why it's here:** demonstrates branching recursion and backtracking.
- **Leading today:** Backtracking — `adoption-leading` for constraint-satisfaction problems, 2026.
- **Why it leads:** the natural shape for "explore decisions, undo on backtrack."

---

## Summary

### Part 1 — concept recap

Count-all-subsets uses backtracking: for each element, recurse into "exclude" and "include" branches; at depth n, record the current subset and backtrack. reincodes implements it on `/recursions/count-all-subsets/page.tsx` and visualises the decision tree via `CallstackVisualizer`. The constraint is "enumerate all 2^n subsets," and the cost is exponential — no smarter brute-force exists.

### Part 2 — key points to remember

- Two recursive calls per element: exclude, then include.
- `current.pop()` after include = the backtrack.
- 2^n leaves, each a unique subset.
- O(2^n × n) time; O(n) stack.
- Foundation of constraint search (N-queens, sudoku, subset-sum).

---

## Interview defense

### What an interviewer is really asking

When someone asks about subset enumeration, they want to hear "2^n combinations, decision tree, backtracking" and ideally a follow-up about pruning. The trap question: "what's the difference between backtracking and brute force?"

### Likely questions

**Q [mid]: Trace the backtracking for `[a, b]` showing each call.**

A:
```
call(idx=0, [])
  exclude a: call(idx=1, [])
    exclude b: call(idx=2, []) → record []
    include b: call(idx=2, [b]) → record [b]
  include a: call(idx=1, [a])
    exclude b: call(idx=2, [a]) → record [a]
    include b: call(idx=2, [a,b]) → record [a,b]
4 subsets: [], [b], [a], [a,b]
```

**Q [senior]: What's the difference between backtracking and brute force?**

A: Brute force generates *all* candidates and checks each. Backtracking *prunes* — it skips entire subtrees of the decision space when it knows they can't lead to a solution. For "enumerate all subsets" the question is moot (you need them all), but for "find a subset summing to T," backtracking can abort an include-branch the moment current sum exceeds T — turning 2^n into something much smaller in practice.

```
┌── Brute force ────────────┐    ┌── Backtracking ───────────┐
│  Generate all 2^n         │    │  Generate decisions       │
│  Check each               │    │  Prune subtrees on        │
│                           │    │    constraint failure     │
│  Always 2^n               │    │  Often much less          │
│  Used for: enumeration    │    │  Used for: search w/      │
│                           │    │    constraints            │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: At n=40, can you list all 2^40 subsets?**

A: 2^40 ≈ 1 trillion. You can't store all of them — but you can stream them (generate one at a time, process, discard). The recursive form is fine for streaming. The bigger question is "why do you want them all?" — if you're searching for some specific subset, use backtracking with pruning or DP over subsets (which uses bitmask integers). True enumeration past n=30 is rarely the right shape.

### One-line anchors

- "Decision tree of include/exclude → 2^n subsets."
- "Backtracking = make decision, recurse, undo."
- "Brute force enumerates; backtracking prunes."
- "Foundation of constraint-search algorithms."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the decision tree for `[a, b, c, d]`. Mark depth and count leaves.

### Level 2 — Explain it out loud
"What does `current.pop()` do, and why is it necessary?"

### Level 3 — Apply it to a new scenario
"Subset-sum: find a subset of `[3,7,8,1]` summing to 11. Use backtracking with pruning."

### Level 4 — Defend the decision you'd change
"Would you replace recursion with bitmask iteration here?"

### Quick check
- File? → `src/app/recursions/count-all-subsets/page.tsx`.
- Subsets count? → 2^n.
- Complexity? → O(2^n × n) time.

✓ Pass: all three.
