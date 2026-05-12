# N-ary tree

**Industry name(s):** N-ary tree, generic tree, rose tree
**Type:** Industry standard · Language-agnostic

> A tree where each node has an arbitrary list of children, used here to render Fibonacci callstack and backtracking trees in `CallstackVisualizer`.

**See also:** → [07-binary-search-tree](./07-binary-search-tree.md) · → [16-fibonacci-recursion](./16-fibonacci-recursion.md) · → [17-count-all-subsets-backtracking](./17-count-all-subsets-backtracking.md)

---

## Why care

A binary tree is a special case where every node has ≤ 2 children. Real-world trees often need more: a file-system directory holds N files, a JSON object holds N keys, a recursion callstack branches into N recursive calls. For all of those, you reach for an n-ary tree.

The pattern shows up wherever hierarchy is open-ended: DOM trees (each element has N children), JSON ASTs, scene graphs in games, recursive-call traces. The N-ary tree here exists primarily to visualise *recursion shape* — every recursive call becomes a child node.

---

## How it works

Picture a family tree where each person can have any number of children. To walk the family, recursively visit each person, then recurse into their children. That's preorder traversal of an n-ary tree.

### The shape

```
// src/utils/data_structures/Tree.ts:8-30
class TreeNode {
  key: any;
  value: any;
  parent: TreeNode | null;
  desc: string | null;
  children: TreeNode[];
}

class Tree {
  root: TreeNode;
  preOrderTraversal(node = this.root)*  // generator function
  postOrderTraversal(node = this.root)*
  insert(parentNodeKey, key, value, desc): boolean
  remove(key): boolean
  find(key): TreeNode | undefined
}
```

The `*` denotes a generator — JavaScript's `function* () { yield ... }` syntax. `preOrderTraversal` yields nodes in DFS preorder; consumers can iterate with `for...of`.

### Operations

```
┌────────────┬──────────────┐
│ Operation  │ Time         │
├────────────┼──────────────┤
│ insert     │ O(n) (find)  │
│ find       │ O(n)         │
│ remove     │ O(n)         │
│ traversal  │ O(n)         │
└────────────┴──────────────┘
```

Why all O(n)? No ordering invariant — `find(key)` has to walk the whole tree until it hits the key. A keyed tree (like a BST) would be O(log n) average; this tree is for visualisation, not lookup.

### Trace: building a Fibonacci(5) callstack

```
// src/app/recursions/fibonacci-numbers/page.tsx logic:
function bottom_up_fib(n, b1=0, b2=1):
  // insert a tree node representing this call
  tree.insert(parent, n, ..., desc=`fn(${n-1}, ${b1}, ${b1+b2})`)
  if n == 0: return b1
  else: return bottom_up_fib(n-1, b2, b1+b2)

Fibonacci(5):
  fn(5, 0, 1)  → tree root
    fn(4, 1, 1)
      fn(3, 1, 2)
        fn(2, 2, 3)
          fn(1, 3, 5)
            fn(0, 5, 8)   → returns 5
```

This is a linear chain (tail recursion), not branching — Fibonacci's straight-line form. For `count-all-subsets`, the tree branches at every level (include / exclude).

### Subset-tree shape (count_all_subsets)

```
                  [start]
                 /        \
            [include 1]  [exclude 1]
            /      \      /        \
         [+2]    [-2]   [+2]      [-2]
         / \     / \    / \       / \
       [+3][-3][+3][-3][+3][-3][+3][-3]
```

At depth `n`, there are 2^n leaves — each a unique subset.

### Rendering the tree in `CallstackVisualizer`

The `CallstackVisualizer` component recursively walks the tree and builds nested HTML lists:

```
const renderNode = (nodes) => {
  let html = ``;
  for (let i = 0; i < nodes.length; i++) {
    html += `<li><div class="node">${node.key} ↓</div>`;
    if (node.children.length) html += `<ul>${renderNode(node.children)}</ul>`;
    html += `</li>`;
  }
  return html;
};
```

The recursive HTML mirrors the recursive tree. CSS adds the visual tree-branch lines.

### The principle

This is what people mean by *recursive data structures*. A tree is "a node + a list of trees" — the definition is itself recursive, which means traversal and rendering also recurse naturally. Same idea behind ASTs, JSX trees, DOM trees, and every hierarchical document format ever.

The full picture is below.

---

## N-ary tree — diagram

```
                    [root]
                    /  |  \
                   /   |   \
                ┌─ child1, child2, child3
                │     /  \         |
                ▼  [c1a][c1b]    [c3a]
                       /
                    [c1b1]

  Each node: { key, value, parent, desc, children: [] }
  children is a list — arbitrary length.

  preOrderTraversal:  root, child1, c1a, c1b, c1b1, child2, child3, c3a
  postOrderTraversal: c1a, c1b1, c1b, child1, child2, c3a, child3, root
```

---

## In this codebase

**Class:** `src/utils/data_structures/Tree.ts` L1–L89.
**Used by:** `CallstackVisualizer` rendering, Fibonacci page, count-all-subsets page, n-choose-k page.

GitHub: `[Tree.ts](https://github.com/rlynjb/reincodes/blob/main/src/utils/data_structures/Tree.ts)`.

---

## Elaborate

