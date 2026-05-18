# Recursion and the Fibonacci call tree

**Industry name(s):** Recursion, top-down recursion, memoization (dynamic programming, top-down), naive recursive Fibonacci
**Type:** Industry standard · Language-agnostic

> A function calling itself to break a problem into smaller versions of the same problem, traced through the classic `fib(n) = fib(n-1) + fib(n-2)` recurrence with its exponential O(2^n) call tree. The codebase visualizes the call tree via an n-ary `Tree` and shows how memoization collapses the duplicate calls.

**See also:** → [11-n-ary-tree-traversal.md](./11-n-ary-tree-traversal.md)

---

## Why care

You write a function that renders a comment thread. Each comment has replies; each reply has its own replies; depth is unknown. Your function calls itself on every child. This is recursion in its most ordinary frontend form — a component that renders a component that renders a component, all the way down. You wrote one yesterday and didn't think of it as a recursive algorithm because the values being "computed" were JSX.

Now imagine the values are numbers. `fib(n)` returns the nth Fibonacci number: `fib(0) = 0`, `fib(1) = 1`, `fib(n) = fib(n-1) + fib(n-2)`. The function calls itself twice for every value it needs, so calling `fib(5)` calls `fib(4)` and `fib(3)`, which call `fib(3), fib(2)` and `fib(2), fib(1)` respectively. The call tree explodes: `fib(30)` triggers ~1.6 million function calls. `fib(40)` triggers ~200 million. `fib(50)` would lock up the browser tab for minutes.

That explosion is what the **Fibonacci visualizer** at `/recursions/fibonacci-numbers` exists to make visible. The page wraps the recursive call in a side-effectful tree builder — every recursive invocation adds a child node to an n-ary `Tree`. The result is a literal picture of the exponential branching, the same shape your comment-thread component has but with one critical difference: most of the branches are *recomputing the same values*. `fib(2)` appears in the tree five times when you compute `fib(5)`. Each appearance recomputes from scratch.

**Why you need to answer that question at all:** because the visualizer demonstrates the gap between "recursion is the natural shape of the problem" and "recursion as written is exponential." The naive Fibonacci is the canonical example because the gap is dramatic — O(2^n) without memoization, O(n) with — and the structural change is one extra line: cache the result before recursing. Every dynamic programming problem the reader will encounter has this same shape: spot the redundant work, cache it.

Without memoization:
- `fib(30)` → ~1.6M calls → ~50ms on a modern laptop
- `fib(40)` → ~200M calls → ~5 seconds, browser tab unresponsive
- `fib(50)` → ~25B calls → effectively forever

With memoization:
- `fib(30)` → 31 unique calls → <1ms
- `fib(40)` → 41 unique calls → <1ms
- `fib(50)` → 51 unique calls → <1ms

Memoization is what your comment-thread component would need if rendering the same comment twice cost the same as rendering the original — and React's reconciler IS doing memoization, by `key`. Same idea, applied to function calls instead of DOM nodes.

---

## How it works

The recurrence:

```
fib(0) = 0
fib(1) = 1
fib(n) = fib(n-1) + fib(n-2)   for n >= 2
```

Two base cases that terminate the recursion. One recursive case that branches into two calls per invocation.

The naive recursive implementation in pseudocode:

```
function fib(n):
  if n <= 1: return n            ← base case
  return fib(n-1) + fib(n-2)     ← two recursive calls
```

For `fib(5)`, the call tree is:

```
                    fib(5)
                  ╱       ╲
              fib(4)       fib(3)
             ╱     ╲       ╱    ╲
         fib(3)  fib(2) fib(2) fib(1)
         ╱    ╲   ╱ ╲   ╱  ╲
     fib(2) fib(1) fib(1) fib(0) fib(1) fib(0)
     ╱   ╲
  fib(1) fib(0)

Counting calls: 1 + 2 + 4 + 6 + 4 = 15 calls for fib(5).
The pattern is roughly 2^n total calls (more precisely, Fibonacci(n+1) calls).

Notice: fib(3) appears twice. fib(2) appears 3 times.
fib(1) appears 5 times. fib(0) appears 3 times.
The duplicate work IS the inefficiency.
```

### Bridge from frontend

A recursive function with two recursive calls is the same shape as a React component that returns two child components, each of which renders its own children. The component tree branches the same way the call tree does. The frontend escape hatch — React's `key` prop and reconciliation — is doing a form of memoization: if the same component with the same key appears in the new render, React reuses the old instance instead of mounting fresh. Memoizing `fib` is the same idea, applied to function results instead of component instances.

If you've used `React.memo`, `useMemo`, or `useCallback`, you've already used memoization. The Fibonacci example is what those hooks would solve if your render function had the same explosive call shape.

