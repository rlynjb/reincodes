# Array of random numbers

**Industry name(s):** Test fixture generator, seed array, uniform integer sampler
**Type:** Language-agnostic

> Returns a fresh array of N random integers between 1 and 60 — the input primitive every sorting visualizer in this codebase starts from.

**See also:** → 02-bubble-sort.md · → 03-insertion-sort.md · → 04-selection-sort.md

---

## Why care

You open `/sorting/bubble-sort`, you hit Run, you watch the bars dance. You hit Reset, the bars rearrange into a new mess, you hit Run again. That second mess — the new array of values that lets you replay the algorithm — comes from a function call. Every sorting page in this codebase opens with the same line: `setBars(generateArrayOfRandomNumbers(inputSize))`. Whatever the algorithm does next, this is the substrate it operates on.

That "give me a fresh array of N numbers I can sort" job is what `generateArrayOfRandomNumbers(size)` does. Not the sort itself, not the rendering, not the animation — just the *input*. It's the same job `Array.from({ length: n }, () => Math.random())` does in a one-liner, except this version constrains the range to `[1, 60]` so a value can be drawn as a bar height that fits on screen.

**Why you need to answer that question at all:** because every visualizer needs a *new* dataset each time the user clicks Reset. If the function returned the same array (or a cached one), the user would watch the same animation twice. The whole point of the visualizer is that pressing Reset gives you a new shape to sort — different starting positions, different swap counts, different "watch what happens when this array is nearly sorted vs reversed" scenarios. The reset button breaks if this function doesn't produce a fresh array on every call.

Without a generator:
- Visualizer mounts → sort runs once on whatever array exists → Reset has nothing new to show
- The user sees a single canned demo, not a tool

With this generator:
- Mount → `generateArrayOfRandomNumbers(50)` → 50 new bars
- Reset → call again → 50 different bars
- Change input size → call again with `inputSize=30` → 30 bars

This is the array equivalent of `Array.from({ length: n }, () => Math.floor(Math.random() * 60) + 1)` — a fresh test fixture, generated at call time, in the range your renderer can draw.

---

## How it works

**The mental model: a `while` loop that pushes random integers into an empty array until it's full.**

You've written this loop in interview prep a hundred times. You want N items. You start with an empty array. You generate one item per iteration. You stop when `arr.length` reaches N. That's it. There's no sorting, no deduplication, no clever sampling — every call produces a length-N array of independent draws from `[1, 60]`.

```
length = 5
                            arr
┌──────────────┐         ┌────┐
│ start        │         │    │  empty
└──────┬───────┘         └────┘
       ▼
┌──────────────┐         ┌────┐
│ draw  num=23 │  push   │ 23 │
└──────┬───────┘  ────►  └────┘
       ▼
┌──────────────┐         ┌────────┐
│ draw  num=7  │  push   │ 23, 7  │
└──────┬───────┘  ────►  └────────┘
       ▼
       (... three more draws ...)
       ▼
┌──────────────┐         ┌──────────────────────┐
│ length === 5 │  done   │ 23, 7, 41, 12, 55    │
└──────────────┘         └──────────────────────┘
```

This is N independent draws from a uniform distribution. The strategy is: generate one value at a time, stop when you have enough.

### The body — one draw per iteration

The inner work is one line: `Math.floor(Math.random() * (max - min + 1)) + min` with `min = 1`, `max = 60`. If you've written a `getRandomInt(min, max)` helper in any frontend codebase, this is the same expression, inlined.

```
Math.random()                  → 0.0  .. 0.99999...
× (max - min + 1)              → 0.0  .. 59.999...
Math.floor(...)                → 0    .. 59
+ min                          → 1    .. 60
```

The bridge from what you know. In React you use `Math.random()` to seed a `key={Math.random()}` (a thing you should not do, but everyone has), or to pick a random hex color in a stylebook. Same call, same uniform distribution — here it's just constrained and floored into the bar-height range.

The practical consequence: every call returns a different array. Two consecutive calls with the same `length` produce two completely different sequences. There is no seed, no determinism, no reproducibility — the function is non-deterministic by design.

### The guard that does almost nothing

There's an `if (num !== 0)` check before the push. Look at the range: `min = 1`, `max = 60`. The expression `Math.floor(Math.random() * 60) + 1` returns an integer in `[1, 60]`. **It cannot be zero.** The guard is dead code. The loop is identical to a plain `for (let i = 0; i < length; i++) arr.push(num)`.

