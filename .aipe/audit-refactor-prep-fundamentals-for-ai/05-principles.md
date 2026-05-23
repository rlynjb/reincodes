## Chapter 05 — Principles

The first four chapters named techniques. This one names justifications. Principles are the "why" you'd cite in the **Why** field of a refactor spec — `refactor.md` Section 5 is the catalog. Walk the ten of them against reincodes in the catalog's order, grade each by how much there is to say, and finish with the one tension that defines this codebase: **Single Responsibility / Separation of Concerns vs Locality of Behaviour**. Spoiler — locality wins, and the case for that is what this chapter is for.

This chapter does not teach the principles. The reader knows them. The work is figuring out whether each is violated *here*, whether the violation costs anything *here*, and whether fixing it would pay back *here*. Sometimes the answer to all three is no, and saying so is the take.

---

### Map of the territory

| # | Principle | Depth |
|---|---|---|
| 1 | Single Responsibility | **DEEP** |
| 2 | DRY (with care) | **DEEP** |
| 3 | Separation of Concerns | **DEEP** |
| 4 | Dependency Inversion | **BRIEF** |
| 5 | Open/Closed | **BRIEF** |
| 6 | Liskov Substitution | **NOT FOUND** — no inheritance hierarchies to violate; `MinHeap` and `MaxHeap` don't share a base type. |
| 7 | Interface Segregation | **NOT FOUND** — no interfaces. The codebase uses `any` liberally (`Graph.ts`, `Graph2.ts`, `BinaryHeap.ts`); there's no fat-interface surface to slice. |
| 8 | Locality of Behaviour | **DEEP** |
| 9 | Principle of Least Surprise | **BRIEF** |
| 10 | Tell, Don't Ask | **MENTION** |

Three DEEP sections out of ten. Two NOT FOUND. The shape of this chapter is that the same root pattern — visualizer pages holding algorithm + animation + UI in one file — produces all three deep discussions, and the verdicts disagree with each other. That's the chapter.

---

### Single Responsibility

**DEEP.**

**Where it's violated.** Every visualizer page under `src/app/<family>/<algo>/page.tsx` does three jobs in one function body:

- `src/app/sorting/bubble-sort/page.tsx:54–76` — the sort algorithm (the two `for` loops with the swap)
- `src/app/sorting/bubble-sort/page.tsx:62–66` — the animation orchestration (`setHighlightIndices`, `setScanIndices`, `await delayLoop(speed)`, `setBars([...bars])`)
- `src/app/sorting/bubble-sort/page.tsx:85–128` — the JSX shell, the controls, the visualizer hookup

The same shape repeats in `insertion-sort/page.tsx:53–74`, `quick-sort/page.tsx:55–123`, `merge-sort/page.tsx:53–156`, and `heap-sort/page.tsx:62–106`. By a strict reading, each page has at least three reasons to change: the algorithm changes (rare), the animation contract changes (the `delayLoop` + state-mutation pattern, also rare), or the UI controls change (more common — adding a "step forward" button, swapping `BSelect` for something else, adding a complexity readout). Three reasons, one file.

**Why it matters here.** The cost is concrete: there's no way to unit-test bubble sort without mounting React, because the algorithm and the animation are the same function. If `bubble-sort/page.tsx:54–76` had a bug, you'd find it by watching the visualizer, not by running an assertion. That's fine for a teaching artifact and would be unacceptable for a library, and reincodes is firmly the former.

The second cost is shape coupling: the animation mutates the same `bars` array the algorithm reads from (`bubble-sort/page.tsx:57–60` mutates `bars[r-1]` and `bars[r]` in place; `:66` then calls `setBars([...bars])` to publish the new reference to React). The algorithm and the renderer share one array, and that's why both have to live in the same closure. Split them and you have to invent a step protocol — a `{ swap: [i, j] }` event, a generator that yields, something — to carry information across the boundary that's currently just shared mutable state.

**Is it worth fixing?** **No, with one carve-out.**

