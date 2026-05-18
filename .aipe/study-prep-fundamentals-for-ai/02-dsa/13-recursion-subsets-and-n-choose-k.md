# Recursion: subsets and n-choose-k

**Industry name(s):** Power set generation, combinations, decrease-and-conquer recursion, include/exclude recursion
**Type:** Industry standard · Language-agnostic

> Two classic recursive shapes — counting/enumerating all 2^n subsets of a set, and pruning that recursion to enumerate only the C(n,k) subsets of size exactly k.

**See also:** → 14-graph-adjacency-list.md · → 16-dfs-traversal.md

---

## Why care

You've built a settings panel with a list of checkboxes — eight feature flags, each with a label. The user opens it, ticks some boxes, leaves others alone, clicks save. Underneath, every combination of checked/unchecked maps to a different feature configuration. Eight checkboxes means 256 possible configurations. If product asks "how many configurations are valid if we require *exactly three* features to be on at once?", you'd reach for math — `C(8,3) = 56` — without thinking about how to enumerate those 56 combinations in code.

That enumeration job is what *include/exclude recursion* answers. Not the counting (which is the math). Not the rendering (which is the checkbox UI). Just the act of walking the decision tree where each item is either *in* the subset or *out*. Power set is the unconstrained version (every leaf is a valid subset). N-choose-k is the same tree pruned to leaves with exactly k items checked.

**Why you need to answer that question at all:** because the moment product asks for "all valid configurations, not just the count," math stops helping you. You have to *produce* the 56 combinations, not just say "there are 56." And the moment a constraint shifts ("k can change at runtime", "some items are mutually exclusive"), an iterative bit-manipulation trick (treat the subset as the bits of an `n`-bit integer) becomes painful to extend. Recursion stays readable.

Without recursion:
- You write nested loops or bit-mask iteration
- Adding a constraint (mutual exclusion, dependency) means rewriting the loop structure
- The code stops looking like the problem ("include or exclude each item")

With recursion:
- Each call decides one item — include or exclude
- Constraints become base-case checks, not loop rewrites
- The function reads top-to-bottom the way the problem reads top-to-bottom

Include/exclude recursion is what you'd already do mentally if someone asked "list every subset of `{a, b, c}`" — branch on `a`, then branch on `b`, then branch on `c`, collect the leaves. The function is just the mental shape made literal. The decrease-and-conquer count in `/recursions/count-all-subsets` is the same shape with the include/exclude branches both folded into one `2 *` multiplication. The full mechanics are below.

---

## How it works

### Move 1 — The mental model: a list of checkboxes, two branches per item

Picture eight checkboxes on screen. You're going to enumerate every possible state by walking down the list, and at each checkbox you fork the universe: one branch where the box is checked, one where it isn't. After eight forks, every leaf is one complete configuration. There are `2 * 2 * 2 * ... * 2 = 2^8 = 256` leaves.

```
Decision tree for {a, b, c}                       2^3 = 8 leaves

                       root (subset so far = [])
                       /                       \
                    [+a]                       [-a]
                    /  \                       /  \
                 [+b]   [-b]                [+b]   [-b]
                  /\     /\                  /\     /\
              [+c][-c][+c][-c]           [+c][-c][+c][-c]

leaves:     {a,b,c} {a,b} {a,c} {a}  {b,c} {b} {c}  {}
```

This is the same shape as a recursive component tree — each `<Checkbox>` decides "render with `checked` or with `unchecked`," and the children below it inherit the decision. The recursion is just the mental shape made code.

The strategy in one line: every item has two branches — include it in the current subset, or skip it. Recurse on the remainder. Base case: no items left, emit the current subset.

### Move 2 — Two recursive shapes

The reincodes repo has two recursion pages built on this idea. They differ in *what gets returned*: count-all-subsets returns a count (the number of leaves), n-choose-k would return either a count or the list of size-k subsets. The underlying decision tree is identical.

**Sub-section A: Power set as decrease-and-conquer count**

The cleanest framing is "count the subsets of `{0..n-1}`." For each item, there are two choices. So `f(n) = 2 * f(n-1)`, with `f(0) = 1` (the empty set is one subset of the empty set). The function in `count-all-subsets/page.tsx` is exactly that:

```
function count_all_subsets(n):
  if n == 0:
    return 1                          // base case: empty set
  return 2 * count_all_subsets(n - 1) // include + exclude, folded
```

If you're coming from frontend, think of it as a recursive component that always renders one child and multiplies its result by 2. The `2 *` is the include/exclude branch, but you don't enumerate either branch — you just count both.

Execution trace for `count_all_subsets(3)`:

```
call                          returns        why
─────────────────────────     ─────────      ────────────────────
count_all_subsets(3)          ?              2 * f(2)
  count_all_subsets(2)        ?              2 * f(1)
    count_all_subsets(1)      ?              2 * f(0)
      count_all_subsets(0)    1              base case
    count_all_subsets(1)      2 * 1 = 2      unwinding
  count_all_subsets(2)        2 * 2 = 4      unwinding
count_all_subsets(3)          2 * 4 = 8      final
```

Complexity: O(n) time, O(n) stack space — the recursion is linear because each call makes exactly one recursive call, not two. (The full enumeration is O(2^n); this counts without enumerating.) The reincodes visualizer also builds a `Tree` of the call frames so the `CallstackVisualizer` can show the recursion unwinding.

**File:** `src/app/recursions/count-all-subsets/page.tsx`
**Function:** `decrease_and_conquer_count_all_subsets`
**Lines:** L21–L45

**Sub-section B: Power set as full enumeration (include/exclude)**

To actually *produce* the 2^n subsets — not just count them — you fork on each item. The function carries the *current subset under construction* and the *index it's currently deciding*.

```
function subsets(items, index, current, result):
  if index == items.length:
    result.push(copy of current)      // leaf: emit subset
    return
  // branch 1: exclude items[index]
  subsets(items, index + 1, current, result)
  // branch 2: include items[index]
  current.push(items[index])
  subsets(items, index + 1, current, result)
  current.pop()                       // backtrack
```

The bridge from frontend: if you've ever written a recursive map over a tree of `{ id, children }` nodes, the backtrack pattern is what you do when you want to share a mutable accumulator down the tree without leaking state across sibling branches. Push before recursing, pop after.

Execution trace for `subsets(['a','b'], 0, [], [])`:

```
step  call                            current   result
────  ──────────────────────────────  ────────  ──────────────────
 1    subsets([a,b], 0, [], [])       []        []
 2    └─ subsets([a,b], 1, [], [])    []        []
 3    │   └─ subsets([a,b], 2, ...)   []        [[]]            ← emit
 4    │   push 'b' → current = [b]    [b]       [[]]
 5    │   subsets([a,b], 2, [b], ...) [b]       [[],[b]]        ← emit
 6    │   pop → current = []          []        [[],[b]]
 7    push 'a' → current = [a]        [a]       [[],[b]]
 8    └─ subsets([a,b], 1, [a], ...)  [a]       [[],[b]]
 9    │   subsets([a,b], 2, [a], ...) [a]       [[],[b],[a]]    ← emit
10    │   push 'b' → current = [a,b]  [a,b]     [[],[b],[a]]
11    │   subsets([a,b], 2, [a,b],...)[a,b]     [[],[b],[a],[a,b]] ← emit
12    │   pop → current = [a]         [a]       [[],[b],[a],[a,b]]
13    pop → current = []              []        [[],[b],[a],[a,b]]
```

Complexity: O(n · 2^n) time (2^n leaves, each emitted with an O(n) copy), O(n) stack space plus O(n · 2^n) for the result.

**Sub-section C: N-choose-k as a pruned subset recursion**

C(n, k) is the same tree, pruned. Each leaf is a subset of size exactly k. Two pruning rules turn the unconstrained recursion into an n-choose-k recursion:

- If `current.length == k`, you don't need to include any more items — emit and return.
- If `current.length + (items.length - index) < k`, you can't possibly reach k even by including every remaining item — abort this branch.

```
function n_choose_k(items, index, current, k, result):
  if current.length == k:
    result.push(copy of current)
    return
  remaining = items.length - index
  if current.length + remaining < k:
    return                            // prune: can't reach k
  if index == items.length:
    return                            // exhausted
  // include items[index]
  current.push(items[index])
  n_choose_k(items, index + 1, current, k, result)
  current.pop()
  // exclude items[index]
  n_choose_k(items, index + 1, current, k, result)
```