### What the codebase actually does

The codebase's Fibonacci implementation in `src/app/recursions/fibonacci-numbers/page.tsx` is NOT the naive O(2^n) recursion. It's a tail-recursive linear-time variant — "bottom-up decrease and conquer." Read L20–L40:

```
function bottom_up_decrease_and_conquer_find_fibonacci(n, b1=0, b2=1):
  # side-effect: append a node to the visualization tree
  if (n !== parentCounter && !tree.find(n)):
    tree.insert(parentCounter, n, ...)
  parentCounter = n

  if (n == 0):
    return b1
  else:
    return bottom_up_decrease_and_conquer_find_fibonacci(n-1, b2, b1+b2)
```

This is the iteration-disguised-as-recursion form. Each recursive call decrements `n` and shifts the rolling pair `(b1, b2)` forward one step. It runs in O(n) with a single recursion branch — no exponential blowup. The "tree" being built has one node per recursive call, so the visualizer shows a linear spine, not the explosive branching.

The naive form is what the file's URL claims to visualize, but the actual implementation has already been optimized. The treatment below walks both forms because the naive form is the pedagogical interview question; the codebase's form is the right production answer.

### The naive recursive form — execution trace

```
function fib(n):
  if n <= 1: return n
  return fib(n-1) + fib(n-2)
```

Tracing `fib(4)`:

```
Call fib(4):
  n=4 > 1, so return fib(3) + fib(2)
  └─ Call fib(3):
       n=3 > 1, so return fib(2) + fib(1)
       └─ Call fib(2):
            return fib(1) + fib(0)
            ├─ Call fib(1): return 1
            └─ Call fib(0): return 0
            sum = 1, return 1
       └─ Call fib(1): return 1
       sum = 1 + 1 = 2, return 2
  └─ Call fib(2):
       return fib(1) + fib(0)
       ├─ Call fib(1): return 1
       └─ Call fib(0): return 0
       sum = 1, return 1
  sum = 2 + 1 = 3, return 3

Total calls: 9.
fib(0) was called 2 times. fib(1) was called 3 times. fib(2) was called 2 times.
fib(3), fib(4) once each.

For fib(n) in general, total calls ≈ fib(n+1) ≈ phi^n where phi = 1.618.
This is "exponential" — every increment of n multiplies the work by ~1.618.
```

Complexity (naive): O(phi^n) ≈ O(2^n) time · O(n) space (recursion stack depth).

### The memoized form — execution trace

The fix: remember each `fib(k)` the first time it's computed, return the cached value subsequently.

```
function fib(n, memo={}):
  if n in memo: return memo[n]
  if n <= 1: return n
  result = fib(n-1, memo) + fib(n-2, memo)
  memo[n] = result
  return result
```

Tracing `fib(4)`:

```
Call fib(4, {}):
  n not in memo, n > 1
  → fib(3, {}) + fib(2, {?})        ← memo is mutated as fib(3) runs

  └─ Call fib(3, {}):
       n not in memo, n > 1
       → fib(2, {}) + fib(1, {?})
       └─ Call fib(2, {}):
            n not in memo, n > 1
            → fib(1, {}) + fib(0, {?})
            ├─ Call fib(1, {}): return 1
            └─ Call fib(0, {}): return 0
            result = 1; memo = {2: 1}; return 1
       └─ Call fib(1, {2:1}): return 1
       result = 2; memo = {2: 1, 3: 2}; return 2

  └─ Call fib(2, {2:1, 3:2}):
       n IN memo! return memo[2] = 1     ← saved one whole subtree

  result = 2 + 1 = 3; memo = {2:1, 3:2, 4:3}; return 3

Total calls: 6 (down from 9 for fib(4)).
For fib(n) in general, total calls = 2n + 1 — linear in n.
```

The cache hit on the second `fib(2)` skipped re-computing the whole subtree underneath it. For larger n the savings compound exponentially:

- `fib(10)` naive: ~177 calls; memoized: 21 calls.
- `fib(20)` naive: ~21,891 calls; memoized: 41 calls.
- `fib(30)` naive: ~2.7M calls; memoized: 61 calls.
- `fib(40)` naive: ~331M calls; memoized: 81 calls.

Complexity (memoized): O(n) time · O(n) space (memo + stack).

### The iterative form — what the codebase ships

The codebase's `bottom_up_decrease_and_conquer_find_fibonacci` (page.tsx L20–L40) sidesteps both naive recursion AND memoization by structuring the computation as a forward sweep with two rolling values:

```
function fib_iterative(n, a=0, b=1):
  if n == 0: return a
  return fib_iterative(n - 1, b, a + b)

# Equivalent loop form:
function fib_iterative_loop(n):
  a = 0, b = 1
  for _ in range(n):
    a, b = b, a + b
  return a
```