The honest staff-engineer call is that splitting the algorithm out of these pages would scatter the thing the reader came to read. Someone opening `bubble-sort/page.tsx` is looking for "how does bubble sort work in this codebase?" The answer is the 23 lines from `:54–:76`. Move that to `src/utils/algorithms/bubbleSort.ts` and the page becomes a UI wrapper that imports a function — and the reader has to chase a second file to find the algorithm. For a portfolio site whose product *is* the legibility of these algorithms, that trade goes the wrong way.

The carve-out: **if you ever add scrub, step-back, or "show me the call tree" affordances**, the algorithm has to yield steps instead of mutating React state directly. At that point — and only at that point — the right refactor is Separate Pure from Effectful: the algorithm becomes a generator that yields `Step` objects, the page consumes the generator in an effect that calls `delayLoop` between steps. That refactor pays for itself the day someone wants to step backwards through bubble sort. Until then, it's net negative.

**Which techniques would address it.**
- **Separate Pure from Effectful** (Chapter 02) for the algorithm/animation split, if and when scrub arrives.
- **Extract Function** (Chapter 01) for the animation loop body if even *one* page grows enough that the closure becomes hard to read — `quick-sort/page.tsx:64–120` is the closest to that line. Not yet over it.
- **Strategy via dispatch table** (Chapter 03) to consolidate the five sorting pages into a single `/sorting/[algo]/page.tsx` — discussed and rejected in DRY below for the same locality reason.

**Verdict:** Not worth fixing. The single-file shape is the design, not the violation. Revisit if and when the visualizers grow scrub controls.

---

### DRY (with care)

**DEEP.**

**Where it's violated.** Three duplications, three different shapes, three different right answers:

- **MinHeap + MaxHeap** in `src/utils/data_structures/BinaryHeap.ts:23–133` and `:136–243`. The two classes are line-for-line parallel — same field set, same `heapifyUp`, same `heapifyDown`, same `insert`, same `getMin`/`getMax`. The only differences are the comparator (`<` becomes `>` at `:56` vs `:167`, and `>` becomes `<` at `:102` vs `:213`) and the method name (`getMin` vs `getMax`). About 100 lines of duplicated code, two classes deep.

- **Sorting page skeletons** across `src/app/sorting/{bubble,insertion,quick,merge,heap}-sort/page.tsx`. Every page repeats the same prelude: `inputSize` + `speed` state, a `reset()` that clears and regenerates `bars`, a `useEffect` keyed on `[inputSize, speed]` that calls `reset()`, a `bars` state with a second `useEffect` initializer, an algorithm function tied to `useEffect(..., [])` on mount, and an identical control panel with `BSelect` for input size and speed. `bubble-sort/page.tsx:17–45` and `insertion-sort/page.tsx:17–45` are essentially the same code. The JSX from `:85–:128` differs only in the run handler.

- **`Graph` + `Graph2`** in `src/utils/data_structures/Graph.ts` and `Graph2.ts`. Both export classes with vertices, edges, BFS-like traversals. The internal comment at `Graph.ts:7` reads "this version is from IK"; `Graph2.ts:6` reads "this version is from Book". `Graph` uses an adjacency list built from an edge list; `Graph2` uses `Node2` objects each carrying an `edges: { [neighbor]: Edge }` dict. They have different APIs (`Graph.bfs_traversal()` vs the free function `breadth_first_search(g, start)` exported from `Graph2.ts:201`), different callers, and different feature sets.

**Why it matters here.** The three duplications have nothing to do with each other beyond surface appearance, and that's the whole point of "DRY with care."

MinHeap/MaxHeap is real duplication: the two classes encode the same algorithm parameterized on a comparison direction. Any bug fix to `heapifyDown` has to land in both files; any new feature (peek-without-pop, decrease-key) has to be implemented twice. The drift risk is non-hypothetical — `MinHeap` already carries `getMinSwapSequence: number[][]` at `:27` that `MaxHeap` doesn't have at `:139`. The classes have drifted already.

Sorting page skeletons look like duplication but aren't, because the algorithm is the page. The repeated prelude is twenty lines of `useState` + `useEffect` that happen to be identical, and the variable part — the algorithm — is the entire reason the page exists. If you Template-Method'd the prelude into a hook (`useSortingVisualizerState`), you'd save twenty lines per page and you'd push the algorithm into a callback that runs inside the hook. The reader who clicked `bubble-sort/page.tsx` to read bubble sort now has to (a) know the hook's contract, (b) understand how the callback gets the `bars` reference, (c) know where to look for the `delayLoop` cadence. Three steps of indirection added to save twenty lines of `useState` boilerplate. Bad trade.