The bridge from frontend: pruning is the same idea as a `key`-based early return in a render — if a subtree can't possibly produce the output you want, you skip rendering it. Here the "render" is a recursive call, and the "skip" is a `return`.

Execution trace for `n_choose_k([a,b,c], 0, [], 2, [])` — only the pruned branches matter:

```
step  call                                  current   result          notes
────  ────────────────────────────────────  ────────  ──────────────  ─────────────
 1    n_choose_k(0, [], k=2)                []        []
 2    push 'a' → current = [a]              [a]       []
 3    n_choose_k(1, [a], k=2)               [a]       []
 4    push 'b' → current = [a,b]            [a,b]     []
 5    n_choose_k(2, [a,b], k=2)             [a,b]     [[a,b]]         ← length==k, emit
 6    pop → current = [a]                   [a]       [[a,b]]
 7    n_choose_k(2, [a], k=2)               [a]       [[a,b]]         remaining=1, need 1 more
 8    push 'c' → current = [a,c]            [a,c]     [[a,b]]
 9    n_choose_k(3, [a,c], k=2)             [a,c]     [[a,b],[a,c]]   ← emit
10    pop → current = [a]                   [a]       [[a,b],[a,c]]
11    n_choose_k(3, [a], k=2)               [a]       [[a,b],[a,c]]   PRUNED: index==end
12    pop → current = []                    []        [[a,b],[a,c]]
13    n_choose_k(1, [], k=2)                []        [[a,b],[a,c]]
14    push 'b' → current = [b]              [b]       [[a,b],[a,c]]
15    n_choose_k(2, [b], k=2)               [b]       [[a,b],[a,c]]
16    push 'c' → current = [b,c]            [b,c]     [[a,b],[a,c],[b,c]] ← emit
... etc
```

The pruning is what makes n-choose-k cheaper than enumerating all 2^n subsets and filtering. For `n = 20, k = 3`, you generate 1140 subsets instead of 1,048,576.

The reincodes n-choose-k page is currently a stub — `src/app/recursions/n-choose-k/page.tsx` returns the text "N Choose K." The route exists to slot the visualizer in.

**File:** `src/app/recursions/n-choose-k/page.tsx`
**Status:** stub (route registered; recursion not yet implemented)

### Move 2.5 — Brute force vs optimal (DSA addition)

The "brute force" framing for n-choose-k is *enumerate every subset and filter by size*. The "optimal" framing is the pruned recursion above.

**The data shape:**

```
items: ["a", "b", "c", "d"]     // n = 4
k:     2

goal: produce the C(4,2) = 6 subsets of size exactly 2
```

**Brute force — enumerate all 2^n, filter**

```
function nck_brute(items, k):
  all_subsets = power_set(items)              // generate all 2^n
  return all_subsets.filter(s => s.length == k)
```

Execution trace for n=4, k=2 (showing how much is wasted):

```
step  generated subset    keep?
────  ──────────────────  ─────
 1    []                  no (size 0)
 2    [a]                 no (size 1)
 3    [a,b]               YES
 4    [a,b,c]             no (size 3)
 5    [a,b,c,d]           no (size 4)
 6    [a,b,d]             no (size 3)
 7    [a,c]               YES
 8    [a,c,d]             no (size 3)
 9    [a,d]               YES
10    [b]                 no
11    [b,c]               YES
12    [b,c,d]             no
13    [b,d]               YES
14    [c]                 no
15    [c,d]               YES
16    [d]                 no
```

Complexity: O(2^n) time (generate every subset), O(2^n) space (hold them).

What goes wrong at scale: at n=20, k=3, brute force generates 1,048,576 subsets to find 1,140. At n=30, k=3, it generates 1.07 billion to find 4,060.

**Optimal — pruned recursion**

The insight: the brute force generates branches it could prove are dead. If `current.length + remaining < k`, no leaf below this node can possibly be size-k. Cut the branch.