Tracing `fib(4)` via the recursive iterative form:

```
fib_iterative(4, a=0, b=1):
  n != 0 → fib_iterative(3, a=1, b=1)
fib_iterative(3, a=1, b=1):
  n != 0 → fib_iterative(2, a=1, b=2)
fib_iterative(2, a=1, b=2):
  n != 0 → fib_iterative(1, a=2, b=3)
fib_iterative(1, a=2, b=3):
  n != 0 → fib_iterative(0, a=3, b=5)
fib_iterative(0, a=3, b=5):
  n == 0 → return 3

fib(4) = 3 ✓
```

One linear chain of 5 calls, no branching, no memo dictionary needed. The two rolling values `(a, b)` are the only state. Complexity: O(n) time, O(n) space for the recursion stack (or O(1) in a true loop form).

This is what the codebase visualizes. Each call adds one child to the tree (`tree.insert(parentCounter, n, ...)` at L25–L30), producing a left-leaning spine of n+1 nodes:

```
            fib(4)
              │
            fib(3)
              │
            fib(2)
              │
            fib(1)
              │
            fib(0)
```

The pedagogical loss is that this hides the exponential blowup of the naive form — which is the more interesting thing to visualize. The page is titled "Fibonacci Numbers" but the algorithm shown is the linear-time version; a future version of the page could toggle between the two recurrences to make the difference visible.

### Brute force vs optimal — computing fib(n)

── Brute force ──────────────────────────────────

Pseudocode (naive double-recursion):

```
function fib(n):
  if n <= 1: return n
  return fib(n-1) + fib(n-2)
```

Execution trace — `fib(6)`:

```
fib(6) calls fib(5) and fib(4).
  fib(5) calls fib(4) and fib(3).
    fib(4) calls fib(3) and fib(2).
      ...
  fib(4) calls fib(3) and fib(2).      ← same subtree as inside fib(5)'s descent
    ...

Total calls for fib(6) ≈ fib(7) = 13. Plus the call to fib(6) itself = 25 calls.
For fib(20): ~21,891 calls.
For fib(30): ~2.7M calls.
For fib(40): ~331M calls — visibly slow in the browser.
```

Complexity: O(phi^n) ≈ O(1.618^n) time · O(n) space.

What goes wrong at scale: the work doubles every two increments of n. The browser tab becomes unresponsive around n=35 on a fast laptop, n=30 on a phone. Worse, the problem isn't that the answer takes long to compute — the answer is small enough to fit in a 64-bit integer up to n≈90. The problem is that you're recomputing the same values trillions of times.

── Optimal ──────────────────────────────────────

The insight: every recursive call with the same `n` produces the same result. Cache it the first time and return the cache thereafter.

Pseudocode (memoized):

```
function fib(n, memo={}):
  if n in memo: return memo[n]
  if n <= 1: return n
  memo[n] = fib(n-1, memo) + fib(n-2, memo)
  return memo[n]
```

Execution trace — `fib(6)`:

```
fib(6): not in memo → compute fib(5) + fib(4)
  fib(5): not in memo → compute fib(4) + fib(3)
    fib(4): not in memo → compute fib(3) + fib(2)
      fib(3): not in memo → compute fib(2) + fib(1)
        fib(2): not in memo → compute fib(1) + fib(0)
          fib(1): base, return 1
          fib(0): base, return 0
        memo[2] = 1, return 1
        fib(1): base, return 1
      memo[3] = 2, return 2
      fib(2): IN memo, return memo[2] = 1
    memo[4] = 3, return 3
    fib(3): IN memo, return memo[3] = 2
  memo[5] = 5, return 5
  fib(4): IN memo, return memo[4] = 3
memo[6] = 8, return 8

Total unique computations: 7 (n = 0..6).
Plus cache-hit calls: 4.
Total: 11 calls for fib(6) — vs 25 for naive.
For fib(40): 81 calls — vs 331M.
```

Complexity: O(n) time · O(n) space (memo dict + recursion stack).

Why it's faster: every value `fib(k)` is computed exactly once; subsequent requests are cache hits. The total number of unique computations is `n+1`, the recursive descent depth is `n`, and the rest of the calls are O(1) cache hits.

── Comparison ───────────────────────────────────

