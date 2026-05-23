## Chapter 03 — Design patterns

Named structural solutions to recurring problems — behavioural (how units coordinate), structural (how units compose), creational (how units are constructed). Patterns earn their place when the diagnosis matches; reaching for one without the underlying problem is decoration. This chapter walks the catalog against reincodes specifically.

### Map of the territory

Behavioural
- **Strategy** — DEEP. Six sorting visualizer pages share an identical shell; each hardcodes its own algorithm.
- **Iterator** — DEEP. `Tree.ts` (L39–L55) ships generator-based traversals; `Tree.find` (L83–L88) and `Tree.insert` (L57–L70) consume them. The pattern is proven in one corner and has not spread.
- **Template Method** — BRIEF. The sorting page skeleton is the template; in React the OOP framing collapses into composition.
- **State Machine** — NOT FOUND. No tangled boolean flags. `running`/`done`/`reset` is a one-bit state at most.
- **Observer / Pub-Sub** — NOT FOUND. No event-driven UX; React's render-on-state-change is the only producer/consumer relationship in the codebase.
- **Command** — NOT FOUND. No undo/redo, no batching, no logged-action history.

Structural
- **Composite** — BRIEF. `Tree`, `BinarySearchTree`, and `CompleteBinaryTree` each carry their own node type; unification is possible, the question is whether it helps.
- **Adapter** — NOT FOUND. No external APIs to translate.
- **Facade** — NOT FOUND. No complex subsystem to collapse.
- **Decorator** — NOT FOUND. No cross-cutting concerns to layer (no logging, no auth, no caching wrapping the algorithms).
- **Proxy** — NOT FOUND. Everything is local and synchronous-or-await; nothing to stand in for.

Creational
- **Factory** — MENTION. One conceivable place — pick the right algorithm by route slug — has six entries and a router already.
- **Dependency Injection** — BRIEF. Visualizer pages instantiate data structures directly (`new MinHeap()`, `new Graph(...)`). The cost shows up the moment the codebase wants tests.
- **Builder** — NOT FOUND. No multi-step construction; everything is two arguments or fewer.

---

### Strategy — DEEP

**Where it shows up**

`src/app/sorting/{bubble,insertion,selection,merge,quick,heap}-sort/page.tsx`. Open any two side by side and the shape is mechanical: a `useState` for `inputSize` and `speed`; a `reset` callback; a `useState` for `bars`; a `useState` for `highlightIndices` and `scanIndices`; one async function whose body is the algorithm, calling `setBars([...bars])` then `await delayLoop(speed)` between steps; a `useEffect` that runs the algorithm on mount; identical JSX (`BSelect` for input size, `BSelect` for speed, Run/Reset anchors, `<ArrayVisualizer>` at the bottom). Compare:

- `bubble-sort/page.tsx:54–76` — the inner loop swaps neighbours and calls `setHighlightIndices`/`setScanIndices`/`setBars` around `await delayLoop(speed)`.
- `quick-sort/page.tsx:55–123` — the same envelope, but the body is a recursive `divide_and_combine` with a Lomuto partition; the same three setters are interleaved with the same `delayLoop`.
- `merge-sort/page.tsx:53–101` — the same envelope, but the body is a recursive `divide`/`combine` and the merge step calls a separate `updateOriginalArray` (L112–L156) that walks the merged buffer one element at a time.
- `heap-sort/page.tsx:62–106` — slightly different: it builds a `MinHeap` instance (L52) and replays its `swapSequence` after-the-fact (L86), then drains via `getMin` (L92). Still the same envelope.

Every algorithm could be expressed as `function* sort(arr): Generator<{ kind: "swap" | "scan" | "highlight" | ..., indices: number[] }>` and consumed by a single `<SortingShell>` page that runs `for (const step of algorithm(bars)) { applyStep(step); await delayLoop(speed); }`. Six pages collapse to one shell + six algorithm files of ~30 lines each.

**Why it's like this**

