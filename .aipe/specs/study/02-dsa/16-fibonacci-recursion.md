# Fibonacci by tail recursion

**Industry name(s):** Fibonacci, decrease-and-conquer recursion
**Type:** Industry standard · Language-agnostic

> Compute Fibonacci(n) by recurring with `(n-1, b2, b1+b2)`, accumulating the values in parameters. Visualized at `/recursions/fibonacci-numbers` with a callstack tree.

**See also:** → [17-count-all-subsets-backtracking](./17-count-all-subsets-backtracking.md) · → [18-n-choose-k](./18-n-choose-k.md) · → [10-n-ary-tree](./10-n-ary-tree.md)

---

## Why care

Fibonacci is the textbook example of "how *not* to recurse" — the naive `fib(n-1) + fib(n-2)` is exponential because it recomputes everything. This codebase uses the *bottom-up tail-recursive* form, which is linear: pass the running totals down the call chain, return the answer when n reaches 0.

The pattern teaches three things at once: tail recursion, accumulator parameters, and the difference between top-down (memoised) and bottom-up DP.

---

## How it works

Picture climbing stairs while remembering the last two step heights. Each new step is the sum of the previous two — you don't need to recompute earlier steps because the accumulator carries them down the chain.

### The implementation

```
// src/app/recursions/fibonacci-numbers/page.tsx:20-40
function bottom_up_decrease_and_conquer_find_fibonacci(n, b1 = 0, b2 = 1):
  if n != parentCounter and !tree.find(n):
    tree.insert(parentCounter, n, b1 if n==0, `fn(${n}-1, ${b1}, ${b1+b2})` if n!==0)
  parentCounter = n

  if n == 0: return b1
  else: return bottom_up_decrease_and_conquer_find_fibonacci(n-1, b2, b1+b2)
```

The recursion shape: `fib(n, b1, b2) = fib(n-1, b2, b1+b2)`. Each call decrements `n` by 1, slides the window forward (`b1 ← b2`, `b2 ← b1+b2`). When `n == 0`, `b1` holds the answer.

### Trace: `fib(5, 0, 1)`

```
fib(5, 0, 1)  → call fib(4, 1, 1)
fib(4, 1, 1)  → call fib(3, 1, 2)
fib(3, 1, 2)  → call fib(2, 2, 3)
fib(2, 2, 3)  → call fib(1, 3, 5)
fib(1, 3, 5)  → call fib(0, 5, 8)
fib(0, 5, 8)  → return 5

Result: 5  ← Fibonacci(5) = 5  ✓

Series accumulating in b1:
  n=5, b1=0, b2=1
  n=4, b1=1, b2=1
  n=3, b1=1, b2=2
  n=2, b1=2, b2=3
  n=1, b1=3, b2=5
  n=0, b1=5  ← answer
```

### vs naive recursive Fibonacci

```
function fib_naive(n):
  if n < 2: return n
  return fib_naive(n-1) + fib_naive(n-2)

fib_naive(5):
              fib(5)
              /     \
           fib(4)    fib(3)
           /  \      /  \
        fib(3)fib(2) fib(2)fib(1)
         / \   ...    ...   ...
       fib(2)fib(1)

Calls: ~F(n) — exponential.
For fib(40): ~1 billion calls.
```

The bottom-up form has *n* calls. The naive form has F(n) calls (exponential).

### Complexity

```
┌────────────────┬─────────────┬────────────┐
│ Variant        │ Time        │ Space      │
├────────────────┼─────────────┼────────────┤
│ Naive recursive│ O(2^n)      │ O(n) stack │
│ Memoised top-dn│ O(n)        │ O(n)       │
│ Tail-recursive │ O(n)        │ O(n) stack │
│   (this code)  │             │   (JS no   │
│                │             │    TCO)    │
│ Bottom-up loop │ O(n)        │ O(1)       │
└────────────────┴─────────────┴────────────┘
```

In Strict ECMAScript with TCO (which V8 doesn't enable), the tail-recursive form would be O(1) stack. Without TCO, it's O(n) stack — same as naive top-down, but linear calls instead of exponential.

### The principle

This is what people mean by *tail recursion is iteration in disguise*. By passing the running state in parameters instead of computing-then-combining return values, each call's work is independent of subsequent calls — which a compiler with TCO can turn into a loop with zero stack growth.

The full picture is below.

---

## Fibonacci recursion — diagram

```
Bottom-up tail-recursion (linear):

  fn(5, 0, 1)
       ↓ n-1, slide window
  fn(4, 1, 1)
       ↓
  fn(3, 1, 2)
       ↓
  fn(2, 2, 3)
       ↓
  fn(1, 3, 5)
       ↓
  fn(0, 5, 8)    ← base case, return 5

vs naive top-down (exponential):

           fib(5)
          /      \
       fib(4)    fib(3)        ← branches at every call
      /     \    /     \
    fib(3)  fib(2)  fib(2)  fib(1)
   /   \    / \    / \
  ...  ...
```

---

## In this codebase

**Page:** `src/app/recursions/fibonacci-numbers/page.tsx` L20–L40.
**Tree used to render:** `Tree` class from `src/utils/data_structures/Tree.ts`.
**Visualizer:** `CallstackVisualizer`.

GitHub: `[fibonacci-numbers/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/recursions/fibonacci-numbers/page.tsx#L20-L40)`.

---

## Elaborate

### Where this pattern comes from
Fibonacci dates to Liber Abaci (1202). The bottom-up form is from Dijkstra (1980s) as part of his "we should always be able to derive iterative from recursive" essays. Tail recursion as a compiler optimisation: Steele's PhD thesis (1977).

### The deeper principle
*Accumulator parameters turn recursion into iteration.* Any tail-recursive function with accumulator params can be mechanically converted to a loop. The pattern shows up in functional programming languages (Lisp, OCaml, Haskell) as the standard way to implement loops without mutation.

### Where this breaks down
- JS doesn't have tail-call optimization. The stack still grows. At `n = 10000` you'd overflow.
- The pattern doesn't generalise to branching recursion (Fibonacci does branch in naive form, doesn't in the bottom-up form because each call has exactly one recursive call).

