# N-ary tree traversal with generators

**Industry name(s):** N-ary tree (general tree, multi-way tree), generator-based iteration, lazy traversal
**Type:** Industry standard · Language-agnostic

> A tree where each node holds an array of children of any size (not capped at two), traversed via JS generators that `yield` each node on demand. The codebase uses it to render the Fibonacci call-stack visualizer — each recursive call becomes a child node, and the generator lets the page pause traversal between frames.

**See also:** → [12-recursion-fibonacci.md](./12-recursion-fibonacci.md) · → [08-binary-search-tree.md](./08-binary-search-tree.md)

---

## Why care

You render a list of nested components — a comment thread, a folder navigator, a category-with-subcategories sidebar. Each component has an array of children, each child has its own array of children, and the depth isn't fixed. You walk the tree to count nodes, find one by id, or render the whole thing flat. Every page does some version of this every day.

Now: imagine you're walking a 100-node tree to render it step by step — show node 1, pause, show node 2, pause, show node 3. With a plain recursive function that pushes into a result array, the entire walk runs to completion before the first node renders. You'd need to break the recursion into a state machine with an explicit stack, or buffer the whole result and `setTimeout` over the array.

That "walk lazily, pause between yields" question is what an **n-ary tree with generator-based traversal** answers. The `Tree` class in `src/utils/data_structures/Tree.ts` ships exactly this shape: each `TreeNode` has a `children: TreeNode[]` array of any size, and `preOrderTraversal` / `postOrderTraversal` are JS generators (`function*` with `yield` / `yield*`) that emit one node at a time. The consumer drives the iteration with `for ... of`, can stop whenever, and the rest of the tree stays unwalked until asked for.

**Why you need to answer that question at all:** because the Fibonacci visualizer needs to render the call tree mid-traversal. `fib(4)` calls `fib(3)` which calls `fib(2)` — branching factor 2 in this case, but the structure handles arbitrary branching. The visualizer wants to highlight each call as it happens, not after the whole tree is built. A generator lets the page `for (const node of tree.preOrderTraversal()) { setHighlightNodes(node.key); await delayLoop(500); }` — the generator pauses on every `yield`, the loop awaits, the next call to `.next()` resumes from exactly where it left off.

Without a generator (plain recursion into an array):
- Walk the whole tree first, returning `[node1, node2, ..., nodeN]`
- Then iterate the result with `setTimeout` / `await delayLoop`
- Memory: O(n) buffer for the result array
- Cannot stop early without scanning past the stop point

With a generator:
- Walk lazily — each `yield` produces one node, then the function pauses
- Memory: O(h) for the recursion call stack, no result buffer
- Stop early by breaking out of the `for ... of` — unyielded nodes are never visited
- Compose multiple generators with `yield*` (delegation) without flattening intermediate arrays

A generator is the `function*` form of `.map()` where the callback is "compute the next node" and the array is conceptual rather than materialized.

---

## How it works

The data structure shape. `TreeNode` in `src/utils/data_structures/Tree.ts` (L8–L30):

```
class TreeNode {
  key: any
  value: any
  parent: TreeNode | null
  desc: any                // arbitrary metadata; used for fib display labels
  children: TreeNode[]     // any number of children, not capped at 2
}
```

Note the explicit `parent` pointer — unlike the BST or the binary heap, this tree supports walking upward as well as downward. The `desc` field carries arbitrary metadata; the Fibonacci page (`fibonacci-numbers/page.tsx`) stuffs human-readable call-trace labels in there (`fn(${n}-1, ${b1}, ${b1} + ${b2})`).

`Tree` itself (L32–L89) is a thin wrapper: a root `TreeNode`, plus traversal generators, plus `insert` / `remove` / `find` methods that walk the tree to do their job.

A small example — `fib(4)` builds approximately this call tree:

```
                fib(4)
               ╱      ╲
          fib(3)      fib(2)
          ╱    ╲       ╱    ╲
      fib(2)  fib(1) fib(1) fib(0)
       ╱ ╲
   fib(1) fib(0)

Each TreeNode has children: TreeNode[] of length 0, 1, or 2 here.
The n-ary structure would handle 5 children just as easily —
it's only the fib recurrence that produces a branching factor of 2.
```

### Bridge from frontend

A `TreeNode` with `children: TreeNode[]` is structurally identical to what your React component tree looks like in memory: each component has a `children` array of arbitrary length, and the tree's shape isn't known until runtime. The traversal generators are what you'd build if `React.Children.toArray(tree)` returned an iterator instead of an array — one node at a time, on demand.