```
without the guard:               with the guard:
┌──────────────┐               ┌──────────────┐
│ draw num     │               │ draw num     │
│ push num     │               │ if (num!==0) │  always true
└──────────────┘               │   push num   │
                               └──────────────┘
                               same result, one wasted branch
```

This is a small artifact of how the function was written — likely defensive against a previous version with `min = 0`. It costs effectively nothing at `length = 50`, but it's the kind of dead branch a code reviewer would strip.

### The principle

This is what test-fixture generation looks like at its smallest. There's no clever algorithm, no optimization possible, no asymptotic improvement to chase — just N independent draws bundled into an array. Every sorting page in this codebase starts here, and the rest of the section walks what happens *after* this array is handed off.

The full picture is below.

---

## Array of random numbers — diagram

```
                  generateArrayOfRandomNumbers(length=5)
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ arr = []                     │
                  │ min = 1, max = 60            │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ while (arr.length < length)  │ ◀─┐
                  └──────────────┬───────────────┘   │
                                 │                   │
                                 ▼                   │
                  ┌──────────────────────────────┐   │
                  │ num = floor(rand * 60) + 1   │   │
                  │      → integer in [1, 60]    │   │
                  └──────────────┬───────────────┘   │
                                 │                   │
                                 ▼                   │
                  ┌──────────────────────────────┐   │
                  │ if (num !== 0) arr.push(num) │   │
                  │   (guard never fires)        │   │
                  └──────────────┬───────────────┘   │
                                 │                   │
                                 └───────────────────┘
                                 │  arr.length === length
                                 ▼
                  ┌──────────────────────────────┐
                  │ return arr                   │
                  │ → [23, 7, 41, 12, 55]        │
                  └──────────────────────────────┘
                                 │
                                 ▼
                        setBars(arr)
                  → ArrayVisualizer renders bars
```

---

## In this codebase

**File:** `src/utils/generateArrayOfRandomNumbers.ts`
**Function:** `generateArrayOfRandomNumbers(length)`
**Line range:** L5–L18

The shape, trimmed:

```
export const generateArrayOfRandomNumbers = (length: number) => {
  const arr = [];
  const min = 1;
  const max = 60;

  while (arr.length < length) {
    const num = Math.floor(Math.random() * (max - min + 1)) + min;
    if (num !== 0) {
      arr.push(num);
    }
  }

  return arr;
}
```

**Callers — every sorting page:**
- `src/app/sorting/bubble-sort/page.tsx` L26, L41 — initial mount + reset
- `src/app/sorting/insertion-sort/page.tsx` L26, L41
- `src/app/sorting/selection-sort/page.tsx` L26, L41
- `src/app/sorting/merge-sort/page.tsx` L26, L41
- `src/app/sorting/quick-sort/page.tsx` L27, L42
- `src/app/sorting/heap-sort/page.tsx` L27, L41

The pattern at every call site is the same: `setBars([])` then `setBars(generateArrayOfRandomNumbers(inputSize))`. The empty-then-fill is a React trick to force a remount on the `ArrayVisualizer` — otherwise React would diff the bars in place and the animation wouldn't reset cleanly.

**The single-value helper:** `src/utils/generateRandomNumber.ts` L1–L5 — `generateRandomNumber(min, max)`. Same expression, single value, used by `quick-sort` for randomized pivot selection (L82).

---

## Elaborate

### Where this pattern comes from

Test-fixture generators are as old as testing itself. Every property-based testing library (QuickCheck in Haskell, fast-check in JS, Hypothesis in Python) ships with `gen.array(gen.int(min, max), length)` primitives — same shape, fancier types. The visualizer-friendly version drops the type machinery and keeps just the array-of-ints case.

### The deeper principle

Generation is separate from consumption. The sort doesn't generate its own input; it accepts an array. Swap this function out for one that reads from a CSV, fetches from an API, or returns a near-sorted array (for benchmarking best-case behaviour), and not a single line of the sorting algorithms needs to change. The contract is `() => number[]`. Everything downstream is parameterised on that contract.