Reconstructable: the codebase started one sort at a time. Bubble was first, the next five were variations on the bubble template. Locality of behaviour beat abstraction at each step because nothing was hard about copy-pasting a 130-line file. The site doubles as a study notebook — each page reads like a teaching artifact, which is a real reason to keep the algorithm visible at the top of the file the reader navigated to.

**Take**

If this were a product, I'd do the Strategy refactor today. The duplication isn't drift-prone yet (the six pages are still in sync), but `useEffect(() => { algorithm() }, [])` with all the eslint-disable-next-line comments is the kind of pattern that erodes once anyone touches it. The "right" shape here is exactly the one the codebase already proved in `Tree.preOrderTraversal` — a generator that yields steps, plus a consumer that knows how to render them.

But this isn't a product. It's a study site where the page IS the algorithm exhibit. Pulling `bubbleSort` out of `bubble-sort/page.tsx` and into a `strategies/bubbleSort.ts` file the reader has to chase makes the site worse at the thing it exists to do. Code locality is a feature here, not a violation.

I'd split the difference. Extract the *shell* — the input/speed controls, the Run/Reset buttons, the `<ArrayVisualizer>`, the `useState` for `bars`/`highlightIndices`/`scanIndices`, the `useEffect` that kicks off the algorithm on mount — into a `<SortingShell>` component. Leave the algorithm function in `page.tsx`. The page becomes ~40 lines that import `<SortingShell>` and define one async function. The duplication that mattered (state plumbing, JSX) is gone; the duplication that doesn't (each algorithm in its own file, where the reader expects it) stays.

**The tradeoff**