```
function n_choose_k(items, index, current, k, result):
  if current.length == k:
    result.push(copy of current); return
  remaining = items.length - index
  if current.length + remaining < k:
    return                             // PRUNE
  if index == items.length: return
  current.push(items[index])
  n_choose_k(items, index + 1, current, k, result)
  current.pop()
  n_choose_k(items, index + 1, current, k, result)
```

Execution trace for n=4, k=2 (only the calls that survive pruning):

```
step  call                              current    notes
────  ────────────────────────────────  ─────────  ─────────────
 1    nck(0, [], k=2)                   []
 2    nck(1, [a], k=2)                  [a]
 3    nck(2, [a,b], k=2)                [a,b]      EMIT [a,b]
 4    nck(2, [a], k=2)                  [a]
 5    nck(3, [a,c], k=2)                [a,c]      EMIT
 6    nck(3, [a], k=2)                  [a]
 7    nck(4, [a,d], k=2)                [a,d]      EMIT
 8    nck(4, [a], k=2)                  [a]        PRUNED (need 1 more, 0 remain)
 9    nck(1, [], k=2)                   []         exclude 'a' branch
10    nck(2, [b], k=2)                  [b]
... (mirror of steps 4-8 starting from b)
```

Complexity: O(k · C(n,k)) time, O(n) stack space. The factor `k` is the copy on emit.

Why it's faster: the recursion never visits a subtree it can't fill. At n=20, k=3 the brute force visits all 2^20 nodes; the pruned recursion visits roughly C(20,3) = 1,140 productive nodes plus a small fringe of pruned-but-visited parents.

**Comparison**

```
┌─────────────────────┬────────────────┬────────────────────┐
│                     │ Brute force    │ Pruned recursion   │
├─────────────────────┼────────────────┼────────────────────┤
│ Time                │ O(2^n)         │ O(k · C(n,k))      │
│ Space (output)      │ O(2^n)         │ O(C(n,k))          │
│ n=10, k=3           │ 1,024 subsets  │ 120 subsets        │
│ n=20, k=3           │ ~1M subsets    │ 1,140 subsets      │
│ n=30, k=3           │ ~1B subsets    │ 4,060 subsets      │
│ Readable?           │ very           │ slightly less      │
└─────────────────────┴────────────────┴────────────────────┘
```