`Graph` + `Graph2` is the most interesting case. It looks like duplication but it's evolution — two competing implementations sitting side by side because the author moved from one to the other without deleting the first. `Graph.ts` is used by `NetworkDiagram` (per context.md); `Graph2.ts` is used by Dijkstra, grid, and river-crossing. The duplication isn't logical, it's temporal — and the fix isn't to unify them, it's to **decide which one is canonical and retire the other**, or rename `Graph2` to something descriptive so the `2` stops being a question.

**Is it worth fixing?**

- **MinHeap/MaxHeap:** **yes.** Parameterize Function with a comparator (`(a, b) => boolean`, defaulting to min) collapses 100 lines into ~60 and removes the drift risk. The visualizer pages that currently `new MinHeap()` keep working — the API stays the same; the second class becomes either a thin `new BinaryHeap(arr, (a, b) => a > b)` factory or stays as a re-export. This is the cleanest DRY win in the codebase. Do it.
- **Sorting page skeletons:** **no.** Locality wins. The duplication is legible; unifying scatters.
- **`Graph` + `Graph2`:** **partial cleanup, not a DRY refactor.** Rename `Graph2` to something that says what makes it different (`AdjacencyListGraph`? `NodeBasedGraph`?), or — better — finish the migration: move `NetworkDiagram` onto `Graph2`, delete `Graph.ts`. Either resolution is fine; the current state, where the names imply versioning and the contents imply two parallel libraries, is the worst of both.

**Which techniques would address it.**
- **Parameterize Function** (Chapter 01) for `BinaryHeap.ts:23–243` — fold MinHeap and MaxHeap into a single class taking a comparator. See Chapter 01 for the exact technique notes.
- **Rename** (Chapter 01) for `Graph2` → something descriptive. Or **Inline Module** (Chapter 02) if `Graph.ts` is fully replaced.
- **Template Method / higher-order function** (Chapter 03) for the sorting page skeletons. **Available, rejected.**

**Verdict:** Worth doing for MinHeap/MaxHeap. Worth doing as a Rename or migration finish for `Graph`/`Graph2`. Not worth doing for the sorting page skeletons.

---

### Separation of Concerns

**DEEP.**

**Where it's violated.** Same files as Single Responsibility, slightly different framing. The principle asks whether presentation, business logic, persistence, and side effects each live in their own layer. In the visualizer pages, three layers are fused:

- **Algorithm layer** — the pure logic of bubble sort, insertion sort, quick sort, etc. (`bubble-sort/page.tsx:54–60`, the swap and compare).
- **Animation layer** — the `await delayLoop(speed)` cadence, the `setHighlightIndices` / `setScanIndices` calls, the `setBars([...bars])` re-publish. (`bubble-sort/page.tsx:62–66`.)
- **Presentation layer** — the JSX, the `BSelect` dropdowns, the run/reset links. (`bubble-sort/page.tsx:85–128`.)

By the strict reading, these are three concerns and they should be three modules. The algorithm should not know what a `setState` is. The animation orchestrator shouldn't know what a `<select>` looks like. The JSX shouldn't know how the sort works.

**Why it matters here.** SoC and SRP overlap heavily in this codebase because the same file (the visualizer page) violates both, and for the same reason. The interesting distinction is that SoC is about *layers* (algorithm vs. animation vs. presentation as architectural strata), while SRP is about *reasons to change* — and in this codebase the layers happen to align with the reasons to change, so the two principles point at the same file.

The cost is the same as SRP: the algorithm can't be unit-tested or reused without dragging React along. The shared mutable `bars` array is the layer-violation: the algorithm reads and writes it (algorithm concern), the animation re-publishes it via `setBars([...bars])` (animation concern), and the renderer consumes it as a prop on `<ArrayVisualizer />` (presentation concern). One array, three layers, no boundary.

