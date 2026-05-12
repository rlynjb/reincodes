# N choose k combinations

**Industry name(s):** n-choose-k, combinations, k-subsets, binomial selection
**Type:** Industry standard · Language-agnostic

> Enumerate all C(n,k) = n!/(k!(n-k)!) subsets of exactly k elements from a set of n. Visualized at `/recursions/n-choose-k` with a constrained decision tree.

**See also:** → [17-count-all-subsets-backtracking](./17-count-all-subsets-backtracking.md) · → [16-fibonacci-recursion](./16-fibonacci-recursion.md)

---

## Why care

Subsets-of-exactly-k is the right shape for lottery combinations, drug-trial cohorts, A/B test design, and any "choose k of n" enumeration. It's a constrained version of count-all-subsets — same recursion shape but with an early exit when you've picked enough.

The math counts C(n,k); the algorithm enumerates them. Foundational in combinatorics, the basis of binomial expansion, and the cornerstone of probabilistic-combinatorial reasoning.

---

## How it works

Picture choosing 3 friends from 10 to invite to a party. For each friend: invite them or don't. But you must end with exactly 3 invitations. The recursion prunes branches that can't satisfy the count: if you've already invited 4 and the limit is 3, stop. If you've invited 1 and have only 2 friends left, you must invite both.

### The algorithm

```
function nChooseK(items, k, idx = 0, current = []):
  // Base: collected exactly k
  if current.length == k:
    record(current)
    return
  // Prune: not enough items left to reach k
  if idx >= items.length: return
  if (items.length - idx) < (k - current.length): return

  // Exclude items[idx]
  nChooseK(items, k, idx + 1, current)

  // Include items[idx]
  current.push(items[idx])
  nChooseK(items, k, idx + 1, current)
  current.pop()
```

The two pruning conditions matter:
- `current.length == k`: collected enough, stop adding.
- `items.length - idx < k - current.length`: not enough remaining items to reach k, abort.

### Trace on `nChooseK([1,2,3,4], k=2)`

```
                          (idx=0, [], need 2)
                         /                    \
                  ex 1                         inc 1
              (idx=1, [], need 2)         (idx=1, [1], need 1)
                  /         \                /              \
              ex 2          inc 2          ex 2            inc 2
        (idx=2,[],need 2) (idx=2,[2],need 1) (idx=2,[1],need 1) (idx=2,[1,2],done)
                                                                  RECORD [1,2]
              ...                                              ...

Final subsets of size 2:
  [1,2], [1,3], [1,4], [2,3], [2,4], [3,4]
6 combinations = C(4,2)
```

### Complexity

- Time: O(C(n,k) × k) — enumerate each combination, copy each.
- Space: O(k) for recursion stack.

For C(n,k) explicit: `n! / (k! × (n-k)!)`. Pascal's triangle gives the values.

```
C(n,k) table:
                       k=0  k=1  k=2  k=3  k=4
                n=0    1
                n=1    1    1
                n=2    1    2    1
                n=3    1    3    3    1
                n=4    1    4    6    4    1
                n=5    1    5    10   10   5    1
```

### The principle

This is what people mean by *constrained enumeration*. Same backtracking shape as count-all-subsets, but with a constraint (exactly k items) that prunes most of the search space. From 2^n leaves down to C(n,k) leaves — for k=2, n=10: 1024 → 45.

The full picture is below.

---

## n-choose-k — diagram

```
For nChooseK([1,2,3,4], k=2):

The pruned decision tree:

                          (0, [], 2)
                       /               \
                   ex 1                 inc 1
                  (1, [], 2)         (1, [1], 1)
                  /        \           /          \
              ex 2          inc 2     ex 2        inc 2
            (2,[],2)     (2,[2],1)  (2,[1],1)    [1,2] ✓
              /    \        /    \      /    \
           ex 3   inc 3  ex 3  inc 3 ex 3 inc 3
        (3,[],2)(3,[3],1) (3,[2],1) ✓ (3,[1],1)  [1,3] ✓
         (no enough)  (3,[3],0)→[3]? no need 1
         pruned        ...

Subsets (depth-first traversal yields in order):
  [1,2], [1,3], [1,4], [2,3], [2,4], [3,4]
```

---

## In this codebase

**Page:** `src/app/recursions/n-choose-k/page.tsx`.
**Reference impl:** `src/utils/notes/Recursions/N_choose_k_combinations.ts`.

GitHub: `[n-choose-k/page.tsx](https://github.com/rlynjb/reincodes/blob/main/src/app/recursions/n-choose-k/page.tsx)`.

---

## Elaborate

### Where this pattern comes from
Combinations have been computed since Pascal's triangle (named for Pascal, used by ancient Indian, Persian, and Chinese mathematicians). The recursive form follows from the identity `C(n,k) = C(n-1, k-1) + C(n-1, k)` — either include the n-th element (need k-1 more from n-1) or exclude it (need k from n-1).