```
┌─────────────────────────┐   ┌─────────────────┐   ┌──────────────────┐
│ generateArrayOf...      │ → │ bars: number[]  │ → │ bubbleSort(bars) │
│ (or any number[] source)│   │ (state)         │   │                  │
└─────────────────────────┘   └─────────────────┘   └──────────────────┘
   swap this freely               same shape           same algorithm
```

### Where this breaks down

The function returns nothing reproducible. If you want to record a bug ("the sort animated weirdly on this specific array") you can't — the array is gone the next time someone hits Reset. A seedable PRNG (`mulberry32`, `seedrandom`) would fix this in two lines, at the cost of a `seed` argument the caller now has to pass.

The range is hardcoded `[1, 60]`. If you wanted to visualize an algorithm with negative numbers, zeros, or values outside the bar-height range, you'd need to either generalize the function (`generateArrayOfRandomNumbers(length, min, max)`) or write a new one. Neither is hard; just no one has needed it yet.

### What to explore next

- `generateRandomNumber(min, max)` → the single-value version, used by quick-sort's pivot picker
- Seedable PRNGs (mulberry32, seedrandom) → how to make the output reproducible without losing speed
- Property-based testing generators (fast-check) → what the typed, composable, full-power version of this looks like

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬────────────────────────┬────────────────────────┐
│ Cost dimension   │ while-loop generator   │ Array.from + map       │
├──────────────────┼────────────────────────┼────────────────────────┤
│ Lines of code    │ 13 (with guard)        │ 1                      │
│ Readability      │ explicit, walkthrough  │ tight, idiomatic       │
│ Performance      │ identical (~1µs/50)    │ identical              │
│ Reproducibility  │ none (Math.random)     │ none (Math.random)     │
│ Extensibility    │ easy to add rejection  │ awkward with rejection │
│ Dead-branch risk │ has one (num !== 0)    │ none                   │
└──────────────────┴────────────────────────┴────────────────────────┘
```

### Sub-block 1 — what we gave up

The function is 13 lines for what `Array.from({ length }, () => Math.floor(Math.random() * 60) + 1)` does in one line. Three extra lines come from the dead `if (num !== 0)` guard — and the guard is *load-bearing* in the sense that a reader has to stop, check the range, and confirm it can't fire. That's a few seconds of cognitive friction every time a new contributor reads this file.

There's no reproducibility. `Math.random()` is unseeded, which means you can't write a test that asserts the function returns a specific sequence. The function is a black box at the test boundary. For a visualizer this is fine — the user *wants* a new random array — but it limits the file's reusability for any future "regression test on this exact input" workflow.

### Sub-block 2 — what the alternative would have cost

If the function used `Array.from`, it would be one line, no guard, no while-loop. That looks like a clear win until you imagine the next variant the codebase might need — "give me an array with no duplicates," or "give me an array biased toward small values." The `while` form has room for `if (arr.includes(num)) continue` or rejection sampling without restructuring; the `Array.from` form forces a rewrite. The current shape is verbose for the simple case but bends nicely for harder cases.

If the function used a seedable PRNG (mulberry32, ~10 lines of seed-state code), every Reset could be replayable. The cost is an extra `seed` argument threaded through every visualizer's React state and reset handler — about 6 call sites to touch. Worth it if the team ever wants "send me a link that replays your exact sort animation"; not worth it for the current single-user demo.

### Sub-block 3 — the breakpoint

Fine until a visualizer needs a non-uniform input distribution — near-sorted, reverse-sorted, all-duplicates, all-distinct. At that point the function needs an `options` parameter or a sibling generator (`generateNearlySortedArray(length, swaps)`), and the dead guard becomes a real burden because it looks like it might be doing something specific to "skip zero" in the new distribution and isn't. Refactor it then.

### Sub-block 4 — what wasn't actually a tradeoff

A cryptographic RNG (`crypto.getRandomValues`) was not a real alternative. It's overkill for a visualizer — the user can't tell `Math.random` from `crypto`-grade randomness when they're watching 50 bars sort.

---

## Tech reference (industry pairing)

### Math.random

- **Codebase uses:** `Math.random()` inline in `generateArrayOfRandomNumbers.ts` L11 and `generateRandomNumber.ts` L4.
- **Why it's here:** the cheapest uniform `[0, 1)` source the browser ships. No imports, no setup, no seeding.
- **Leading today:** `Math.random()` — adoption-leading for non-security-critical randomness, 2026.
- **Why it leads:** present in every JS runtime since ES1; implementations are xorshift128+ or PCG variants on modern V8/JSC — fast, uniform-enough for everything except crypto.
- **Runner-up:** `crypto.getRandomValues(new Uint32Array(n))` — adoption-leading when reproducibility is irrelevant but bias-free distribution is required (token generation, nonce generation); `seedrandom` / `mulberry32` — innovation-leading when reproducibility matters (replayable demos, property-based testing).

### Array.prototype.push

- **Codebase uses:** `arr.push(num)` in `generateArrayOfRandomNumbers.ts` L13.
- **Why it's here:** amortized-O(1) append on a JS array, which V8 stores as a packed-int SMI array as long as the elements stay small integers — exactly this case.
- **Leading today:** `Array.prototype.push` — adoption-leading, 2026.
- **Why it leads:** universal, fast, no allocation cost when the array's underlying buffer has spare capacity.
- **Runner-up:** `Array.from({ length }, () => value)` — pre-allocates to the exact size, marginally faster for fixed-length arrays, but loses the "push until full" loop shape that `while`-based generation wants.

---

## Summary

`generateArrayOfRandomNumbers(length)` is a fixture generator: a `while` loop that pushes uniform `[1, 60]` integers into an array until the array hits the target length. Every sorting page in this codebase calls it on mount and on Reset to produce a fresh dataset for the algorithm to chew through. The constraint that shapes it is "give the user a new array every time they hit Reset" — without that, the visualizer is a canned demo. The cost is no reproducibility and one dead branch (`if (num !== 0)`), neither of which matters at this scale.

- One `while` loop, one `Math.random()` call per iteration, one `push` per draw — and the loop exits the moment `arr.length === length`.
- The range is hardcoded `[1, 60]` because bars in `ArrayVisualizer` are drawn with that height range; values outside the range would render off-screen.
- The `if (num !== 0)` guard is dead code with the current `[1, 60]` range — likely an artifact of a previous version where `min = 0`.
- Non-reproducible by design: every call returns a different array, which is what the Reset button needs.
- One-liner via `Array.from({ length }, () => Math.floor(Math.random() * 60) + 1)` would be equivalent today, but the current `while` shape leaves room for future rejection-sampling variants.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about a random-array generator, they're not testing whether you can write a for-loop. They're checking whether you separate generation from consumption, whether you notice dead code, and whether you know the difference between `Math.random()` (non-deterministic) and a seedable PRNG (deterministic). The good answer is short: "it produces N independent uniform draws, here are two ways to write it, and here's the dead guard."

### Likely questions

[mid] Q: Why a `while` loop instead of a `for` loop here?

A: The `while (arr.length < length)` shape is leftover from a defensive pattern — if you wanted to add rejection sampling later (e.g. "no duplicates"), a `while` lets you `continue` on a rejected draw without breaking the count. The `for` loop with `arr.push` works identically for the current case because the guard never fires. I'd refactor it to `Array.from` if I knew rejection wasn't coming.

Diagram:
```
for loop:               while loop:                   while + rejection:
i=0..length-1           arr.length < length           arr.length < length
  push(num)               push(num)                     if (bad) continue
                                                        push(num)