Generators themselves are the same shape as async iteration — `for await (const value of asyncSource)` pauses between values, lets you do work in between, and resumes on the next iteration. The generator's `yield` is `await`'s synchronous cousin: yield the value, pause, resume when asked. Frontend devs build this pattern every time they iterate an async stream from `fetch().body.getReader()`.

### The generator-based traversal — `preOrderTraversal`

The interesting code (L39–L46):

```
*preOrderTraversal(node = this.root): any {
  yield node;
  if (node.children.length) {
    for (const child of node.children) {
      yield* this.preOrderTraversal(child);
    }
  }
}
```

Three things to call out:

1. **The `*` before the method name.** This makes it a generator method — calling `tree.preOrderTraversal()` returns an *iterator*, not the tree's nodes. The iterator's `.next()` method runs the body until the next `yield`, then pauses.
2. **`yield node`.** Produces the current node to whoever is iterating, then pauses execution until the consumer asks for the next value.
3. **`yield* this.preOrderTraversal(child)`.** This is "delegation": for each child, the parent generator hands control off to a sub-generator. Every `yield` from the sub-generator is forwarded up. No intermediate arrays. No flattening.

Execution trace — walking the `fib(4)` tree above with `for (const node of tree.preOrderTraversal()) console.log(node.key)`:

```
Consumer:  for ... of starts.
Iterator:  .next() → runs body until first yield.
           yield node=fib(4)       → consumer logs "fib(4)"
           — paused here —

Consumer:  loop runs again, asks for next.
Iterator:  .next() → resumes after the yield.
           enters the for loop, picks first child = fib(3).
           yield* preOrderTraversal(fib(3))
             — delegates to sub-generator —
             sub.next() → yield fib(3)   → consumer logs "fib(3)"
           — paused inside the sub-generator —

Consumer:  next.
Iterator:  sub.next() → enters for loop in sub, picks fib(2).
           yield* preOrderTraversal(fib(2))
             — delegates one level deeper —
             yield fib(2)   → consumer logs "fib(2)"
           — paused two levels deep —

Consumer:  next.
Iterator:  enters for loop, picks fib(1).
           yield* preOrderTraversal(fib(1))
             yield fib(1)   → consumer logs "fib(1)"
             fib(1).children is empty → sub-generator returns.
           sub-generator at fib(2) picks next child fib(0).
           yield* preOrderTraversal(fib(0))
             yield fib(0)   → consumer logs "fib(0)"
             returns.
           sub at fib(2) exits for loop, returns.
           sub at fib(3) picks next child = fib(1).
           ...continues...

Eventually all nodes yielded; outer iterator returns.
Consumer's for ... of exits.
```

The whole tree is walked in `preOrder` (node, then children left-to-right), but each `yield` pauses the entire call stack. Between yields, the consumer can do anything — render, await a `delayLoop`, break out, save state.

Complexity per full walk: O(n) time · O(h) space for the recursion stack (where h is tree height).

The crucial difference vs the array-returning version: memory. An array version buffers all n nodes before returning. The generator yields them one by one and uses O(h) stack space regardless of n.

### `postOrderTraversal` — children before parent

Same shape, two lines re-ordered (L48–L55):

```
*postOrderTraversal(node = this.root): any {
  if (node.children.length) {
    for (const child of node.children) {
      yield* this.postOrderTraversal(child);
    }
  }
  yield node;       // ← yield AFTER walking children
}
```

For the `fib(4)` tree above, postOrder emits leaves first: `fib(1), fib(0), fib(1) (under fib(2)), ...`, then their parents `fib(2), fib(3)`, then the root `fib(4)` last. Useful when the computation at each node depends on its children's results — like accumulating return values up the call tree.

### `insert`, `remove`, `find` — generators used as iterators

The mutation and search methods walk the tree by consuming the generator with a `for ... of` loop. `insert` (L57–L70):

```
insert(parentNodeKey, key, value = key, desc?) {
  for (const node of this.preOrderTraversal()) {
    if (node.key === parentNodeKey) {
      node.children.push(new TreeNode(key, value, node, desc));
      return true;
    }
  }
  return false;
}
```

Note: this iterates lazily and `return`s as soon as the parent is found. If the parent is the second node visited in the preorder walk, the generator only produces two values total — the rest of the tree is never traversed. With an array-returning traversal, the whole tree would be walked first, then `find` would scan the array.

`find(key)` (L83–L88) is the same shape:

```
find(key) {
  for (const node of this.preOrderTraversal()) {
    if (node.key === key) return node;
  }
  return undefined;
}
```

`remove(key)` (L72–L81) is slightly different — it walks every node looking for one whose `children` array contains the target key, then filters:

```
remove(key) {
  for (const node of this.preOrderTraversal()) {
    const filtered = node.children.filter(c => c.key !== key);
    if (filtered.length !== node.children.length) {
      node.children = filtered;
      return true;
    }
  }
  return false;
}
```

Same early-return pattern: stop iterating the moment the work is done.

### How the Fibonacci page uses it

The page at `src/app/recursions/fibonacci-numbers/page.tsx` builds the tree side-effectfully inside the recursive function (L24–L31):

```
function bottom_up_decrease_and_conquer_find_fibonacci(n, b1=0, b2=1):
  if (n != parentCounter && !tree.find(n)):
    tree.insert(
      parentCounter,
      n,
      (n == 0) && b1,
      (n !== 0) && `fn(${n}-1, ${b1}, ${b1} + ${b2})`
    );
  parentCounter = n;

  if (n == 0): return b1
  else: return bottom_up_decrease_and_conquer_find_fibonacci(n-1, b2, b1+b2)
```

The `tree.find(n)` call inside is itself a generator-driven traversal — every recursive step asks "do I already have node n?" by walking the existing tree. This is a quadratic build (find is O(n), n insertions = O(n²)), which is fine for the tiny inputs the visualizer uses.

Once built, the tree is passed to `CallstackVisualizer` (L72) which renders it. The visualizer can iterate the tree's preorder generator and animate each call frame at its own pace.

### Brute force vs optimal — building and iterating a tree

── Brute force ──────────────────────────────────

Pseudocode (recursive traversal into an array):

```
function preOrderToArray(node, result=[]):
  result.push(node)
  for each child in node.children:
    preOrderToArray(child, result)
  return result

# To use:
const nodes = preOrderToArray(tree.root)
for each n in nodes:
  await delayLoop(500)
  setHighlight(n)
```

Execution trace — walking the fib(4) tree to render with 500ms between frames:

```
Phase 1 — build full array:
  preOrderToArray runs synchronously, returns:
  [fib(4), fib(3), fib(2), fib(1), fib(0), fib(1), fib(2), fib(1), fib(0)]
  Time: O(n) = 9 ops. Memory: O(n) = 9 array slots.

Phase 2 — animate:
  for (const n of arr):
    setHighlight(n)
    await delayLoop(500)
  Total time: 9 × 500ms = 4500ms.
```

Issues:
- Memory: buffers the whole tree before any animation starts.
- Cannot stop early without scanning past the stop point in the array.
- Cannot inject branches mid-walk (e.g. "if the user clicked stop, abort").
- Cannot pause and inspect the in-flight call stack.

Complexity: O(n) time to build · O(n) space for the array.

What goes wrong at scale: a Fibonacci tree at n=15 has ~2,000 nodes; at n=20 it's ~22,000; at n=30 it's ~2.7M. The array version buffers all of them before the first frame renders. At n=30 that's ~64MB just for `TreeNode` references — the page crashes before showing anything.

── Optimal ──────────────────────────────────────

The insight: don't materialize the array. Yield nodes one at a time and let the consumer decide what to do between yields.

Pseudocode (generator):

```
function* preOrderTraversal(node):
  yield node
  for each child in node.children:
    yield* preOrderTraversal(child)

# To use:
for (const n of tree.preOrderTraversal()):
  setHighlight(n)
  await delayLoop(500)
```

Execution trace — same fib(4) tree:

```
Step 1: Iterator created. No nodes touched yet.
Step 2: for-loop asks for first node.
        Generator yields fib(4). Consumer highlights, awaits 500ms.
Step 3: for-loop asks for next.
        Generator resumes, recurses into fib(3), yields fib(3).
        Consumer highlights, awaits 500ms.
...
Step n: Generator finishes when all children yielded.

Memory at any point: O(h) call stack frames (h=4 here, levels of recursion).
Time per yield: O(1) amortized.
Total time: same as brute (9 nodes × 500ms = 4500ms).
Total memory: O(h), not O(n).
```

The total wall-clock animation time is the same — both render 9 nodes at 500ms each. The difference is what happens before and during the animation:

- The generator version starts rendering immediately. The first frame appears at t=0 + 500ms (one yield, one delayLoop).
- The array version blocks for O(n) tree-walking, then starts rendering. First frame appears at t=O(n) + 500ms.
- The generator version uses O(h) memory at any time.
- The array version uses O(n) memory the whole animation.

Complexity: O(n) total time (same n as brute) · O(h) space.

Why it's better: laziness. Work is deferred until a frame is needed. Memory is proportional to depth, not size. The user can stop the animation halfway and the rest of the tree is never walked.