### The deeper principle
*Pascal's triangle identity is the recursion.* Every n-choose-k call decomposes into two smaller n-choose-k calls — the include and exclude branches correspond exactly to the two terms of Pascal's identity.

### Where this breaks down
- n very large with k around n/2: C(n,k) ~ 2^n / √n → still exponential.
- Need to count, not enumerate: use the closed-form `n! / (k! (n-k)!)` — O(k) multiplications.

### What to explore next
- [17-count-all-subsets-backtracking](./17-count-all-subsets-backtracking.md) — unconstrained version.
- Permutations — same recursion shape but with ordering.
- Stars-and-bars combinations.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Recursive enumeration    │ Closed-form count        │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Output           │ All combinations         │ Just the count           │
│ Time             │ O(C(n,k) × k)            │ O(k)                     │
│ Memory           │ O(k) stack               │ O(1)                     │
│ Use case         │ Need each subset         │ Need only the count      │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

If you only need the count, the recursive form is wasteful — `n! / (k! (n-k)!)` computes it in O(k). The recursive form is necessary when you need each subset.

### The breakpoint

Fine for visualisation at n ≤ 8 (the tree fits). For n > 30 and k around n/2, even pruned enumeration is infeasible.

---

## Tech reference (industry pairing)

### Constrained backtracking

- **Codebase uses:** Recursive enumeration with two-condition pruning.
- **Why it's here:** demonstrates "backtracking with constraints" as the next step beyond unconstrained.
- **Leading today:** Constrained backtracking — `adoption-leading` for combinatorial enumeration, 2026.

---

## Summary

### Part 1 — concept recap

n-choose-k enumerates all C(n,k) combinations using the same backtracking shape as count-all-subsets, with two pruning rules: stop when current has k items, abort when not enough items remain. reincodes implements it on `/recursions/n-choose-k/page.tsx`. The constraint is "exactly k items," and the cost is C(n,k) combinations enumerated.

### Part 2 — key points to remember

- Two prune conditions: `current.length == k`, `remaining < needed`.
- C(n,k) total combinations; each printed once.
- O(C(n,k) × k) enumeration time.
- Recursion mirrors Pascal's identity: `C(n,k) = C(n-1,k-1) + C(n-1,k)`.
- For count only, use closed-form.

---

## Interview defense

### What an interviewer is really asking

When someone asks about combinations, they want to hear about *Pascal's identity* and how it justifies the recursion. The wrong answer is rote enumeration without naming the math.

### Likely questions

**Q [mid]: How many combinations of 5 choose 3?**

A: 10. Pascal's: C(5,3) = C(4,2) + C(4,3) = 6 + 4 = 10. Closed: 5!/(3!2!) = 120/12 = 10.

**Q [senior]: When would you use permutations instead of combinations?**

A: When order matters. {A,B} and {B,A} are the same combination but different permutations. Lottery numbers — combinations. License plates — permutations. The recursive shape is similar (decide for each position), but permutations have n! / (n-k)! arrangements vs combinations' n! / (k!(n-k)!).

```
Combinations (n=3, k=2):   {1,2}, {1,3}, {2,3}        3 total
Permutations  (n=3, k=2):  (1,2),(2,1),(1,3),(3,1),    6 total
                            (2,3),(3,2)
```

**Q [arch]: At C(50, 25) ≈ 1.26 × 10^14, can you enumerate?**

A: No. Even at 1 nanosecond per combination, that's ~35 hours of CPU. The architectural pivot: if you're looking for one specific combination, use sampling or randomised search. If you're scoring all of them, batch them and process in parallel — but at this scale most algorithms designed for combinations use closed-form or DP rather than enumeration.

### One-line anchors

- "Same backtracking as subsets, with k constraint."
- "Pascal's identity: C(n,k) = C(n-1,k-1) + C(n-1,k)."
- "Prune when 'need k more, have m items left, m < k'."
- "Count is closed-form; enumeration is recursive."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the pruned decision tree for `nChooseK([a,b,c,d,e], k=2)`. Mark pruned branches.

### Level 2 — Explain it out loud
"How does the second pruning rule (not enough remaining) work?"

### Level 3 — Apply it to a new scenario
"Find all subsets of `[2,3,5,7]` with sum exactly 10 using the same recursion shape (subset-sum with backtracking)."

### Level 4 — Defend the decision you'd change
"Would you switch the recursion to iteration with `next_combination` arithmetic?"

### Quick check
- File? → `src/app/recursions/n-choose-k/page.tsx`.
- Pascal identity? → `C(n,k) = C(n-1,k-1) + C(n-1,k)`.
- Prune conditions? → `current.length == k` and `remaining < k - current.length`.

✓ Pass: all three.