The full Strategy refactor saves more lines but indirects the algorithm one click away from the URL the reader navigated to. The shell-only refactor saves less but keeps the algorithm where the reader is looking. The breakpoint is "does the reader open `page.tsx` to read the algorithm, or to read the page wiring?" Today it's the algorithm. If you ever add a 7th sort, that calculus doesn't change. If you ever add a second visualizer family that wants the same shell (it won't — graphs and trees have different controls), then a full Strategy refactor becomes obvious.

**What I'd watch for**

The generator-of-steps version sounds clean and then snags on `heap-sort`, which doesn't fit the "step through the array" mental model — it builds a heap first, then drains it. A naive `Step` union type ends up with twelve variants and every sort uses three of them. Pick the shell-only refactor and you avoid this entirely; pick the full Strategy refactor and you're now in the business of designing a `SortStep` ADT that all six algorithms have to fit. That's a larger conversation than the line-count savings suggest.

The other thing to watch: the `useEffect(() => { algorithm() }, [])` pattern is wrong (algorithm runs once on mount, can't be re-run cleanly because state was set asynchronously while the closure captured an old `bars`). The shell extraction is the place to fix this — wire Run to an explicit "play" handler that resets state and starts a fresh generator. Don't smuggle the fix into the refactor; spec it separately.

**Verdict**

Worth doing as a shell extraction, not as a full Strategy. Spec it as "extract `<SortingShell>` from `bubble-sort/page.tsx`; migrate the other five pages one at a time." The algorithm stays put.

---

### Iterator — DEEP

**Where it shows up**

`src/utils/data_structures/Tree.ts:39–55` defines `*preOrderTraversal` and `*postOrderTraversal` as JS generators with `yield` and `yield*`. The traversal is consumed in three places in the same file:

- `Tree.insert` (L57–L70) iterates `preOrderTraversal` looking for `node.key === parentNodeKey`, then breaks via `return true`.
- `Tree.remove` (L72–L81) iterates `preOrderTraversal` to find a parent whose children include the target.
- `Tree.find` (L83–L88) iterates `preOrderTraversal` until it finds the key, then `return`s the node.

The generator pattern is correct and idiomatic. `Tree.find`'s early `return` short-circuits the generator (V8 stops pulling values once the loop exits), so the asymptotic complexity is exactly what the caller wants — O(k) to find a node at position k, not O(n) materializing the whole pre-order list.

The pattern stops at `Tree.ts`. Nothing else in `data_structures/` uses generators. `BinarySearchTree.preOrder` (L390–L404) builds and returns a full `result` array. `Graph.bfs_traversal` (L160–L224) materializes `result` before returning. `Graph2.breadth_first_search` (L201–L225) builds and returns a full `parent` array. `MinHeap.heapifyUp` / `heapifyDown` push step tuples into `this.swapSequence` and the visualizer consumes them as an after-the-fact replay.

**Why it's like this**

`Tree.ts` is newer than `BinarySearchTree.ts` and `Graph.ts`; the generator form is a learned upgrade that arrived late and only got applied locally. The heap's `swapSequence` predates the realization that the same problem (replay algorithm steps in the UI) has a cleaner generator-shaped solution.

**Take**

The generator approach in `Tree.ts` is the precedent the rest of the codebase should follow. The animation loop in every visualizer page is, structurally, "step through an algorithm, render each step." That is exactly the shape generators are for. The codebase has the right idiom, used it once correctly, and then forgot it existed for the other ten algorithms.

The most leveraged place to spread it: the sorting algorithms. If `bubbleSort` were `function* bubbleSort(arr): Generator<SortStep>`, the page becomes `for await (const step of bubbleSort(bars)) { apply(step); await delayLoop(speed); }` and the algorithm's control flow stops being tangled with React's state updates. The same applies to `breadth_first_search` (yield `{ visit: node, parent: u }` instead of building a parent array) and to `BinarySearchTree.preOrder` (yield nodes instead of pushing them into `result`).

The second-most leveraged place: `MinHeap.swapSequence`. The current shape — mutate the heap, record the swaps as a side-effect, replay them later — is the workaround for not having a step generator. `*insert(value)` that `yield`s each swap as it happens removes the recording layer entirely. The heap-sort page becomes one loop instead of two.

**The tradeoff**

Generators are cheap to write but their composition story is awkward — you can't `Promise.all` a generator, you can't `map` one without converting to an array first, and TypeScript's generic generator types are mildly annoying (`Generator<T, void, unknown>`). For algorithms that are consumed exactly once, by exactly one consumer, all of this is fine. For algorithms used in multiple shapes (some consumers want the full result, others want to step), you'd want both a generator version and a `[...gen]` materialized version. Easy to do but easy to forget — and an algorithm with two return shapes is harder to teach.

The deeper tradeoff: generators are *contagious*. Once `breadth_first_search` is a generator, every caller has to know it's lazy. `Dijkstras` (which calls `pq.dequeue()` in a while loop) doesn't naturally fit because the order of work depends on PQ state, not on the input graph. So Dijkstra stays imperative even if BFS goes generator, and now the codebase teaches two different patterns for "step-by-step graph search." That's a real reading cost.

**What I'd watch for**

The trap: writing generators that don't actually step at the granularity the visualizer needs. A generator that yields the final sorted array as one step is technically a generator and provides zero value. The granularity has to match what you'd want to *see* — "I swapped i and j," "I'm comparing i and j," "this segment is done." Get the step ADT right before spreading the pattern, because retrofitting the step shape after three algorithms use it is the painful version.

The other trap: `Tree.insert` (L57–L70) iterates the entire generator looking for the parent key, and on a hit it pushes the new child *during iteration*. JS generators handle this because `node.children.push` mutates the array `for (const child of node.children)` is iterating in a parent frame — but only because the new child is pushed at the end, after the iterator has already passed that point. This is correct but fragile. If you spread the pattern, be careful about mutating-during-iteration; it's the kind of bug that doesn't surface until someone changes traversal order.

**Verdict**

Worth doing, in this order: (1) make `MinHeap.insert` and `MinHeap.getMin` yield swaps, drop `swapSequence`; (2) make sorting algorithms yield `SortStep` and the page consume them; (3) make `breadth_first_search` and `BinarySearchTree.preOrder` yield nodes. The first one is the cheapest and most contained — start there, see if the step-ADT design holds, then expand.

---

### Template Method — BRIEF

The sorting pages share a skeleton (`useState` plumbing, controls, Run/Reset, `<ArrayVisualizer>` below) and the variable step is the algorithm body. Classic Template Method shape — in OOP this is a base class with one abstract method. In React, you express the same idea with composition: a `<SortingShell>` component takes the algorithm as a render-prop or as `children`. The boundary between "Template Method" and "Strategy via children prop" is mostly vocabulary; both describe the shell extraction I'd recommend in Strategy above.

**Take:** Template Method as a distinct pattern doesn't earn its own refactor here. It's the same refactor as the Strategy shell extraction with a different name. **Verdict:** Bundled into Strategy. Don't write a separate spec.

---

### Composite — BRIEF

Three node types live separately in the codebase and represent the same idea — a node with children. `TreeNode` (`Tree.ts:8–30`) has `key`, `value`, `parent`, `desc`, `children: TreeNode[]`. `BSTNode` (`BinarySearchTree.ts:3–13`) has `key`, `left`, `right`. The `Node` class for `CompleteBinaryTree` (`BinaryHeap.ts:285–295`) has `key`, `left`, `right`. The traversal shape — recurse, do work, recurse — repeats three times with three slightly different signatures.

**Take:** A `TreeNode<T>` interface with `children(): Iterable<TreeNode<T>>` would unify the three. The cost is that `BSTNode`'s `left`/`right` split would have to be exposed through an iterator (`*children() { if (this.left) yield this.left; if (this.right) yield this.right; }`), which loses the binary-tree-specific meaning at the type level. That meaning matters — `successor`, `predecessor`, and the BST insert/delete all depend on `left`/`right` being directional. Unifying the node type forces a generic traversal interface to coexist with the specific binary-tree fields, and the result is more complicated than the three separate types it replaces. **Verdict:** Don't. The three node types are honestly different concepts. Composite is the right pattern for the wrong codebase.

---

### Dependency Injection — BRIEF

Visualizer pages call `new MinHeap()` (`heap-sort/page.tsx:52`), `new Graph(n, edgeList)` (`graphs/network/page.tsx:68`), `new MaxHeap()` (`trees/binary-heap/page.tsx:21`) directly. There's no seam to substitute a mock, no constructor that takes the heap/graph as a parameter. The data structure is the page's internal collaborator.

**Take:** This codebase has no tests, so the "DI makes it testable" argument is hypothetical. The moment you write the first unit test for any sorting algorithm, you'll want the algorithm extracted out of the page anyway — at which point DI happens by accident (the page imports a pure function, the test imports the same function, no constructor injection needed). **Verdict:** Not worth doing as its own refactor. The day you add tests, the testable shape will already have been carved out by the Strategy extraction discussed above.

---

### MENTION

- **Factory for sorting algorithm by route slug** — There are six algorithms and a router that already maps slug → page. A factory adds no value; you'd have one function with a six-case switch nobody calls. Don't.

---

### Chapter close

reincodes has one well-applied pattern (Iterator, in `Tree.ts`) and one obvious-but-resisted pattern (Strategy/Template Method, across the six sorting pages). The codebase isn't pattern-poor in the way most undermaintained projects are pattern-poor — there's no `if (type === "X") ... else if (type === "Y") ...` ladder begging for polymorphism, no tangled async-state machine, no observer pattern smuggled in as a `globalThis` event bus. It's pattern-poor in a different way: the *teaching artifact* shape of the codebase (one file per visualizer, algorithm at the top, everything local) is in tension with the *engineering artifact* shape (extract the shell, parameterize the algorithm, share the controls). Both shapes are defensible. The codebase committed to "teaching artifact" early and the patterns that would help most — Strategy, Template Method via composition — would erode the teaching shape if applied naively. The shell extraction described under Strategy is the one refactor that preserves the teaching shape while removing the real cost (state-plumbing duplication). Everything else in this chapter is "no, that pattern doesn't earn its place here," and that's an honest read of the codebase, not a failure of imagination.