**Is it worth fixing?** **No, for the same reason SRP isn't.** Locality. The same carve-out applies: when scrub or step-back is added, the algorithm has to yield steps and the layers separate naturally — at that point, SoC and SRP are both addressed by the same Separate Pure from Effectful refactor. Until then, the layers are fused on purpose.

One paragraph worth saying explicitly: this is a case where two principles agree it's a violation, and the staff-engineer call is still "leave it alone." Two principles pointing at the same file isn't a stronger argument than one — it's the same argument counted twice. The actual question is "what does fixing it cost vs. what does fixing it buy," and the answer doesn't change because you renamed the principle.

**Which techniques would address it.** Same as SRP — Separate Pure from Effectful (Chapter 02), generator-yielded step protocol if scrub arrives.

**Verdict:** Not worth fixing. SoC and SRP collapse to the same single refactor here, and that refactor doesn't pay back until the feature set demands it.

---

### Dependency Inversion

**BRIEF.**

`src/utils/data_structures/DijkstrasAlgorithm.ts:1` imports both `Graph2` and `PriorityQueue` as concrete classes. `DijkstrasAlgorithm.ts:11` constructs `new PriorityQueue(0, true)` directly. The function takes a `g: any` (`:4`) but then calls `g.num_nodes` (`:6`) and `g.nodes[currentMinNode].getEdgeList()` (`:30`) — it depends on the `Graph2` shape implicitly. The visualizer pages similarly import concrete classes: `heap-sort/page.tsx:7` imports `MinHeap, MaxHeap` from `@/utils/data_structures`. There's no abstraction between caller and concrete data structure anywhere in the codebase.

**Take:** Dependency Inversion is a principle that pays back when the dependency might be swapped, mocked, or hidden behind a stable contract. In reincodes, none of those forces exist. There's no test suite to mock for, no second implementation to swap to, no API stability promise to preserve. Inverting the dependency would mean introducing a `GraphLike` interface and a `PriorityQueueLike` interface so Dijkstra could accept anything that quacks right — and the only caller of Dijkstra is one page. That's textbook over-abstraction. The deeper point: Dependency Inversion in a codebase without tests, without alternative implementations, and without external consumers buys nothing. **Verdict:** Not worth fixing.

---

### Open/Closed

**BRIEF.**

Adding a new sorting algorithm to reincodes means creating `src/app/sorting/<new-algo>/page.tsx`, copy-pasting the skeleton from an existing page, swapping in the new algorithm body, and that's it — Next.js App Router picks up the route automatically. Adding a new sorting concept to the home page concept grid means editing `src/components/Home/conceptsData.tsx`. The codebase is "closed" only in the sense that there's no Strategy registry or plugin manifest to extend — you extend by adding a file (closed for one kind of modification) and editing a static config (open for another).

**Take:** Open/Closed is graded against the codebase's actual extension pattern, and reincodes extends by file creation + a one-line config edit. That's a reasonable shape for a small static site; the file-creation step is the route, the config edit is the link from the home grid. The friction is in the duplicate skeleton, which is the DRY discussion above, not an Open/Closed one. If `conceptsData.tsx` ever grows past the point where editing it by hand feels heavy, that's the day a Strategy registry earns its place. Not today. **Verdict:** Not worth fixing. The codebase is open enough for its current rate of extension.

---

### Liskov Substitution

**NOT FOUND.** No inheritance hierarchies of any depth. `MinHeap` and `MaxHeap` are parallel classes (`BinaryHeap.ts:23` and `:136`), not subtypes of a shared base. `BSTNode` (`BinarySearchTree.ts:3`), `Node` (`BinaryHeap.ts:285`), `Node2` (`Graph2.ts:21`), `TreeNode` (`Tree.ts:8`), and `PGState` (`River_crossing_puzzles/PG.ts:3`) are all independent classes that don't extend anything. Without inheritance, LSP has no surface to violate.

---

### Interface Segregation

**NOT FOUND.** TypeScript is barely used as a typing system in the algorithm files. `Graph.ts`, `Graph2.ts`, `BinaryHeap.ts`, and `PriorityQueue.ts` all carry `/* eslint-disable @typescript-eslint/no-explicit-any */` at the top and use `any` as their default annotation. There are no `interface` declarations to be fat or thin. The principle assumes a vocabulary the codebase doesn't speak yet — when interfaces arrive (if they ever do), Interface Segregation will become relevant; until then, it's not.