### What to explore next
- Memoised top-down Fibonacci — O(n) with a cache.
- [17-count-all-subsets-backtracking](./17-count-all-subsets-backtracking.md) — branching recursion.
- Matrix exponentiation Fibonacci — O(log n) for very large n.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Tail-recursive (here)    │ Naive top-down recursive │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Time             │ O(n)                     │ O(2^n)                   │
│ Stack            │ O(n) (no TCO)             │ O(n)                    │
│ Code shape       │ Accumulator params       │ Add two return values    │
│ Teaching         │ "Iteration in disguise"   │ "Don't do this"          │
│ Practical use    │ Yes                       │ No                       │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Stack savings without TCO. JS engines didn't ship tail-call optimisation despite it being in the ES2015 spec — so the tail-recursive form still grows the stack. For n > 10000 it overflows.

### What the alternative would have cost

Naive `fib(n-1) + fib(n-2)` is exponential — fib(40) is already noticeable, fib(50) takes minutes. Memoised top-down brings it back to O(n) but needs a cache. The tail-recursive form gets O(n) without explicit caching.

### The breakpoint

Fine for visualisation up to n ≈ 20 (any larger and the tree is too wide to render). At big n, use iteration or matrix exponentiation.

---

## Tech reference (industry pairing)

### Tail-recursive accumulator pattern

- **Codebase uses:** Tail-recursive Fibonacci with `(n, b1, b2)` accumulator parameters.
- **Why it's here:** demonstrates the "recursion-as-loop" pattern from functional programming.
- **Leading today:** Iterative form (a `for` loop) — `adoption-leading` for production Fibonacci, 2026.
- **Why it leads:** O(1) memory, no stack concerns, every language supports it.

---

## Summary

### Part 1 — concept recap

This Fibonacci implementation uses tail recursion with accumulator parameters: `fib(n, b1, b2) = fib(n-1, b2, b1+b2)`, base case `fib(0, b1, _) = b1`. reincodes builds a `Tree` of the recursive calls as it goes and renders it via `CallstackVisualizer`. The constraint is "teach the pattern, not the absolute fastest impl," and the cost is JS's lack of TCO means stack still grows.

### Part 2 — key points to remember

- Accumulator parameters slide the (b1, b2) window forward each call.
- Single recursive call per level → linear call chain, O(n).
- Naive version (`fib(n-1) + fib(n-2)`) is O(2^n) exponential.
- With TCO this is O(1) stack — JS doesn't have TCO.
- Production: a `for` loop is the right shape.

---

## Interview defense

### What an interviewer is really asking

When someone asks about Fibonacci, they want to hear the *naive vs bottom-up vs iterative* tradeoff and a coherent explanation of why naive is exponential. The wrong answer is "it's O(n)."

### Likely questions

**Q [mid]: Why is `fib(n-1) + fib(n-2)` exponential?**

A: Each call makes two recursive calls; the tree of calls has ~F(n) leaves where F is the Fibonacci function — F(n) grows like φ^n ≈ 1.618^n. Most subproblems are recomputed: fib(38) is computed many times when running fib(40). Without memoisation, you re-do all the work each time the same subproblem appears.

**Q [senior]: Tail-recursive Fibonacci vs `for` loop — when do you pick which?**

A: For pure code clarity in a language with TCO (Lisp, Scheme, Haskell), tail recursion is idiomatic and the compiler optimises it to a loop. In JS, the runtime doesn't optimise tail calls, so the `for` loop is the practical choice — same asymptotic cost, no stack. The recursive form is a teaching shape; the loop is the production shape.

```
┌── Tail recursive ─────────┐    ┌── For loop ───────────────┐
│  return fib(n-1, b2, b1+b2)│   │  for i: [b1, b2] = [b2,   │
│                            │   │            b1+b2]          │
│  O(n) calls               │    │  O(1) stack               │
│  Idiomatic in FP languages │    │  Idiomatic in JS / Java  │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: At n = 1B, can you compute Fibonacci?**

A: Not with O(n) iteration in any reasonable time. Use matrix exponentiation: Fibonacci can be expressed as `[[F(n+1), F(n)], [F(n), F(n-1)]] = [[1,1],[1,0]]^n`. Computing matrix power by squaring is O(log n), making fib(1B) take ~30 operations. The trade: each "operation" is a 2×2 matrix multiply with bignum arithmetic, so the numbers themselves are huge.

### One-line anchors

- "Tail recursion + accumulator = iteration in disguise."
- "Naive Fibonacci is O(2^n) — don't write it."
- "Bottom-up is O(n) with a single call chain."
- "Production: use a for loop. Teaching: use this."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Trace the call sequence for `fib(6, 0, 1)`. Show `(n, b1, b2)` at each step.

### Level 2 — Explain it out loud
"Why doesn't this version recompute work like the naive version?"

### Level 3 — Apply it to a new scenario
"Compute factorial(n) using a tail-recursive accumulator."

### Level 4 — Defend the decision you'd change
"Would you rewrite this as a `for` loop?"

### Quick check
- File? → `src/app/recursions/fibonacci-numbers/page.tsx`.
- Recurrence? → `fib(n, b1, b2) = fib(n-1, b2, b1+b2)`.
- Complexity? → O(n) time, O(n) stack (no TCO in JS).

✓ Pass: all three.