### Where this pattern comes from
N-ary trees go back to the earliest data-structure literature. The "rose tree" name comes from Haskell's `Data.Tree` (1990s) where children are a `List a`.

### The deeper principle
*Recursion fits recursive data.* When the data structure is self-referential, the algorithms that consume it are too — and the code becomes as short as the math.

### Where this breaks down
- O(n) lookup: no ordering invariant means searching is linear.
- Deep trees blow the call stack in recursive traversals (~10k depth in JS).
- Mutation during traversal is hazardous — use generators carefully.

### What to explore next
- [07-binary-search-tree](./07-binary-search-tree.md) — ordered variant for lookup.
- [16-fibonacci-recursion](./16-fibonacci-recursion.md) — what gets visualised here.
- [17-count-all-subsets-backtracking](./17-count-all-subsets-backtracking.md) — branching n-ary tree.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ N-ary tree               │ Binary tree              │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Children/node    │ Arbitrary list           │ Exactly 2 (or null)      │
│ Storage          │ Array of children        │ Two pointers             │
│ Suits            │ Open-ended hierarchies   │ Fixed-arity (BST, heap)  │
│ Memory per node  │ Pointer + array overhead │ Two pointers             │
│ Traversal        │ For-each child           │ left, right branches     │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Compact storage. Each n-ary node carries a `children: []` allocation in addition to its data. Binary trees carry exactly two pointer fields per node, regardless of whether they're filled.

Ordered traversal guarantees. With no ordering invariant, preorder and postorder are the only traversals that mean anything; you can't do "inorder" on n>2 children consistently.

### What the alternative would have cost

If we'd used a binary tree to represent the fibonacci callstack, we couldn't capture branching recursion at all — multi-way calls would need encoding tricks (left = first call, right = "rest" as a chain). N-ary maps the recursion structure directly.

### The breakpoint

Fine for visualisation. For actual data storage with millions of items, you'd want something with an ordering invariant or a structural property (BST, B-tree, trie).

---

## Tech reference (industry pairing)

### N-ary tree + generators

- **Codebase uses:** TypeScript `class Tree` with `function*` generators for traversal.
- **Why it's here:** `CallstackVisualizer` needs to iterate every node; generators give clean `for...of` syntax.
- **Leading today:** Generator-based traversal — `adoption-leading` for tree iteration since ES2015, 2026.
- **Why it leads:** lazy, composable, plays well with async, matches the recursive structure.

---

## Summary

### Part 1 — concept recap

An n-ary tree is a tree where each node holds an arbitrary list of children. reincodes uses one in `Tree.ts` to model recursive call trees (Fibonacci, count-all-subsets, n-choose-k), rendered by `CallstackVisualizer` as nested HTML lists. The constraint that earns its place is "recursion can branch arbitrarily," and the cost paid is O(n) for any lookup — there's no ordering to exploit.

### Part 2 — key points to remember

- Each node holds `children: TreeNode[]` — arbitrary length.
- O(n) lookup, insert, remove — no ordering.
- Preorder traversal mirrors the recursion call order.
- Renders directly to nested HTML lists via recursive component.
- The cost is no fast lookup; the benefit is direct modelling of branching recursion.

---

## Interview defense

### What an interviewer is really asking

When someone asks about n-ary trees, they want you to articulate the difference from binary trees and name a use case where n-ary is correct. "DOM tree" or "JSON AST" are the right answers.

### Likely questions

**Q [mid]: Walk through a preorder traversal of a 3-level n-ary tree.**

A: Visit the root; then for each child (left-to-right), recursively preorder-traverse that subtree. Result: root, child1, c1's children, child2, c2's children, etc. The order matches the recursion call order — exactly why this codebase uses it for callstack visualisation.

**Q [senior]: Why not use an adjacency list instead?**

A: An adjacency list of `{node: children[]}` is exactly what this n-ary tree is, just spread across a hash map vs nested in the structure. For tree shapes (every node has at most one parent), the embedded form is more cache-friendly and matches the recursion structure 1:1. For general graphs (multiple parents, cycles), adjacency list is the right shape.

```
┌── N-ary tree (here) ──────┐    ┌── Adjacency list ─────────┐
│  {key, children: [...]}   │    │  {node: [neighbours]}     │
│  Embedded                 │    │  Flat hash map            │
│  Trees only               │    │  Any graph                │
│  Easy traversal           │    │  Easy edge add/remove     │
└───────────────────────────┘    └───────────────────────────┘
```

### One-line anchors

- "Each node has a list of children."
- "Recursive structure fits recursive algorithms."
- "O(n) lookup — no ordering invariant."
- "Renders to nested HTML lists directly."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw a 3-level n-ary tree with at least 3 children at the root and a varying number at each subsequent level.

### Level 2 — Explain it out loud
"Why is Fibonacci(5)'s call tree linear instead of branching?"

### Level 3 — Apply it to a new scenario
"Render a JSON object as a tree. What do you map to keys, values, and children?"

### Level 4 — Defend the decision you'd change
"Would you use this Tree class to model a file system?"

### Quick check
- File? → `src/utils/data_structures/Tree.ts`.
- Children shape? → `TreeNode[]`.
- Traversal methods? → `preOrderTraversal`, `postOrderTraversal`.

✓ Pass: all three.