**When brute force is fine:** when `n ≤ 12` and you need every subset for other reasons anyway (e.g., you're checking each one for some property that depends on k *and* the contents). The constant-factor overhead of the filter loop is negligible at small n, and the brute force code is one line.

### Move 3 — The principle

Every problem that can be framed as "for each item, two choices" maps onto this recursion. Power set is the unconstrained version. N-choose-k is the constrained one. Subset-sum is the same tree with a different leaf predicate. Generating all permutations is the same tree with an item-pool that shrinks. The pattern isn't subsets; it's *decision-tree recursion with backtracking*, and once you can see it, the same code shape appears in graph coloring, SAT solving, and constraint satisfaction. The full picture is below.

---

## Recursion subset trees — diagram

```
┌─ Power set (count all 2^n subsets) ────────────────────────────┐
│                                                                │
│  count_all_subsets(3)                                          │
│       │                                                        │
│       ▼ returns 2 * count_all_subsets(2)                       │
│  ┌─────────────────────────────────────┐                       │
│  │ recursive frame: n=2                │                       │
│  │   returns 2 * count_all_subsets(1)  │                       │
│  └────────────────┬────────────────────┘                       │
│                   ▼                                            │
│  ┌─────────────────────────────────────┐                       │
│  │ recursive frame: n=1                │                       │
│  │   returns 2 * count_all_subsets(0)  │                       │
│  └────────────────┬────────────────────┘                       │
│                   ▼                                            │
│  ┌─────────────────────────────────────┐                       │
│  │ base case: n=0  → returns 1         │                       │
│  └─────────────────────────────────────┘                       │
│                                                                │
│  unwinds: 1 → 2 → 4 → 8                                        │
└────────────────────────────────────────────────────────────────┘

┌─ N-choose-k (enumerate size-k subsets) ────────────────────────┐
│                                                                │
│                  n_choose_k(items=[a,b,c], k=2)                │
│                            │                                   │
│              include 'a'  ┌┴┐  exclude 'a'                     │
│                  ┌────────┘ └────────┐                         │
│                  ▼                   ▼                         │
│        current = [a]            current = []                   │
│       (need 1 more)             (need 2 more)                  │
│           │                          │                         │
│   inc 'b' / exc 'b'          inc 'b' / exc 'b'                 │
│      ▼      ▼                   ▼      ▼                       │
│   [a,b]    [a]                 [b]    []                       │
│   EMIT      │                   │      │                       │
│             │ remaining=1       │      │ remaining=1           │
│             │ need 1 more       │      │ need 2 more           │
│             │ → inc 'c'         │      │ → PRUNE               │
│             ▼                   ▼      ▼                       │
│          [a,c] EMIT          [b,c] EMIT                        │
└────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `src/app/recursions/count-all-subsets/page.tsx`
**Function:** `decrease_and_conquer_count_all_subsets`
**Lines:** L21–L45

Trimmed shape:

```
const decrease_and_conquer_count_all_subsets = (n: number) => {
  let result = 0;

  // Build Tree for visualizer (CallstackVisualizer reads this)
  if (n != parentCounter && !tree.find(n)) {
    tree.insert(parentCounter, n);
  }
  parentCounter = n;

  if (n === 0) {
    result = 1;                                          // base case
  } else {
    result = 2 * decrease_and_conquer_count_all_subsets(n - 1);
  }

  tree.find(n).value = result;                           // attach result to frame
  return result;
}
```

The `Tree` (from `src/utils/data_structures/Tree`) is not part of the recursion — it's instrumentation. Every recursive frame inserts a node, attaches its return value, and the `CallstackVisualizer` renders the tree so the reader sees the stack growing and unwinding.

**File:** `src/app/recursions/n-choose-k/page.tsx`
**Status:** stub returning the literal text "N Choose K." The page is registered as a route but the recursion isn't implemented yet.

---

## Elaborate

### Where this pattern comes from

The include/exclude recursion is the textbook framing for combinatorial enumeration — it appears in Knuth's *The Art of Computer Programming* Vol 4A under "Generating all combinations" and in every introductory algorithms course as the gateway to backtracking. The "decrease and conquer" name comes from Anany Levitin's algorithms textbook, which classifies recursive algorithms by how they shrink the problem: decrease by one (linear recursion), decrease by a constant factor (logarithmic), or decrease by a variable amount (Euclid's algorithm). Counting subsets is decrease-by-one.

### The deeper principle

Backtracking. The general pattern is: maintain a partial solution, extend it one decision at a time, prune branches that can't reach a valid full solution, and undo the extension when you back up. The two pruning rules in n-choose-k are instances of two general backtracking heuristics: *target reached* (`current.length == k`) and *target unreachable* (`current.length + remaining < k`). Every constraint-satisfaction problem worth solving has both.

```
┌─ Generalised backtracking shape ──────────────────────────────┐
│                                                               │
│  function backtrack(state):                                   │
│    if is_complete(state):     emit; return                    │
│    if is_dead_end(state):     return         ← pruning lives  │
│    for each choice:                            here           │
│      apply choice to state                                    │
│      backtrack(state)                                         │
│      undo choice                              ← backtrack     │
└───────────────────────────────────────────────────────────────┘
```

### Where this breaks down

When the recursion depth exceeds the JS engine's stack limit (~10,000 frames in V8), straight recursion blows up. For subsets of an array of 10,000+ items you'd either convert to iteration with an explicit stack or use bit manipulation (treat each subset as a binary integer). When the *output* is the bottleneck rather than the recursion — `C(40, 20) ≈ 138 billion` — neither approach saves you; you need a different framing entirely (lazy generation, streaming, sampling).

### What to explore next

- DFS traversal → 16-dfs-traversal.md → same recursion shape, applied to a graph instead of a flat list
- Backtracking with pruning → the general pattern this file is a specialised instance of
- Bit manipulation for power set → the iterative alternative that scales to larger n at the cost of readability

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Recursive (taken)    │ Iterative bit-manip     │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ Time             │ O(n · 2^n) enumerate │ O(n · 2^n)              │
│ Stack space      │ O(n) frames          │ O(1) — just a counter   │
│ Max n in JS      │ ~10,000              │ 32 (int) / 53 (Number)  │
│ Code length      │ 10 lines             │ 15 lines                │
│ Extensibility    │ add base-case check  │ rewrite the bit logic   │
│ Readability      │ reads like problem   │ requires bit fluency    │
│ Animation cost   │ stack frames =       │ no natural frames       │
│                  │ visualizer nodes     │ to animate              │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up

Stack space. Each recursive call pushes a frame; for `n = 5` that's 5 frames, trivial. For `n = 10000` it's a stack overflow. The reincodes visualizer is bounded by what fits on screen anyway, so this never bites — but the moment someone copies this code into a non-visualizer context with large n, it breaks.

Performance constant factor. A function call in V8 is roughly 10–50 ns. A loop iteration over a bit-mask is roughly 1–5 ns. For n=20, that's ~50 ms recursive vs ~5 ms iterative. The visualizer doesn't care because the animation `delayLoop(speed)` dominates, but the iterative version is genuinely faster.

### What the alternative would have cost

If the code had used iterative bit manipulation:

```
for (let mask = 0; mask < (1 << n); mask++) {
  const subset = [];
  for (let i = 0; i < n; i++) {
    if (mask & (1 << i)) subset.push(items[i]);
  }
  result.push(subset);
}
```

The cost: extending it. Adding the n-choose-k pruning means counting set bits (`popcount(mask) == k`) on every iteration — fine for enumeration but a clunky place to add new constraints (mutual exclusion, dependencies, valid configurations). And the `CallstackVisualizer` would have no recursion tree to render — the entire "watch the algorithm step through" feature collapses, because there's no stack to visualize.

The visualizer is the product. Recursion was picked because it produces the visualizable shape, not because it's the fastest implementation.

### The breakpoint

Fine until `n > 20` for full enumeration, or until the reincodes site adds a non-visualizer use of subset enumeration (a batch job, a code-gen step) where stack depth or performance start mattering. At that point switch to iterative bit-manip for power set and a stack-based explicit-state n-choose-k for the constrained case.

### What wasn't actually a tradeoff

Memoization. People often suggest memoizing recursive functions reflexively. For count-all-subsets, the function only ever calls `f(n-1)` once per `n`, so there's nothing to memoize — each `f(k)` is computed exactly once already. Adding a cache would burn memory for no speedup.

---

## Tech reference (industry pairing)

### Recursion (language primitive)

- **Codebase uses:** plain JS function recursion in `count-all-subsets/page.tsx` L21. V8's call stack handles it; no library.
- **Why it's here:** the recursion tree IS what the visualizer renders. The `Tree` instrumentation built up during recursion is the data the `CallstackVisualizer` reads.
- **Leading today:** plain function recursion — adoption-leading, 2026. Every algorithm course and codebase uses it.
- **Why it leads:** zero overhead beyond the call frame; readable; debuggable in any browser devtools.
- **Runner-up:** explicit stack with `Array.push/pop` — used when recursion depth threatens the engine limit, as in the commented-out iterative DFS at the bottom of `Graph2.ts` L228–L253.

### CallstackVisualizer (project component)

- **Codebase uses:** `src/components/CallstackVisualizer` rendering a `Tree` from `src/utils/data_structures/Tree`.
- **Why it's here:** the recursion's visible artifact — what the user actually sees when they open the count-all-subsets page.
- **Leading today:** custom DOM/SVG renderers for educational visualizers — innovation-leading, 2026 (the space is small enough that "industry leader" is misleading). VisuAlgo (the linked reference) and recursion.vercel.app both use custom renderers.
- **Why it leads:** full control over animation timing and frame-by-frame state, which off-the-shelf graph libraries don't expose cleanly.
- **Runner-up:** D3 hierarchy layout (`d3-hierarchy`) — used elsewhere in this repo's NetworkDiagram for force-directed graphs; would work for static recursion trees but is overkill when you control the data structure.

---

## Summary

Include/exclude recursion is the natural shape for enumerating subsets: each item branches into "include" and "exclude," and the leaves are the complete subsets. In reincodes, `decrease_and_conquer_count_all_subsets` folds both branches into a single `2 *` multiplication and counts in O(n) instead of enumerating in O(2^n); the n-choose-k page is a stub awaiting the pruned recursion. The constraint that made recursion the right call here is the visualizer — the recursion's call stack IS the animation, so the iterative bit-manipulation alternative would collapse the entire visual feature. The cost is stack depth, which the in-browser n=3 default never approaches.

- Power set has 2^n subsets; count_all_subsets counts them in O(n) by folding both branches.
- N-choose-k is the same tree pruned to size-k leaves; pruning skips entire subtrees that can't reach k.
- Recursion was picked because the recursion tree is the visualizer's data structure, not because it's the fastest enumeration.
- Stack depth caps usable n around 10,000 in V8; the visualizer never gets close.
- The pattern generalises: every "for each item, two choices" problem maps onto this shape — subset-sum, permutations, constraint satisfaction, graph coloring.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks you to "generate all subsets" or "all combinations of size k," they're not testing whether you can write a loop. They're testing whether you recognise the include/exclude decision tree, whether you know the difference between counting and enumerating, and whether you reach for pruning when constraints make brute-force wasteful. The hidden question is: do you see "for each, two choices" as a single pattern that covers half of combinatorial search?

### Likely questions

[mid] Q: How do you generate the power set of `[a, b, c]`?

A: I recurse with the current index and an accumulator. At each call I make two recursive calls — one that excludes `items[index]`, one that includes it. The base case is `index == items.length`, where I push a copy of the accumulator. The reason to copy on emit is that the accumulator is mutable and shared across the whole recursion; if I push the reference, all my result entries end up pointing to the same array.

Diagram:

```
                  subsets([a,b], 0, [], result)
                       /                  \
            include 'a'                exclude 'a'
                  /                          \
       subsets(1, [a], r)            subsets(1, [], r)
            /       \                    /        \
        inc 'b'   exc 'b'           inc 'b'    exc 'b'
       /             \                /            \
   [a,b] EMIT      [a] EMIT       [b] EMIT      [] EMIT
```

[senior] Q: How would you adapt that to generate `C(n, k)` — exactly size-k subsets — efficiently?

A: Same recursion, two pruning conditions. If `current.length == k`, emit and return — no point including more. If `current.length + (items.length - index) < k`, return early — even including every remaining item can't reach k. With those two cuts, the recursion visits roughly `C(n, k)` productive nodes instead of `2^n`. For n=20, k=3 that's 1140 versus a million.

Diagram:

```
                      n_choose_k decision

┌──── At each node, decide: include or exclude items[index]
│
│  if current.length == k:
│       ┌────────────────────┐
│       │ EMIT and return    │  ← early success
│       └────────────────────┘
│
│  if current.length + (n - index) < k:
│       ┌────────────────────┐
│       │ PRUNE (return)     │  ← early failure
│       └────────────────────┘
│
└──── otherwise, recurse on both branches and backtrack
```

[arch] Q: This recursion overflows the JS stack at large n. How would you scale it to n = 100,000?

A: Three changes. First, the call stack: convert to an explicit stack of `{ index, current, decision }` frames and a `while (stack.length)` loop. Second, the result: stop materializing every subset. Stream them via a generator or callback — `C(100000, 3)` is ~167 billion, you can't hold that in memory. Third, the question: at that scale you're almost never enumerating; you're sampling, counting, or checking a property. So the right move is usually to refactor the call site, not the recursion.

Diagram:

```
What breaks first at n = 100,000

┌─ Output size ───────────────────────────────────┐
│  2^100000 subsets   ◀── BREAKS: doesn't fit in │
│                          any memory anywhere   │
└─────────────────────────────────────────────────┘
┌─ Call stack ────────────────────────────────────┐
│  100,000 frames     ◀── BREAKS: V8 limit       │
│                          ~10k frames           │
└─────────────────────────────────────────────────┘
┌─ Recursion shape ───────────────────────────────┐
│  decision tree      ◀── still fine, but the    │
│                          call site needs to    │
│                          consume lazily        │
└─────────────────────────────────────────────────┘
```

### The question candidates always dodge

Q: Your `count_all_subsets` doesn't actually generate subsets — it just multiplies by 2. Why is that even called recursion-with-include/exclude?

A: It's the same recursion, with both branches folded into the multiplication. The "include" branch and "exclude" branch each produce the same number of subsets of the remainder, so `2 * f(n-1)` is exactly the count of `f(n-1) + f(n-1)`. The function looks linear because we erased the enumeration, but the structure is still "two branches per item." This is decrease-and-conquer's payoff: when you only need the count, you don't pay to enumerate. When the interviewer pushes back with "but it's just `2^n`, why not write that directly?", the answer is that the recursive form is the one that extends — when constraints appear (k limits, dependencies, exclusions), the recursive form takes a one-line base-case change; the closed-form `2^n` is dead.

Diagram:

```
What we picked vs the "just compute 2^n directly" suggestion

┌──────────────────┬──────────────────────┬──────────────────────┐
│ Cost dimension   │ Recursive count       │ Direct 2^n           │
├──────────────────┼──────────────────────┼──────────────────────┤
│ Time             │ O(n)                  │ O(1) (Math.pow)      │
│ Lines            │ 4 (the math part)     │ 1                    │
│ Add k constraint │ change base case      │ rewrite entirely     │
│ Visualizer fit   │ stack frames = tree   │ no frames to animate │
│ Generalises to   │ permutations,         │ nothing — closed     │
│                  │ subset-sum, ...       │ form is specific     │
└──────────────────┴──────────────────────┴──────────────────────┘

The Math.pow version is cheaper now and useless tomorrow.
```

### One-line anchors

- "Power set is `2 * f(n-1)`; n-choose-k is power set pruned to length-k leaves."
- "Recursion was picked because the call stack IS the visualizer's data structure."
- "Brute force enumerates 2^n and filters; pruned recursion visits only the productive subtrees."
- "Stack depth is the ceiling — about 10k frames in V8 — and the visualizer never gets close."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the decision tree for `subsets(['a', 'b', 'c'])`. Label each edge "include" or "exclude" and write the subset at every leaf.

Open the file. Compare.

✓ Pass: 8 leaves, each a distinct subset of `{a, b, c}`, including `{}` and `{a, b, c}`.
✗ Fail: re-read Move 1 and the diagram section, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain decrease-and-conquer subset counting to an imaginary colleague who just asked "wait, how does that recursion in `count-all-subsets/page.tsx` actually count?"  No notes. Under 90 seconds.

Checkpoints — did you:
- Name the file and function?
  → `src/app/recursions/count-all-subsets/page.tsx`, `decrease_and_conquer_count_all_subsets` L21–L45
- Explain why it's `2 *` instead of `2 +`?
- Name the tradeoff (recursion is slower than `Math.pow(2, n)` but extends to constrained cases)?

### Level 3 — Apply it to a new scenario

Without looking at the file, answer:

The product team wants a "feature gate" page that lets the user pick *any combination* of up to 3 features from a list of 10. The UI needs to show every valid combination as a preview card. Walk through how you'd adapt the n-choose-k recursion. What changes if "up to 3" becomes "exactly 3"?

Write your answer. 3–5 sentences minimum. Then open `src/app/recursions/n-choose-k/page.tsx` and `src/app/recursions/count-all-subsets/page.tsx` and check whether your approach matches.

### Level 4 — Defend the decision you'd change

The biggest tradeoff in this file is recursion vs iterative bit manipulation. Answer in writing:

"If you were rewriting `count-all-subsets/page.tsx` today with no visualizer requirement, would you keep the recursion? Why or why not? If you'd change it, what would the iterative bit-manip version look like, and what does that change cost you when the n-choose-k page actually gets built?"

Reference the actual code when you answer:
- Point to `count-all-subsets/page.tsx` L21–L45 to support what exists
- Point to `n-choose-k/page.tsx` L1–L7 (the stub) for what the change would need to support next

### Quick check — code reference test

Without opening any files, answer:
- What file does `decrease_and_conquer_count_all_subsets` live in?
- What's the base case?
- Approximately what line range?

Then open the file and verify.

✓ Pass: you named the file (`src/app/recursions/count-all-subsets/page.tsx`)
✓ Pass: you named the base case (`n === 0` returns 1)
✗ Fail on lines: that's fine — line numbers change.