---

### Locality of Behaviour

**DEEP.** This is the principle the codebase honours by design, and it's the counter-argument to every SRP / SoC complaint above.

**Where it's honoured.** Every visualizer page co-locates algorithm + animation + UI in a single `src/app/<family>/<algo>/page.tsx`. `bubble-sort/page.tsx` contains, in one file:

- The algorithm itself (`:54–76`)
- The animation loop driving the algorithm (`:62–66`)
- The control panel that lets the user trigger and parameterize it (`:85–117`)
- The visualizer wiring (`:120–125`)
- The complexity readout the reader is here to learn about (`:89–93`)

The reader's first read is self-contained. There's no cross-file chase to understand bubble sort in this codebase — the URL `/sorting/bubble-sort` maps to one file, and that file is the whole answer.

The same pattern holds for every other visualizer. `quick-sort/page.tsx:55–123` carries the entire divide-and-combine logic inline, including the recursive helper, the random pivot selection (`:82`), and the highlight-region orchestration (`:72–76`). `merge-sort/page.tsx:53–156` puts divide, combine, and the explicit `updateOriginalArray` animation helper in one closure. The locality isn't accidental; it's the architecture.

**Why it matters here.** reincodes is a teaching artifact. The product is the legibility of these algorithms to a reader who arrives at `/sorting/bubble-sort` wanting to understand bubble sort — and a portfolio interviewer who arrives wanting to see how the author writes code. In both cases, "open the file, read top to bottom, you've seen the whole thing" is more valuable than "open the file, see a UI shell, follow an import into a utility module, follow another import into a generator, follow another import into a hook." Each layer of indirection is a paragraph the reader has to hold in their head before they get to the bubble sort. Locality is the principle that lets the reader skip those paragraphs.

There's a second-order benefit: the algorithm and its animation are literally the same closure, which means the relationship between an algorithm step and a visual frame is one expression away. `setBars([...bars])` follows the swap on the next line (`bubble-sort/page.tsx:66`). You can read the visualization timing off the algorithm structure directly. Split the layers and that mapping becomes implicit — a step protocol, a consumer effect, a renderer. Locality keeps it explicit.

**Is it worth fixing?** This is not a violation. There is nothing to fix. The interesting question is whether to *defend* the locality more deliberately — name it as a design principle in a comment or a README — so that the next person reading the code doesn't reach for SRP/SoC and try to "clean it up." The codebase under-documents its own architectural commitments, and that's the only refactor adjacent to locality that's worth doing: write the principle down so it survives the next refactor pass.

**Which techniques would address it.** None — there's no refactor to apply. The principle is being honoured. The only adjacent action is **Rename** (Chapter 01) on the implicit pattern, by adding a comment or a `README` in `src/app/sorting/` that says "each page is self-contained on purpose; do not extract algorithms into utility modules without a feature reason."

**Verdict:** Not a violation; it's the design. Worth documenting so the design survives.

---

### Principle of Least Surprise

**BRIEF.** Three surprises in this codebase, all small individually, all worth flagging because the cumulative effect on a new reader compounds:

- **`src/utils/data_structures/Graph2.ts` next to `Graph.ts`.** The `2` reads like a version number. New reader's first question: "is `Graph` deprecated? am I supposed to use `Graph2`? what does the `2` mean?" The internal comments (`Graph.ts:7` "this version is from IK", `Graph2.ts:6` "this version is from Book") are a sourcing note, not a usage signal. The reader has to grep imports to figure out which one to reach for.
- **`src/app/trees/n-ary-tree.tsx/page.tsx`.** The folder is literally named `n-ary-tree.tsx` (with `.tsx` in the folder name), and the file inside is a 7-line stub returning the string "N-ary Tree". The folder-name extension is an artifact of how the route was created; the stub is a placeholder. Either alone is a small surprise. Together, they're the most "what's going on here" moment in the codebase.
- **The animation pattern.** `await delayLoop(speed)` inside a `useState`-mutating loop (`bubble-sort/page.tsx:64`) is not the React idiom most engineers carry. The conventional shapes are `requestAnimationFrame`, a state machine, or `useEffect` with a cleanup. The codebase's pattern works and is consistent across pages, but a React engineer's first read includes "wait, you're awaiting inside an algorithm function that mutates the array directly and then calls setState on it?" That's not wrong — it's just not what the React mental model predicts. (Context.md flags the pattern as load-bearing, which is correct.)