```
┌─────────────────┬────────────────┬──────────────────┐
│                 │ Naive recursive│ Memoized         │
├─────────────────┼────────────────┼──────────────────┤
│ Time            │ O(phi^n)       │ O(n)             │
│ Space           │ O(n)           │ O(n) memo+stack  │
│ At n=10         │ 177 calls      │ 21 calls         │
│ At n=20         │ ~22k calls     │ 41 calls         │
│ At n=30         │ ~2.7M calls    │ 61 calls         │
│ At n=40         │ ~331M calls    │ 81 calls         │
│ At n=50         │ ~40B calls     │ 101 calls        │
│ Code complexity │ 2 lines        │ 4 lines + memo   │
│ Readability     │ matches recur. │ requires memo    │
│                 │                │ awareness        │
└─────────────────┴────────────────┴──────────────────┘
```

When brute force is fine: when n is small (under 25 or so), when this is the first time you're explaining recursion to someone (the naive form is more readable), or when you're using Fibonacci as a teaching example for what NOT to do. The naive form is also fine when the recurrence doesn't have overlapping subproblems — e.g. computing a tree's depth (one call per node, no overlap) is O(n) even with naive recursion.

For Fibonacci specifically, the optimal is actually the iterative form (what the codebase ships), not memoized recursion. It's O(n) time and O(1) space (two rolling values, no memo, no stack):

```
function fib(n):
  a = 0, b = 1
  for _ in range(n):
    a, b = b, a + b
  return a
```

Memoized recursion gets the same time as iterative but pays O(n) space for the memo and another O(n) for the stack. Iterative wins on space. The codebase chose iterative-via-recursion, which is the worst of both worlds for production but the best of both worlds for visualization (each call adds one tree node — the animation is easy to drive).

---

## Fibonacci call tree — diagram

```
RECURRENCE:
  fib(0) = 0
  fib(1) = 1
  fib(n) = fib(n-1) + fib(n-2)       for n >= 2

NAIVE CALL TREE for fib(5):

                       fib(5)
                      ╱      ╲
                 fib(4)        fib(3)
                ╱     ╲       ╱     ╲
            fib(3)  fib(2) fib(2)  fib(1)
            ╱   ╲    ╱ ╲    ╱  ╲     │
        fib(2) fib(1) fib(1) fib(0) fib(1) fib(0)
        ╱   ╲                       
    fib(1) fib(0)

Counting: 15 nodes for fib(5).
For fib(n): ~fib(n+1) nodes ≈ phi^n.
Every internal node has exactly 2 children (the recurrence).

THE DUPLICATION:
  fib(3) appears 2 times.
  fib(2) appears 3 times.
  fib(1) appears 5 times.
  fib(0) appears 3 times.

  Each appearance recomputes the same value from scratch.

MEMOIZED CALL TREE for fib(5):

                       fib(5)
                      ╱       ╲
                  fib(4)       fib(3) ◀── cache hit
                  ╱    ╲       (returns memo[3])
              fib(3)  fib(2) ◀── cache hit
              ╱    ╲    
          fib(2) fib(1) ◀── (memo not yet populated; cache miss)
          ╱    ╲
      fib(1) fib(0)

Counting: 9 nodes for fib(5). For fib(n): 2n+1 nodes.

ITERATIVE FORM (what the codebase ships) for fib(5):

   fib(5, a=0, b=1)
        │
   fib(4, a=1, b=1)
        │
   fib(3, a=1, b=2)
        │
   fib(2, a=2, b=3)
        │
   fib(1, a=3, b=5)
        │
   fib(0, a=5, b=8) → return a = 5

Linear spine: n+1 nodes total. No branching.
This is what the visualizer renders.

The Tree class (Tree.ts) holds this spine as TreeNodes; each
node's `desc` field holds the human-readable label
`fn(${n}-1, ${b1}, ${b1} + ${b2})` for display in
CallstackVisualizer.
```

---

## In this codebase

**File:** `src/app/recursions/fibonacci-numbers/page.tsx`
**Function:** `bottom_up_decrease_and_conquer_find_fibonacci`
**Renders via:** `src/components/CallstackVisualizer`
**Backed by:** `src/utils/data_structures/Tree.ts` (the n-ary tree)

Key line ranges in `page.tsx`:

- Tree instantiation: L17 — `new Tree(initialParent, null, ...)`
- The recursive function: L20–L40
- Side-effectful tree append (one node per call): L24–L31
- Base case (`n === 0`) returning `b1`: L35–L36
- Recursive case: L38 — `bottom_up_decrease_and_conquer_find_fibonacci(n-1, b2, b1+b2)`
- `useEffect` driving the computation when `initialParent` changes: L42–L47
- Increase/decrease buttons modifying `initialParent`: L50–L56
- `CallstackVisualizer` renders the resulting `Tree`: L72

The function uses `parentCounter` (a closure-scoped variable at L16) to thread the "parent node id" through the recursion — each recursive call adds itself as a child of the previous call's node. The `tree.find(n)` guard on L24 prevents inserting the same value twice (the visualization is single-spine, no duplicates), which is a hint that an earlier version of this code may have used naive recursion that would have produced duplicates.