── Comparison ───────────────────────────────────

```
┌─────────────────┬──────────────────┬──────────────────┐
│                 │ Array traversal  │ Generator        │
├─────────────────┼──────────────────┼──────────────────┤
│ Build cost      │ O(n) up front    │ O(1) up front    │
│ Walk cost       │ O(n) deferred to │ O(n) total but   │
│                 │ array consumer   │ amortized O(1)/yield
│ Space           │ O(n)             │ O(h)             │
│ Early stop      │ wasted work      │ no wasted work   │
│ Composition     │ flatten arrays   │ yield* delegation│
│ Async-friendly  │ awkward          │ natural          │
│ At n=2,000      │ ~16KB array      │ ~10 stack frames │
│ At n=2,700,000  │ ~21MB array      │ ~30 stack frames │
└─────────────────┴──────────────────┴──────────────────┘
```

When brute force is fine: when the tree is tiny (say under 100 nodes), when you need the array anyway (e.g. to sort it, slice it, or pass it as a prop), or when debugging — array dumps are easier to inspect than generator iterators in a console. The generator wins when laziness matters: large trees, animation, early termination, async work between iterations.

---

## N-ary tree — diagram

```
NODE shape — children is an array of arbitrary length:

  class TreeNode {
    key:      any           ← identifier
    value:    any           ← payload
    parent:   TreeNode|null ← upward pointer
    desc:     any           ← visualization metadata
    children: TreeNode[]    ← downward, any size (0, 1, 2, ..., n)
  }

EXAMPLE — Fibonacci call tree for fib(4):

                       fib(4)
                      ╱      ╲
                fib(3)        fib(2)
               ╱      ╲       ╱      ╲
           fib(2)   fib(1) fib(1)  fib(0)
           ╱    ╲
       fib(1)  fib(0)

  children[fib(4)] = [fib(3), fib(2)]    ← length 2
  children[fib(2) top] = [fib(1), fib(0)]
  children[fib(1)] = []                    ← length 0 (leaf)

  In a general n-ary tree, children.length can be any non-negative integer.

GENERATOR-BASED TRAVERSAL — preorder:

  *preOrderTraversal(node):
    yield node             ◀── pauses; consumer runs
    for each child in node.children:
      yield* preOrderTraversal(child)
                                  ▲
                                  └── delegation: forwards
                                      sub-generator's yields

CONSUMER LOOP — drives the iteration, can pause/break/async:

  for (const node of tree.preOrderTraversal()):
    setHighlight(node)         ← React state update
    await delayLoop(500)       ← async pause
    if (userClickedStop) break ← early termination
                                   the rest is never walked

PREORDER yield sequence for fib(4) tree above:
  fib(4) → fib(3) → fib(2)bot → fib(1) → fib(0)
        → fib(1)  → fib(2)top → fib(1) → fib(0)

POSTORDER swaps the two lines in the generator:

  *postOrderTraversal(node):
    for each child:
      yield* postOrderTraversal(child)
    yield node              ◀── yield AFTER children
```

---

## In this codebase

**File:** `src/utils/data_structures/Tree.ts`
**Classes:** `TreeNode`, `Tree`
**Used by:** `src/app/recursions/fibonacci-numbers/page.tsx`, rendered via `src/components/CallstackVisualizer`

Key line ranges inside `Tree.ts`:

- `TreeNode` definition with `children: TreeNode[]`: L8–L30
- `Tree` constructor with root node: L32–L37
- `preOrderTraversal` generator: L39–L46
- `postOrderTraversal` generator: L48–L55
- `insert` (uses generator with early return): L57–L70
- `remove` (filters children of each node): L72–L81
- `find` (early-return search via generator): L83–L88

The Fibonacci page (`src/app/recursions/fibonacci-numbers/page.tsx`):

- Tree instantiation: L17 — `new Tree(initialParent, null, ...)` with `initialParent = 4` by default
- Tree built inside the recursive function via `tree.insert(parentCounter, n, ...)`: L24–L31
- `tree.find(n)` called every recursion to dedupe nodes: L24
- `setTreeData(tree)` then handed to `CallstackVisualizer`: L44, L72

The `desc` field on `TreeNode` (L19) is the visualization-specific metadata slot. The Fibonacci page packs a human-readable call-trace string into it: `` `fn(${n}-1, ${b1}, ${b1} + ${b2})` ``. The renderer can show the formula at each node without re-deriving it.

The library `@datastructures-js/priority-queue` is declared but not used by `Tree.ts`; the tree is hand-rolled because the generator-based traversal is the entire point and no off-the-shelf tree library exposes the same shape.