**Take:** The first two are five-minute fixes — rename `Graph2` (or finish the migration and delete `Graph`), and delete or implement the n-ary tree stub (or move it to a `TODO` so it doesn't ship as a dead route). Worth doing as housekeeping. The third surprise is the genuinely interesting one: the animation pattern reads as surprising only because it inverts the usual React relationship (state-then-effect vs. effect-then-state). Once you see it, it's a reasonable choice for the use case — but it's worth a comment near `delayLoop.ts` explaining why this codebase animates this way instead of with `requestAnimationFrame`. **Verdict:** Worth doing for the first two (cheap cleanups); for the third, worth a documentation comment, not a refactor.

---

### Tell, Don't Ask

**MENTION.** Tell-Don't-Ask is about preferring "ask the object to do something" over "query the object's state and decide externally." reincodes is barely object-oriented in the sense the principle assumes — most state is held in React's `useState`, and the algorithm functions read and write arrays directly. The classes that exist (`MinHeap`, `MaxHeap`, `Graph2`, `BinarySearchTree`, `Tree`, `PriorityQueue`) all expose imperative methods (`insert`, `getMin`, `enqueue`, `dequeue`, `addEdge`) and callers do tell them what to do. There's no visible "query state and branch externally" pattern that this principle would catch.

---

### What this codebase honours and what it strains against

reincodes honours **Locality of Behaviour** by default, and it does so with intent. The visualizer pages keep algorithm, animation, and UI controls in one file because the reader's first read needs to be self-contained — and that's the right call for a teaching artifact whose product is the legibility of its algorithms. A reader who arrives at `/sorting/bubble-sort` opens one file, reads top to bottom, and has seen the whole thing. The animation timing is one line away from the swap. The complexity readout is one screen away from the algorithm body. The locality is the architecture.

The codebase strains against **Single Responsibility** and **Separation of Concerns** for exactly the same reason it honours locality — those principles want the algorithm in one module, the animation in another, the presentation in a third. They're real principles, and the violations they name in `bubble-sort/page.tsx` are real violations on paper. They earn their place when the test surface, the scrub feature, or the reuse pressure demands them, and none of those forces are present here yet. The codebase has correctly noticed that paying the indirection cost for a benefit that hasn't arrived is the wrong trade.

**DRY** gets applied selectively, and the selection is mostly right. `MinHeap` and `MaxHeap` deserve a parameterized collapse — they're real duplication, they've already drifted, and the fix is a clean Parameterize Function. The sorting page skeletons look like duplication to a habituated DRY eye but read as a series of standalone examples to a teaching eye, and the teaching eye is the right one for this codebase. `Graph` and `Graph2` aren't a DRY problem at all; they're a Rename problem with a half-finished migration underneath, and the resolution is to finish the migration or rename the survivor — not to unify them.

**Dependency Inversion** and **Open/Closed** are principles that pay back at a scale this codebase doesn't operate at. They're worth knowing about; they're not worth applying. **Liskov** and **Interface Segregation** don't have a surface to apply against — the codebase doesn't use inheritance or interfaces in the way those principles assume. **Tell-Don't-Ask** is not relevant to a codebase that's mostly hooks and array mutations.

The one place the codebase has small principled surprises — `Graph2` next to `Graph`, the `n-ary-tree.tsx` folder name and stub, the `delayLoop`-driven animation pattern — is the one place worth a light pass. Two of the three are housekeeping; the third is worth a documenting comment. None of them are structural.

The take that distinguishes this chapter from a generic refactor checklist is that **the visualizer pages are not a Single Responsibility violation; they're a Locality of Behaviour commitment**. Reading them as the former produces a refactor that the codebase doesn't need; reading them as the latter produces an architecture worth defending. The codebase looks repetitive to a DRY eye and looks well-composed to a teaching eye, and the teaching eye is the one to use here.
