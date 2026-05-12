# Binary search tree

**Industry name(s):** Binary search tree (BST), ordered binary tree
**Type:** Industry standard · Language-agnostic

> Each node holds a key; left subtree contains smaller keys, right subtree contains larger keys. Visualized at `/trees/binary-search-tree`.

**See also:** → [08-binary-heap](./08-binary-heap.md) · → [10-n-ary-tree](./10-n-ary-tree.md)

---

## Why care

You search a sorted array via binary search — halve the range each step, O(log n). But arrays are expensive to insert into (shift everything right). A BST is the data structure that gives you both: O(log n) search *and* O(log n) insert, as long as you don't let it degenerate into a sorted-linked-list.

BSTs are the canonical *ordered tree* — same family as red-black trees, AVL trees, B-trees. The simple BST in this codebase has no balancing, so it can degrade to O(n); production BSTs (e.g., the implementation behind Java's `TreeMap`) always balance.

---

## How it works

Picture a phone directory split by first letter: pick a middle letter (say M); names < M go left, names ≥ M go right. Each subtree is itself split. Looking up a name: compare to root letter, go left or right, repeat. Insert: same walk, but add a leaf at the destination.

### The shape

```
class BSTNode {
  key: number;
  left: BSTNode | null;
  right: BSTNode | null;
}

class BinarySearchTree {
  root: BSTNode | null;
  insert(key): walk down, attach as leaf
  search(key): walk down, return node or null
  delete(key): three cases (leaf / one child / two children + successor)
  min(): walk left until null
  max(): walk right until null
  successor(key): min of right subtree
  predecessor(key): max of left subtree
  preOrder/inOrder/postOrder: traverse and collect keys
}
```

### Operations and complexity

```
┌────────────┬──────────────┬──────────────┐
│ Operation  │ Balanced     │ Worst (deg.) │
├────────────┼──────────────┼──────────────┤
│ Insert     │ O(log n)     │ O(n)         │
│ Search     │ O(log n)     │ O(n)         │
│ Delete     │ O(log n)     │ O(n)         │
│ Min/Max    │ O(log n)     │ O(n)         │
│ Traversal  │ O(n)         │ O(n)         │
│ Space      │ O(n)         │ O(n)         │
└────────────┴──────────────┴──────────────┘
```

### Insert trace on empty tree, inserting 50, 30, 70, 20, 40

```
insert(50): empty → root=50

      [50]

insert(30): 30 < 50, go left, left null → attach left

      [50]
      /
    [30]

insert(70): 70 ≥ 50, go right, right null → attach right

      [50]
      /  \
    [30]  [70]

insert(20): 20<50 left → 20<30 left, null → attach

      [50]
      /  \
    [30]  [70]
    /
  [20]

insert(40):  40<50 left → 40≥30 right, null → attach

      [50]
      /  \
    [30]  [70]
    /  \
  [20]  [40]
```

### Delete (the tricky case: two children)

To delete a node with two children, find its **in-order successor** (smallest key in right subtree), copy its key into the node, then delete the successor from the right subtree (which has at most one child).

```
Delete 50 from:
      [50]
      /  \
    [30]  [70]
    /  \    \
  [20] [40] [80]

Successor of 50 in right subtree: min(70's left)? null → 70 itself.
Wait — that's not quite right. Successor when node has two children is:
  min of right subtree = walk right.left until null = 70 (since 70.left is null).

Replace 50's key with 70, then delete 70 from right subtree:
      [70]
      /  \
    [30]  [?]
    /  \   \
  [20] [40] [80]

Right subtree's "70 with right child 80, no left" → delete 70, lift 80:
      [70]
      /  \
    [30] [80]
    /  \
  [20] [40]
```

### Worst case: degeneration to a linked list

```
Insert 10, 20, 30, 40, 50:
[10]
   \
   [20]
      \
      [30]
        \
        [40]
          \
          [50]

This is a sorted linked list with O(n) search. Production BSTs use AVL or
red-black rotations to keep the tree balanced — out of scope here.
```

### The principle

This is what people mean by *ordered associative data structures*. A BST organises keys so that comparing to the root halves the search space — when balanced. The same idea underlies B-trees (database indexes), tries (string lookup), skip lists. The unifying principle: *exploit ordering to skip half the data per step*.

The full picture is below.

---

## BST — diagram

```
              [50]
             /    \
          [30]    [70]
          /  \      \
       [20] [40]   [80]
       /         /
     [10]     [75]

Properties:
  - All keys in left(50) subtree:  ≤ 50
  - All keys in right(50) subtree: > 50
  - Recursively true at every node.

  Inorder traversal yields keys in sorted order:
  10, 20, 30, 40, 50, 70, 75, 80
```

---

## In this codebase

**Implementation:** `src/utils/data_structures/BinarySearchTree.ts` L1–L506 — the full class with insert/search/delete (recursive + iterative) + four traversals.
**Page:** `src/app/trees/binary-search-tree/page.tsx`.

GitHub: `[BinarySearchTree.ts](https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/BinarySearchTree.ts)`.

---

## Elaborate

### Where this pattern comes from
The BST concept dates to the 1960s. Balanced variants (AVL, 1962; red-black, 1972) emerged to fix the degeneration problem. B-trees (1971) generalised the idea for disk-based storage where each node holds many keys.

### The deeper principle
*Pointers + ordering = log-time access.* The BST trades the random access of an array for the cheap insertion of a linked structure, recovering search speed via ordering.

### Where this breaks down
- No balancing → sorted input is a linked list.
- Pointer-chasing is cache-hostile compared to arrays.
- For string keys or composite keys, comparisons cost more than for numbers.

### What to explore next
- AVL / red-black trees — self-balancing variants.
- [08-binary-heap](./08-binary-heap.md) — different invariant (parent ≤ children), array-backed.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Unbalanced BST (here)    │ Hash table               │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Search           │ O(log n) avg / O(n) worst│ O(1) avg / O(n) worst    │
│ Ordered traversal│ O(n) in-order            │ O(n) but not sorted      │
│ Range queries    │ O(log n + k)             │ O(n)                     │
│ Memory           │ Pointers per node        │ Backing array            │
│ Stability        │ Order-of-insert affects  │ Hash-dependent           │
│                  │ shape                    │                          │
│ Used for         │ Ordered map, sorted scan │ Lookup by key            │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Worst-case logarithmic search. The unbalanced BST can degrade to O(n) on sorted input. Production BSTs balance via rotations after each insert; this codebase doesn't.

Cache locality. Each node is a separate allocation; traversal jumps in memory. Hash tables and B-trees do better on cache.

### What the alternative would have cost

A hash table loses ordered traversal and range queries. A balanced BST gives O(log n) guaranteed but adds rotation logic (~100 LOC). For a teaching visualizer, unbalanced is the right shape — show the degeneration, then teach balancing as the fix.

### The breakpoint

Fine until inputs are sorted or adversarial. Production code should never use unbalanced BSTs for unknown input.

---

## Tech reference (industry pairing)

### BST + class-based JS

- **Codebase uses:** Class-based TypeScript implementation in `BinarySearchTree.ts`.
- **Why it's here:** the canonical ordered-tree teaching artifact.
- **Leading today:** Self-balancing variants (red-black, AVL) — `adoption-leading` for production ordered-map use, 2026.
- **Why it leads:** O(log n) guaranteed across all operations.
- **Runner-up:** B-tree — `adoption-leading` when each node stores multiple keys, used by database indexes.

---

## Summary

### Part 1 — concept recap

A BST is an ordered binary tree where each node's left subtree contains smaller keys and right subtree contains larger keys, giving O(log n) search/insert/delete on average. reincodes implements one in `BinarySearchTree.ts` with both recursive and iterative variants of each operation, rendered via a `BinaryVisualizer` on the BST page. The constraint of this implementation is "teach the structure, not the balancing," and the cost is O(n) worst case on sorted input.

### Part 2 — key points to remember

- Left < node ≤ right invariant at every subtree.
- Inorder traversal yields keys in sorted order.
- Delete with two children replaces with in-order successor.
- Unbalanced — sorted input degenerates to a linked list.
- Production: red-black / AVL / B-trees balance to guarantee O(log n).

---

## Interview defense

### What an interviewer is really asking

When someone asks about BSTs, they want to hear about balancing. Naming the degeneration case and "production BSTs always balance" demonstrates you know the difference between the teaching artifact and the production one.

### Likely questions

**Q [mid]: Delete node 50 from a BST that has 50 with left=30 and right=70.**

A: 50 has two children. Find in-order successor (min of right subtree = 70, since 70 has no left). Copy 70's key into 50's node. Then delete 70 from right subtree — which is now a one-child or leaf case.

**Q [senior]: Why don't we always use a hash table instead of a BST?**

A: Hash tables lose three things: ordered traversal, range queries (`find all keys in [30, 70]`), and predictable iteration order. For "give me the next key after X," BSTs are O(log n); hash tables are O(n). For databases (B-tree index), filesystems (directory entries sorted), and any "sorted view" UI, ordered structures are correct.

```
┌── BST (ordered) ──────────┐    ┌── Hash table ─────────────┐
│  search:    O(log n)       │   │  search:    O(1) avg      │
│  ordered iter: O(n)       │    │  ordered iter: O(n log n) │
│  range query: O(log n + k)│    │  range query: O(n)        │
│  insert:    O(log n)       │   │  insert:    O(1) avg      │
└───────────────────────────┘    └───────────────────────────┘
```

**Q [arch]: At 10× scale (10M keys), does this unbalanced BST work?**

A: Only if keys arrive in random order. Adversarial input (already sorted) at 10M means O(n²) inserts = 10^14 ops, unusable. Mitigation is balancing — at 10M keys you want a red-black tree (logarithmic guaranteed) or a B-tree (better cache locality). The teaching visualizer demonstrates the unbalanced version; production code never ships unbalanced.

### The question candidates always dodge

**Q: Why does this codebase implement both `insert()` and `insert_iterative()`?**

A: Pedagogy. The recursive `insert` is the cleaner expression of the algorithm — three lines of "if smaller go left else go right" repeated. The iterative version is the same logic written without recursion, which matters for two reasons: (1) deep trees (degenerate sorted input) blow the call stack at ~10k depth in JS; the iterative form has no stack limit. (2) Production engineers should know how to convert recursion to iteration — it's a transferable skill that comes up in any system with recursion-depth limits. The cost is double maintenance burden.

```
┌── Recursive (cleaner) ────┐    ┌── Iterative (safer) ──────┐
│  3-line walk              │    │  ~15-line loop            │
│  Stack overflow risk      │    │  No stack limit           │
│  Teaches the structure    │    │  Teaches the technique    │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Left < node ≤ right at every subtree."
- "Inorder traversal = sorted output."
- "Unbalanced BST degenerates to O(n) on sorted input."
- "Production = red-black / AVL / B-tree, always balanced."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Insert `[10, 5, 15, 3, 7, 12, 20]` into an empty BST. Draw the result.

### Level 2 — Explain it out loud
"How do you delete a BST node that has two children?"

### Level 3 — Apply it to a new scenario
"If you insert `[1, 2, 3, 4, 5]` in order, what's the height of the resulting BST? What's the cost of searching for 5?"

### Level 4 — Defend the decision you'd change
"This BST isn't balanced. Should it be? What would change?"

### Quick check
- File? → `src/utils/data_structures/BinarySearchTree.ts`.
- Worst-case search? → O(n).
- Average search? → O(log n).

✓ Pass: all three.