identical here          identical here                  this is why while
```

[senior] Q: The `if (num !== 0)` guard — what does it protect against?

A: Nothing, given the current range. `Math.floor(Math.random() * 60) + 1` returns `[1, 60]`, never zero. The guard is dead code, probably a leftover from when `min` was `0`. I'd strip it. The lesson: defensive code outlives the threat model it was written for, and the next reader has to stop and prove it's dead before they can trust the file.

Diagram:
```
range with min=0:                    range with min=1 (current):
  rand returns [0, 60]                 rand returns [1, 60]
  ↓                                    ↓
  if (num !== 0) push   ← real         if (num !== 0) push   ← dead
```

[arch] Q: How would you make this generator usable for property-based testing across the whole sorting suite?

A: Two changes. First, take `(min, max, seed)` as arguments so the distribution and the sequence are both controllable. Second, swap `Math.random` for `mulberry32(seed)` — about 10 lines, returns a `() => number` closure. Then every sorting algorithm can run as a property test: "for any seed, the result is sorted ascending and is a permutation of the input." The current shape blocks that because there's no seed.

Diagram:
```
Current (non-deterministic)       Property-test ready (seeded)
┌───────────────────────────┐    ┌───────────────────────────┐
│ () → number[]             │    │ (n, seed) → number[]      │
│   uses Math.random        │    │   uses mulberry32(seed)   │
│   not reproducible        │    │   reproducible            │
└───────────────────────────┘    └───────────────────────────┘
                                  ↓
                                  ↓ feeds property test:
                                  ↓
                                  for any seed, sort(gen(n, seed))
                                    is sorted and is a permutation