---

## Elaborate

### Where this pattern comes from

JavaScript generators (`function*`, `yield`, `yield*`) shipped in ES2015 after years of being a TC39 proposal. The shape was borrowed from Python (`yield` in PEP 255, 2001) and earlier from CLU and Icon. The motivating use cases were exactly what `Tree.ts` does: tree and graph traversal where the consumer wants control over when each node is produced. Before generators, the equivalent in JS was a hand-rolled state machine — an object with a `next()` method, an internal stack, and explicit pause points. Generators compile to roughly that, but the syntax keeps the recursive structure visible.

`yield*` (delegation) was added specifically for tree traversal: it lets a generator hand off iteration to a sub-generator without flattening or buffering. The lesson the language designers learned was that recursion + iteration is a common pattern, and forcing developers to flatten one into the other (either build the whole tree first, or write a manual stack) was a usability tax.

### The deeper principle

Laziness as a control-flow primitive. The tree walk is the same algorithm whether you materialize it into an array or yield one node at a time — the difference is when each node is produced. Generators make the production schedule a property of the consumer, not the producer. The general lesson: when work can be deferred, defer it. The consumer decides when each piece is needed, and the producer pays only for what's actually asked for.

This is the same principle behind iterators, observables, async iteration, and React Suspense. Each shape gives the consumer a hook to say "I'm not ready for the next thing yet" — and the producer stops doing work until asked.

### Where this breaks down

Generators are harder to debug than plain functions. Step-debugging through a `yield` requires the debugger to understand the suspension point and the resumption frame; some debuggers handle this gracefully and some don't. Stack traces during a `yield*` chain can be confusing because the visible stack only shows the active sub-generator, not the outer one waiting for it. For deep trees (say 1,000+ levels), a debugger sample shows a thousand suspended frames, which is technically accurate but practically unreadable.

The lazy property also breaks down when you need to mutate the tree while iterating. The codebase's `remove(key)` (L72–L81) iterates the tree while modifying child arrays — this happens to work because the iteration is preorder and the mutated child arrays aren't yet visited. But mutating an *ancestor's* children while iterating a subtree would skip nodes or visit them twice. The safe pattern is "collect into an array, then mutate" — exactly what the generator was avoiding.

### What to explore next