`Tree.ts` is covered in [11-n-ary-tree-traversal.md](./11-n-ary-tree-traversal.md). The relevant API for this page: `tree.insert(parentKey, key, value, desc)` and `tree.find(key)`.

---

## Elaborate

### Where this pattern comes from

The Fibonacci recurrence comes from Leonardo of Pisa (Fibonacci, 1202), who used it to model rabbit population growth. The recursive function form became a CS textbook staple in the 1960s because it's the simplest example of a problem with overlapping subproblems — every introductory algorithms course uses it to motivate dynamic programming. The naive recursive O(2^n) implementation isn't anyone's actual algorithm for computing Fibonacci numbers; it's the teaching scaffold for "don't do this, here's why."

Memoization as a technique was named by Donald Michie in 1968. The general dynamic programming framework (Bellman, 1950s) preceded it. Both are answers to the same question: "if my recursive function calls itself on the same input multiple times, can I avoid the repeated work?" Top-down DP (memoized recursion) and bottom-up DP (iterative table filling) are two implementations of the same idea.

### The deeper principle

Recognize redundancy in the call graph. The naive Fibonacci's failure isn't that recursion is slow — it's that the recursion tree visits the same subproblem many times. Any recursive algorithm with overlapping subproblems can be sped up by caching the results of each subproblem the first time it's computed.

The general technique: check whether the recursion's input space is small and whether the same input recurs across the call tree. If both are true, memoize. The input space for `fib` is `0..n`, which is small. Each `fib(k)` recurs many times across the tree. Memoization collapses the exponential tree into a linear chain.

This principle generalizes to every DP problem: longest common subsequence, knapsack, coin change, matrix chain multiplication. The recurrence describes the problem; memoization makes the recurrence fast.

### Where this breaks down

Memoization breaks down when the input space is too large to cache. Fibonacci has input space `[0, n]` — small, easy to memoize. A problem like "longest common subsequence of two strings A and B" has input space `[0, |A|] × [0, |B|]` — quadratic. For 10k × 10k, that's 100M entries — possibly fine for a server, possibly OOM in a browser.

Memoization also breaks down when subproblems aren't actually pure — when the recursive function reads or writes external state. Caching `fib` works because `fib(k)` always returns the same value. Caching a function that reads from a database doesn't, unless you're sure the read is also cached.

Recursion breaks down at depth limits. JavaScript engines typically allow ~10,000 stack frames before throwing `RangeError: Maximum call stack size exceeded`. For Fibonacci's iterative-as-recursion form, this caps the input at ~n=10,000. The naive form caps at n≈35 simply because of the wall clock, never reaching the stack limit.

### What to explore next