```

### The question candidates always dodge

Q: Why isn't this function just `Array.from({ length: n }, () => Math.floor(Math.random() * 60) + 1)`?

A: Honestly, it should be — for the current case. The `while` form is 13 lines, the `Array.from` form is 1, and they produce identical output at identical speed. The current shape is a small extra cost the codebase pays in exchange for two things: it's easier to add a rejection branch later (no-duplicates, biased distributions), and it's easier for someone new to the language to read because the loop is explicit. Both are weak reasons given that the codebase has no plans to add rejection sampling. If I owned this file, I'd inline it. But the cost is genuinely small — 12 lines of file space, one dead branch — so it's not worth a PR to rewrite on its own.

Diagram:
```
What we picked                    What we'd pick on a fresh day
┌──────────────────────────┐      ┌──────────────────────────────┐
│ const arr = [];          │      │ return Array.from(           │
│ while (arr.length < n)…  │      │   { length: n },             │
│ if (num !== 0) push      │      │   () => floor(rand*60)+1     │
│ return arr               │      │ )                            │
└──────────────────────────┘      └──────────────────────────────┘
  13 lines, 1 dead branch          1 line, no branch
```

### One-line anchors

- "It's a fixture generator: N uniform draws into a length-N array, range fixed to fit the bar renderer."
- "The `if (num !== 0)` guard is dead code with the current `[1, 60]` range — probably leftover from an earlier `min = 0` version."
- "Non-deterministic by design — every Reset gives a new array, which is the whole point."
- "Swap-in for a seeded PRNG turns every sorting page into a property test, ten lines of code away."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On a blank page, draw the control flow of `generateArrayOfRandomNumbers(5)`. Label the loop condition, the draw expression, the guard, and the exit.

Open the file. Check:
- Did you label the loop condition as `arr.length < length`?
- Did you label the draw expression as `Math.floor(Math.random() * 60) + 1`?
- Did you include the `if (num !== 0)` guard and note that it never fires?
- Did you show the return happening only when length is reached?

### Level 2 — Explain it out loud

Explain `generateArrayOfRandomNumbers` to a colleague who just asked "why doesn't it just use `Array.from`?" No notes. Under 60 seconds.

Checkpoints:
- Did you name `src/utils/generateArrayOfRandomNumbers.ts` as the file?
- Did you say the function returns N independent uniform integers in `[1, 60]`?
- Did you call out the dead `if (num !== 0)` branch?
- Did you name the tradeoff: explicitness now, room for rejection sampling later, vs. one-line conciseness?

### Level 3 — Apply it to a new scenario

You want to add a visualizer for "best case" sorting — an array that's already nearly sorted, with only K out-of-order swaps. Does `generateArrayOfRandomNumbers` extend to handle this, or does the codebase need a new function? What would you write?

Write your answer in 3–5 sentences. Then open `src/utils/generateArrayOfRandomNumbers.ts` L5–L18 and check whether the existing shape could be extended in place, or whether a sibling generator (`generateNearlySortedArray(length, swaps)`) would be cleaner.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: this function is non-deterministic. If you were starting this project today and you wanted to support replayable sort animations (share a link, see the same sort), would you make the same call? Why or why not? If you'd change it, what would the function signature become and what would every call site need to do differently?

Reference `src/app/sorting/bubble-sort/page.tsx` L26 and L41 to support your answer — those are the two call sites that would need a `seed` argument threaded in.

### Quick check — code reference test

Without opening any files:
- What file does this generator live in?
- What's the function name?
- What range does it produce?

Open and verify.

Pass: you named `src/utils/generateArrayOfRandomNumbers.ts` and `generateArrayOfRandomNumbers`.
Fail on range (`[1, 60]`): re-read the constants in L7–L8.