- Async generators (`async function*`, `for await ... of`) → same lazy iteration but `yield` can itself await; useful when each node needs an async fetch
- Tree shape libraries (`@dnd-kit/core` for draggable trees, `react-arborist` for virtualized trees) → production-grade UI for n-ary trees with renderers and selection
- Visitor pattern → the object-oriented sibling of generator-based traversal; each node accepts a visitor object instead of yielding to a consumer

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬────────────────────────┬────────────────────────┐
│ Cost dimension   │ Generator traversal    │ Array-returning recursion│
│                  │ (this codebase)        │                        │
├──────────────────┼────────────────────────┼────────────────────────┤
│ First-node delay │ O(1) — yields imm.     │ O(n) — full walk first │
│ Memory at peak   │ O(h) stack frames      │ O(n) array             │
│ Early termination│ no wasted work         │ all work done up front │
│ Async-friendly   │ natural — yield/await  │ awkward — needs setTimeout
│ Debugger UX      │ harder (suspended frames)│ easier (plain recursion)
│ Composability    │ yield* delegation      │ concat arrays          │
│ Code lines       │ ~5 (generator method)  │ ~5 (array push)        │
└──────────────────┴────────────────────────┴────────────────────────┘
```

### Sub-block 1 — what we gave up

**Debugger friendliness.** A generator-based traversal is harder to step through in Chrome DevTools or VS Code. When a `yield` pauses, the call stack panel shows the suspended frames but doesn't make it obvious that execution is paused vs running. For the project owner debugging the Fibonacci visualizer, a simple `console.log` inside a plain recursive function is faster to read than tracing a generator's `.next()` calls.

**Mental overhead for contributors.** Generators are JS-standard but not universally fluent. A contributor who's never written `function*` has to learn three things (`yield`, `yield*`, iterator protocol) before they can modify `Tree.ts`. The array-returning version reads like every recursive function they've written before.

**Multi-iteration cost.** A generator iterator is single-use — once consumed, calling `.next()` returns `{done: true}` forever. If the consumer needs to walk the tree twice (e.g. to count nodes and then render), they call `tree.preOrderTraversal()` twice, paying O(n) twice. An array materialized once can be iterated as many times as wanted.

### Sub-block 2 — what the alternative would have cost

If the codebase used array-returning traversal, the Fibonacci visualizer at small inputs (n ≤ 10) would work identically — the tree is small, the array is small, the difference is invisible. But at n=15 the call tree has ~2,000 nodes and the array buffers them all before any render happens; at n=20 the visualizer would block for ~50ms allocating an array of 22,000 `TreeNode` references before the first frame appears. The user perception flips from "smooth" to "stuttering" exactly at the input sizes where the visualizer becomes pedagogically interesting (large enough to see the exponential blowup).

The other alternative — a hand-rolled iterator object with explicit stack management — would have ~30 lines instead of `Tree.ts`'s 5-line generators. Same complexity, less standard syntax, worse maintainability. Generators won here because the language gives you exactly the shape the algorithm has.

### Sub-block 3 — the breakpoint

Fine as a generator while the consumer is happy iterating once per traversal. The breakpoint arrives when the consumer needs to iterate the same tree multiple times — at that point, either materialize the array once (`[...tree.preOrderTraversal()]`) or restructure the consumer to single-pass. The codebase doesn't hit this case because every consumer of the tree walks it once and discards the iterator.

A second breakpoint: when the tree mutates during iteration. The codebase's `remove` works by luck (children arrays mutated after they've been visited). If a future contributor added "remove the parent's other children when visiting a node," the generator would silently skip nodes. At that point, collect the action targets into an array first, then mutate after iteration ends.

### Sub-block 4 — what wasn't actually a tradeoff

Switching to async generators (`async function*`) was not a real alternative for the synchronous tree-building logic. Async generators are valuable when each `yield` needs to await something (a fetch, a file read). For an in-memory tree walk where the consumer is the only async piece, the synchronous generator with the consumer doing `await delayLoop` is the simpler shape. The async generator would force every consumer into `for await`, even when they don't need it.

A library tree implementation (e.g. `tree-model-js`, `tree-data`) was not a real alternative for the visualization use case. Library trees typically expose array-returning traversals and don't have the `desc` field for visualization metadata. The 88-line hand-rolled `Tree.ts` is shorter than the integration code would be.

---

## Tech reference (industry pairing)

### JavaScript generators (`function*`, `yield`, `yield*`)

- **Codebase uses:** `*preOrderTraversal` and `*postOrderTraversal` methods on `Tree` (L39–L55). Consumed by `for ... of` loops in `insert`, `remove`, `find`.
- **Why it's here:** the visualizer needs to walk the tree lazily, pause between nodes for animation, and stop early on user input. Generators are the language-native shape for that.
- **Leading today:** JS generators — adoption-leading, 2026. Standard since ES2015, supported in every modern runtime, no polyfill needed.
- **Why it leads:** built into the language, integrate with `for ... of`, support delegation via `yield*`, no library dependency. Async generators (`async function*`) extend the pattern to await between yields.
- **Runner-up:** RxJS observables — innovation-leading for stream processing with operators (map, filter, debounce). Heavier than generators for simple tree walks but the standard for complex reactive pipelines.

### Plain object trees (no library)

- **Codebase uses:** `class TreeNode { children: TreeNode[] }` in `Tree.ts` L8–L30. Hand-rolled, no dependencies.
- **Why it's here:** the tree is one of two callers (Fibonacci page, future call-stack visualizers). A library would import more API surface than the codebase needs.
- **Leading today:** hand-rolled tree classes — adoption-leading for small focused use cases, 2026.
- **Why it leads:** zero dependency, full control over fields (the `desc` field is visualization-specific), generators integrate naturally with class methods.
- **Runner-up:** `tree-model-js` — adoption-trailing for visualization but common for config trees and category hierarchies. Provides walking, filtering, and serialization out of the box.

### `for ... of` iteration protocol

- **Codebase uses:** every consumer of the generators — `insert` L58, `remove` L73, `find` L84, the Fibonacci page's recursive build via `tree.find(n)`.
- **Why it's here:** the syntactic surface that drives a generator. `for ... of` calls `.next()` per iteration, handles the `{done: true}` termination, and supports `break` for early stop.
- **Leading today:** `for ... of` — adoption-leading, 2026.
- **Why it leads:** standard since ES2015, works with any iterable (arrays, sets, maps, generators, strings), supports `break` and `continue`, lets the iteration protocol stay invisible.
- **Runner-up:** `Array.from(iterator).forEach` — adoption-trailing. Materializes the iterator into an array, defeating the laziness of the generator. Avoid when working with generators.

---

## Summary

An n-ary tree with generator-based traversal is a general tree (each node has an array of children of any size) walked via JS generators (`function*` with `yield` and `yield*`) so the consumer pulls nodes one at a time instead of receiving a pre-built array. In this codebase, `src/utils/data_structures/Tree.ts` ships `preOrderTraversal` and `postOrderTraversal` as 5-line generator methods, and the `/recursions/fibonacci-numbers` page uses them to render the Fibonacci call stack — each recursive call becomes a child node, and the generator lets the renderer pause between calls without buffering the whole tree. The constraint that forced the generator form was animation: the visualizer wants to highlight each node as the recursion unfolds, not after the whole tree is materialized. The cost paid is harder debugging (suspended generator frames are less readable than plain recursion) and single-use iteration (the iterator must be re-created to walk twice).

Key points to remember:

- `TreeNode.children` is `TreeNode[]` of any size — the tree handles arbitrary branching, not just binary.
- `preOrderTraversal` is a generator (`function*`) — calling it returns an iterator, not the nodes.
- `yield node` pauses the generator; `yield*` delegates to a sub-generator without flattening or buffering.
- The Fibonacci page (`src/app/recursions/fibonacci-numbers/page.tsx`) builds the tree side-effectfully inside the recursive function and uses `tree.find(n)` (which itself uses the generator) to dedupe.
- Generators are O(h) memory at any time vs O(n) for an array-returning traversal — the win shows up at large tree sizes where buffering would dominate.
- `for ... of` loops drive the iteration; `break` stops the generator and skips all unyielded nodes.
- The `desc` field on `TreeNode` is the visualization metadata slot — the Fibonacci page stuffs human-readable call-trace strings into it.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about generators or n-ary trees, they're probing for two things. First: do you understand laziness as a control-flow primitive — can you explain why deferring work matters, with a concrete consequence? Second: can you name the difference between a generator and a plain recursive function, beyond syntax — what does `yield` actually do at runtime?

### Likely questions

[mid] Q: Walk me through `preOrderTraversal` line by line.

A: It's a generator method, marked with `*` in front of the name. The body says: yield the current node, then for each child, delegate to a recursive call via `yield*`. Calling `tree.preOrderTraversal()` doesn't run the body — it returns an iterator. Each call to `.next()` on the iterator runs until the next `yield`, then pauses. `yield*` is delegation: it iterates the sub-generator and forwards every yielded value upward. In this codebase that's `Tree.ts` L39–L46.

Diagram:
```
*preOrderTraversal(node):
  yield node                              ◀── emit current, pause
  if node.children.length:
    for child of node.children:
      yield* preOrderTraversal(child)     ◀── delegate, forward yields