- Bottom-up dynamic programming → fill a table from base cases up instead of recursing top-down; same complexity, no recursion stack
- Matrix exponentiation for Fibonacci → compute fib(n) in O(log n) using `[[1,1],[1,0]]^n`; cute but rarely the right answer in practice
- Tail-call optimization → in languages that support it (Scheme, ES6 spec — but not most JS engines), the iterative-as-recursion form runs in O(1) space
- Trampolining → a technique to simulate tail-call optimization in languages that don't have it natively; useful for deep recursive algorithms

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬────────────────────────┬────────────────────────┐
│ Cost dimension   │ Memoized recursion     │ Iterative loop         │
│                  │                        │ (what codebase ships)  │
├──────────────────┼────────────────────────┼────────────────────────┤
│ Time             │ O(n)                   │ O(n)                   │
│ Space            │ O(n) memo + O(n) stack │ O(1) two vars          │
│                  │                        │ (O(n) if recursive)    │
│ Stack depth limit│ ~10k frames in V8      │ unlimited (loop)       │
│ Reads recursively│ yes — matches recur.   │ no — must rewrite      │
│                  │ description            │ recurrence as loop     │
│ Memo overhead    │ dict allocations       │ none                   │
│ Visualizable     │ tree with branching    │ linear spine           │
│ Code shape       │ matches math notation  │ requires loop variable │
│                  │                        │ bookkeeping            │
└──────────────────┴────────────────────────┴────────────────────────┘
```

### Sub-block 1 — what we gave up

**Pedagogical clarity.** The codebase ships the iterative form (linear spine in the visualization) but Fibonacci's pedagogical value is the exponential branching of the naive form. A viewer at n=10 sees five linear nodes and wonders why anyone calls this "recursive." The interesting picture — 177 nodes branching outward — is the one not shown.

**Stack depth on large inputs.** The recursive-iterative form recurses n times, which means the stack is n frames deep. V8's default stack limit is ~10,000 frames; n=10,000 hits the wall. The pure-loop form (`for _ in range(n)`) has no such limit. For the visualizer's range of n (up to ~30 in practice), this doesn't matter; it would matter the moment someone wanted to compute `fib(50000)`.

**Memo overhead in the memoized form.** Each `memo[k] = value` allocates a dictionary entry. For n=1M, that's 1M dict entries — measurable memory. The iterative form holds two variables.

### Sub-block 2 — what the alternative would have cost

If the codebase used the naive recursive form, the visualizer would show the exponential tree — which is the more interesting picture pedagogically. But the page would block for ~5 seconds at n=35 and crash the tab at n=40. For an interactive visualizer where the user can increment n with a button (page.tsx L50–L52), the responsiveness loss is unacceptable. The iterative form trades the dramatic visualization for instant feedback.

A toggle ("show naive call tree" vs "show iterative spine") would be the ideal — the user picks based on whether they want to see the failure mode or the fix. The page doesn't ship this; it's a small refactor that would add the missing teaching surface.

### Sub-block 3 — the breakpoint

Fine as iterative-via-recursion while n stays under ~5,000 (well below V8's stack limit). At larger n, swap to the pure-loop form to avoid stack overflow. The pure-loop form is two lines of code and O(1) space; the only reason the codebase uses the recursive form is to make every call a tree node for the visualizer. A future version could build the tree iteratively too — `for k in range(n+1): tree.insert(...)` — which would lift the stack-depth cap entirely.

### Sub-block 4 — what wasn't actually a tradeoff

The matrix exponentiation form (`fib(n) = [[1,1],[1,0]]^n[0][1]`) was not a real alternative. It computes `fib(n)` in O(log n) but obscures the recursive structure entirely — the visualizer would show ~log₂(n) matrix multiplications instead of the recurrence's natural shape. For a teaching visualizer, the O(n) iterative form is the right level of abstraction; O(log n) matrix exp is for production code where you actually need fib(1,000,000).

A bignum library (BigInt or `bn.js`) was not a real alternative either at the visualizer's scale. JavaScript numbers are safe up to 2^53, and `fib(78)` is the largest Fibonacci number that fits — well above the visualizer's interactive range. BigInt would matter only if the page wanted to visualize fib at n=100+.

---

## Tech reference (industry pairing)

### Plain recursive functions (no library)

- **Codebase uses:** `function bottom_up_decrease_and_conquer_find_fibonacci(n, b1=0, b2=1)` at `page.tsx` L20–L40. Hand-written tail recursion.
- **Why it's here:** the visualization needs one tree node per call. A loop wouldn't produce the per-step structure that `CallstackVisualizer` renders.
- **Leading today:** plain recursion — adoption-leading for tree-shaped problems, 2026.
- **Why it leads:** every language supports it, no library overhead, the code reads like the recurrence relation. Standard for divide-and-conquer, tree traversal, and DP-top-down.
- **Runner-up:** trampoline pattern (a higher-order function that calls a function repeatedly until it returns a non-function value) — niche; used when tail-call optimization isn't available and recursion would blow the stack.

### Closure-based state threading (`parentCounter`)

- **Codebase uses:** `let parentCounter = initialParent` at `page.tsx` L16, mutated inside the recursive function. Threads "what was the previous call's id" through the recursion via outer scope.
- **Why it's here:** lets each recursive call know which tree node to attach itself to without passing the parent ID as a parameter. Avoids changing the function signature.
- **Leading today:** explicit parameter passing (pure functional) — adoption-leading for pure code, 2026.
- **Why it leads:** explicit data flow, no hidden state mutations, easier to test and reason about. The codebase's closure approach is convenient but couples the function to its module scope.
- **Runner-up:** state object passed by reference — adoption-leading for OOP-heavy codebases. Slightly more verbose than closures but explicit.

### Memoization via plain object (not used here, but the standard fix)

- **Codebase uses:** none. The iterative form sidesteps the need for memoization.
- **Why it's here:** the naive recursion would need it; the codebase's form doesn't.
- **Leading today:** plain object or `Map` as memo dictionary — adoption-leading, 2026.
- **Why it leads:** zero dependency, O(1) average lookup, fits the "small cache per call" pattern naturally. `Map` is preferred over plain object for arbitrary keys.
- **Runner-up:** `lodash.memoize` — adoption-trailing now (memoization in 2026 is mostly hand-rolled); useful when you want a memoized version of an existing function without modifying it.

---

## Summary

Fibonacci's naive recursive form is the canonical example of how a function that calls itself can produce an exponential call tree because the same subproblems are recomputed many times. In this codebase, `src/app/recursions/fibonacci-numbers/page.tsx` ships an iterative-via-tail-recursion variant that runs in O(n) by passing two rolling values forward — `fib(n-1, b2, b1+b2)` — and builds a linear-spine tree via `Tree.insert` for the visualizer. The constraint that forced the iterative form was browser responsiveness: the naive O(2^n) form locks the tab at n=40, and the visualizer wants the user to increment n with a button and see instant feedback. The cost paid is pedagogical clarity — the picture the visualizer shows (a linear spine) hides the dramatic branching that motivates the dynamic-programming lesson the page exists to teach.

Key points to remember:

- The recurrence `fib(n) = fib(n-1) + fib(n-2)` describes the math; the implementation determines the complexity.
- Naive recursion is O(phi^n) ≈ O(1.618^n) because every internal node has two children and most subproblems are recomputed.
- Memoization (top-down DP) collapses the call tree to O(n) by caching each `fib(k)` the first time it's computed.
- Iteration (bottom-up DP) achieves the same O(n) time with O(1) space if implemented as a loop with two rolling values.
- The codebase's `bottom_up_decrease_and_conquer_find_fibonacci` is iterative-as-recursion: O(n) time, O(n) recursion stack space, one tree node per call.
- The visualizer renders the call tree via `Tree` (`src/utils/data_structures/Tree.ts`), which is the n-ary tree with generator-based traversal covered in [11-n-ary-tree-traversal.md](./11-n-ary-tree-traversal.md).
- Recursion is the natural shape of a recurrence; converting it to fast code is the algorithm-design exercise that DP makes formal.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about Fibonacci, they're not testing whether you can compute Fibonacci numbers. They're testing whether you can spot redundant work in a recursive call graph and name the technique to fix it. The follow-up — "now memoize it" or "now do it iteratively" — is the actual signal. The naive form is the setup; the rewrite is the punchline.

### Likely questions

[mid] Q: Write the naive recursive Fibonacci. Then tell me its complexity.

A: `function fib(n) { if (n <= 1) return n; return fib(n-1) + fib(n-2); }`. Time complexity is O(phi^n) ≈ O(1.618^n), more loosely O(2^n). Space is O(n) for the recursion stack — the maximum depth before the leftmost descent unwinds. The exponential time comes from the call tree's branching factor of 2 combined with overlapping subproblems — most `fib(k)` values get recomputed many times across the tree.

Diagram:
```
Naive call tree for fib(5):
                fib(5)
              ╱        ╲
          fib(4)        fib(3)        ← duplicate
        ╱     ╲          ╱   ╲
    fib(3)  fib(2)   fib(2) fib(1)    ← more duplicates
    ╱  ╲    ╱  ╲      ╱  ╲
  fib(2) fib(1) fib(1) fib(0) fib(1) fib(0)

  Total ~15 nodes for fib(5). For fib(n), ~phi^n nodes.