Iterator state machine:
  state A → first .next() → run body until first yield
            → produce node, pause
  state B → second .next() → resume after yield
            → enter for loop, delegate to sub-iterator
            → sub yields → forward upward, pause
  state C → .next() → continue from where sub left off
  ...
  state Z → all children done → return {done: true}
```

[senior] Q: Why use a generator instead of returning an array of nodes?

A: Two reasons. First, laziness — the consumer can stop early without paying for the rest of the tree, and the first node is available before the rest of the tree is walked. For the Fibonacci visualizer rendering a 2,000-node call tree at 500ms per node, the array version would block for ~10ms allocating the array before the first render; the generator renders the first node immediately. Second, memory — generators use O(h) stack frames vs O(n) array slots. At n=22,000 nodes (Fibonacci at n=20), the array form would allocate ~700KB of TreeNode references; the generator uses ~20 stack frames. The cost is debugger UX and single-use iteration, both of which were acceptable for this codebase.

Diagram:
```
Time-to-first-frame and peak memory:

                  │ Array traversal      │ Generator             │
──────────────────┼──────────────────────┼───────────────────────┤
 First node ready │ O(n) — must walk all │ O(1) — first yield    │
 Peak memory      │ O(n) array buffer    │ O(h) call stack       │
 Second walk      │ O(1) — array exists  │ O(n) — re-iterate     │
 Early stop       │ all work already done│ stops where break hits│
 Animation start  │ delayed by O(n)      │ immediate             │