```

[senior] Q: Now memoize it. What changed structurally?

A: Add a memo dictionary and check it before recursing: `if (memo[n] !== undefined) return memo[n]; memo[n] = fib(n-1, memo) + fib(n-2, memo); return memo[n];`. Structurally, the call tree collapses — every unique `fib(k)` is computed once; subsequent requests are cache hits. The tree's effective shape becomes a linear chain of unique computations with O(1) cache-hit detours at each branch point. Time goes from O(phi^n) to O(n) because there are n+1 unique inputs. Space stays O(n) but now it's O(n) memo plus O(n) stack — same asymptotic, double the constant.

Diagram:
```
Memoized call tree for fib(5):

                fib(5)
              ╱       ╲
          fib(4)      fib(3) ◀── cache hit O(1)
        ╱     ╲
    fib(3)  fib(2) ◀── cache hit O(1)
    ╱   ╲
  fib(2) fib(1) ◀── O(1) base case
  ╱   ╲
fib(1) fib(0)

  Unique computations: 6 (n=0..5).
  Cache hits: 4.
  Total calls: 10 — vs ~15 for naive.

  For fib(n): 2n+1 calls — linear.
```

[arch] Q: Memoization is O(n) time and O(n) space. Iterative is O(n) time and O(1) space. Why ever choose memoization?

A: Memoization keeps the recursive structure of the original code, which matches the mathematical statement of the problem. For Fibonacci that's a small win because the iterative form is also short. For problems where the recurrence has multiple parameters or non-trivial structure — longest common subsequence, edit distance, knapsack — the iterative form requires designing the table fill order, while the memoized form just adds two lines (check memo, store memo) to the natural recursion. Memoization is faster to write; iteration is faster to run. For Fibonacci I'd ship iterative; for first-pass implementations of complex DP problems, I'd ship memoized and convert to iterative only if profiling demanded it.

Diagram:
```
Tradeoff axes:

                    │ Time  │ Space  │ Write-time │ Read-time  │
────────────────────┼───────┼────────┼────────────┼────────────┤
 Naive recursion    │ phi^n │ O(n)   │ minutes    │ trivial    │
 Memoized           │ O(n)  │ O(n)   │ +2 lines   │ trivial    │
 Iterative loop     │ O(n)  │ O(1)   │ +rewrite   │ requires   │
                    │       │        │            │ loop logic │

For DP problems with non-trivial recurrences, the
"natural" form is memoization; iteration is the
optimization pass.
```

### The question candidates always dodge

Q: You said the call tree branches by 2 and the recursion has overlapping subproblems. But you also said Fibonacci is O(2^n). If most subtrees are duplicates of each other, shouldn't the count be way less than 2^n?

A: Honest answer: the duplicates aren't "the same subtree" in the sense of pointer-equality — they're recomputed independently in the naive form. Each duplicate subtree is itself fully expanded. The total node count is the total number of recursive calls, which IS roughly phi^n, more loosely 2^n. The phi instead of 2 reflects that one branch (`fib(n-1)`) is slightly larger than the other (`fib(n-2)`) — the call tree isn't perfectly balanced. Memoization is what *converts* the count from "duplicates fully expanded" to "duplicates as cache hits." Without memoization, the tree's structural redundancy isn't algorithmically realized — it's just sitting there being recomputed. The 2^n bound captures the worst case where every internal node has 2 children. The phi^n bound is tighter because of the imbalance. Both are exponential, both are bad, both are the reason memoization matters.

Diagram:
```
The duplicate-subtrees illusion:

  In the naive form, every fib(2) call is its own
  separate execution. They share IDENTITY in the math
  ("they both compute fib(2)") but NOT in execution.

  fib(2) at position A: ─→ runs full subtree, returns 1
  fib(2) at position B: ─→ runs full subtree, returns 1
  fib(2) at position C: ─→ runs full subtree, returns 1

  Each subtree is ~phi^k nodes for fib(k). The
  duplicates multiply the work, not collapse it.

  Memoization is what collapses them — the second
  call sees memo[2] and skips the subtree.

  Without memo: phi^n work.
  With memo: each unique fib(k) computed once.
             Total work: 2n+1 ≈ O(n).
```

### One-line anchors

- "Naive Fibonacci's O(2^n) isn't because recursion is slow — it's because the same subproblems are recomputed."
- "Memoization adds two lines and collapses O(2^n) to O(n)."
- "Iterative beats memoized on space (O(1) vs O(n)) but requires rewriting the recurrence as a forward sweep."
- "Recursion is the natural shape of a recurrence; making it fast is the dynamic-programming exercise."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On paper, draw the naive call tree for `fib(5)`. Count the total number of calls, and count separately how many times each of `fib(0), fib(1), fib(2), fib(3), fib(4), fib(5)` appears.

Open the file. Compare against the diagram above.

Pass: your tree matches and you can name which calls are duplicated and why (overlapping subproblems).

### Level 2 — Explain it out loud

Explain why naive Fibonacci is O(2^n) but memoized Fibonacci is O(n). No notes. Under 90 seconds.

Checkpoints:
- Did you name the branching factor (2) and the call tree depth (n)?
- Did you say "the same subproblems are recomputed" or "overlapping subproblems"?
- Did you say what memoization does structurally (each fib(k) computed once; subsequent calls are O(1) cache hits)?

### Level 3 — Apply it to a new scenario

You have a comment thread component that renders a comment and its replies, recursively. Each comment fetches its author's avatar via a `useEffect`. The thread has ~500 comments, but a popular author appears in 80 of them. The page is slow.

Walk through how this is structurally analogous to naive Fibonacci, and what the "memoization" fix looks like for this component. Then open `Tree.ts` L83–L88 (`find`) and `page.tsx` L24 (`tree.find(n)` in the Fibonacci recursive function) and notice how the codebase already uses a `find`-based dedup to avoid inserting the same node twice.

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the codebase ships the iterative form (linear-spine visualization) instead of the naive form (exponential-branching visualization).

"If you were redesigning the `/recursions/fibonacci-numbers` page today, would you keep the iterative form, switch to the naive form, or ship both with a toggle? What would each cost — in browser responsiveness, in teaching surface, in code complexity?"

Reference `page.tsx` L20–L40 and name what would change if you added a "show naive call tree" toggle.

### Quick check — code reference test

Without opening any files:
- What file does the Fibonacci recursion live in?
- What's the function name?
- What's the name of the n-ary tree class it uses to build the visualization?

Open the file and verify.

Pass: you named the file (`page.tsx` under `/recursions/fibonacci-numbers/`), the function (`bottom_up_decrease_and_conquer_find_fibonacci`), and the tree class (`Tree`).