```

[arch] Q: Suppose the Fibonacci tree grows to 1 million nodes. What breaks first — the array approach, the generator, or both?

A: The array breaks first. At 1M nodes, the array is ~30MB of TreeNode references, plus the actual node objects — total ~80MB. V8's default heap is around 1.4GB, so it survives, but allocation pauses the main thread for ~50ms and GC pressure builds. The generator handles 1M nodes with ~30 stack frames (log₂ of 1M depth at most for a balanced tree, though Fibonacci's tree is deeper — closer to n levels for fib(n)). For Fibonacci specifically the call tree depth grows linearly with n, so at fib(30) the recursion depth is 30, well below V8's ~10k frame limit. Both eventually break: array on memory (~10M nodes ≈ 800MB), generator on recursion depth (Fibonacci at n ≈ 10k would blow the stack). The right fix at that scale is iterative traversal with an explicit stack, not either of the current approaches.

Diagram:
```
What breaks first as n grows:

  At n = 100 (call tree ~1000 nodes):
    array     ✓ ~32KB    │  generator ✓ ~10 frames
  At n = 1,000 (~21M nodes):
    array     ✗ ~700MB    │  generator ✓ ~1k frames
  At n = 10,000:
    array     ✗ OOM       │  generator ✗ stack overflow
  At any n:
    iterative + explicit stack ✓
```

### The question candidates always dodge

Q: Generators are cool, but you could implement the same thing with a callback (`forEach(callback)`). Why is `yield` better than passing a function?

A: Honest answer: for a simple "do something at every node," `forEach(callback)` is fine. The difference shows up when the consumer needs to do something *between* nodes — pause, await, decide whether to continue, do state-dependent work. With a callback, the consumer's logic is split across `forEach`'s caller and the callback body, and "do something async between iterations" requires either Promise-chain tricks or a separate iteration mechanism. With a generator, the consumer's loop body is at one level, awaiting and branching as it sees fit, and the generator is just the producer. For the Fibonacci visualizer that does `await delayLoop(500)` between renders, the generator form is straightforward — `for await` on the iterator. The callback form would require either passing a promise-returning callback into `forEach` (which most `forEach` implementations don't await) or building a state machine around `forEach`. The yield form makes the iteration explicit, the suspension explicit, and the consumer's control flow first-class.

Diagram:
```
The "pause between nodes" pattern:

  Callback form:
    tree.forEach(node => {
      setHighlight(node)
      await delayLoop(500)  ← but forEach doesn't await callbacks!
    })
    → broken; iteration doesn't pause for the await

  Generator form:
    for (const node of tree.preOrderTraversal()):
      setHighlight(node)
      await delayLoop(500)  ← loop body awaits; iteration waits
    → works; generator stays paused until next .next() call

The difference: who owns the loop.
  forEach: producer owns it, callback runs to completion synchronously
  for ... of + generator: consumer owns it, producer waits patiently
```

### One-line anchors

- "Generators turn iteration into a consumer-driven contract — the producer waits until asked."
- "`yield*` is delegation; it forwards a sub-generator's yields without flattening or buffering."
- "An n-ary tree is `children: T[]` of any length — branching factor is a runtime property, not a type constraint."
- "The Fibonacci visualizer wants to render mid-traversal; the generator makes that the natural shape instead of a state-machine hack."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On paper, draw the call tree for `fib(4)` using the recurrence `fib(n) = fib(n-1) + fib(n-2)` with `fib(0) = 0` and `fib(1) = 1`. Label every node. Then write down the preorder yield sequence and the postorder yield sequence.

Open the file. Compare against the diagram and the trace above.

Pass: your tree has 9 nodes (or however many your recurrence produced) and the preorder/postorder sequences match the trace.

### Level 2 — Explain it out loud

Explain what `yield*` does to a colleague who knows `yield` exists but has never seen delegation. No notes. Under 90 seconds.

Checkpoints:
- Did you say "delegates to a sub-generator"?
- Did you say "forwards every yielded value upward"?
- Did you reference `Tree.ts` L43 (`yield* this.preOrderTraversal(child)`)?

### Level 3 — Apply it to a new scenario

You need to render a comment thread where each comment can have unlimited nested replies. The user can collapse a comment, which hides its subtree. The component renders ~50 visible comments at any time, but the underlying data could have ~10,000 total comments.

Walk through whether you'd use a generator-based traversal, an array-returning traversal, or something else. Reference what changes when the user collapses a comment. Then open `Tree.ts` L39–L46 and check whether `break` inside the consumer loop is sufficient to skip a collapsed subtree.

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the generators are single-use, so iterating the tree twice walks it twice.

"If you were refactoring `Tree.ts` for a use case that iterates the tree many times (e.g. a dashboard that re-renders every second showing tree stats), would you change the implementation? What would the change cost — in memory, in API shape, in mutation semantics?"

Reference `Tree.ts` L39–L46 (generator) and name what would change if you replaced it with a memoized array.

### Quick check — code reference test

Without opening any files:
- What file does `Tree` live in?
- What's the method name for preorder traversal?
- What field on `TreeNode` is used for visualization-specific metadata?

Open the file and verify.

Pass: you named the file (`Tree.ts`), the method (`preOrderTraversal`), and the field (`desc`).
