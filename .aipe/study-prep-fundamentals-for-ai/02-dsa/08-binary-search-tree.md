# Binary search tree

**Industry name(s):** Binary search tree (BST), ordered binary tree
**Type:** Industry standard · Language-agnostic

> An ordered binary tree where every left descendant is smaller than its node and every right descendant is larger, so search, insert, and delete run in average O(log n). The `/trees/binary-search-tree` visualizer builds one and animates each operation.

**See also:** → [09-binary-heap.md](./09-binary-heap.md) · → [11-n-ary-tree-traversal.md](./11-n-ary-tree-traversal.md)

---

## Why care

You render a list of fifteen numbers — `[11, 7, 5, 3, 6, 9, 8, 10, 15, 13, 12, 14, 20, 18, 25]` — and the user types `13` in a search box. The naive answer is `array.find(n => n === 13)`, which scans every item until it hits one. Fifteen comparisons in the worst case. Now imagine the list is one hundred thousand items long and the user types a value that isn't there. `find` walks all hundred thousand. The shape of the data didn't help you skip anything.

That "skip anything" question is what a **binary search tree** answers. Not the tree the way a DOM tree is a tree — that one has no ordering. A BST has a single rule: for every node, everything in its left subtree is smaller, everything in its right subtree is larger. That rule turns a search into a sequence of "go left or go right" decisions instead of a linear walk.

**Why you need to answer that question at all:** because the substrate the visualizer renders is a plain array. The page at `src/app/trees/binary-search-tree/page.tsx` keeps `bstNodes` as a flat `number[]` for React state, but every operation — Insert, Search, Delete, Successor, Predecessor — routes through a `BinarySearchTree` instance built from that array. Without the BST, every operation is `array.indexOf` or `array.find`. With the BST, Search is a binary descent. Delete by value is a structural rewrite that preserves the ordering rule, instead of a linear `splice`.

Without a BST:
- Search 100k items → 100k comparisons in the worst case
- Find the next-larger value (`successor`) → sort the whole array, then index in
- Delete by value → linear scan, then shift everything down

With a BST:
- Search → ~17 comparisons (log2 100,000) in the average case
- Successor → walk right once, then leftmost descent
- Delete → at most O(log n) to find, then O(log n) to splice the successor in

A BST is what `.find()` would be if the array agreed to sort itself as you push into it — and gave you the next-larger value for free along the way.

---

## How it works

The data structure shape. Every node in `src/utils/data_structures/BinarySearchTree.ts` is a `BSTNode { key, left, right }` (L3–L13). The tree is a root pointer plus the recursive pointer mesh. There is no parent pointer — every operation either descends from the root or carries the parent in a local variable.

The actual data the visualizer puts in. The page boots with `[11, 7, 5, 3, 6, 9, 8, 10, 15, 13, 12, 14, 20, 18, 25]` and calls `bst.insert(val)` for each. The resulting tree:

```
              11
            /    \
           7      15
          / \    /  \
         5   9  13   20
        /\  /\  /\   /\
       3 6 8 10 12 14 18 25
```

Read left-to-right at any node: 7 < 11 < 15. 5 < 7 < 9. The rule holds everywhere.

### Bridge from frontend

A BST is the same shape you reach for when you want sorted insertion without sorting after every push. The closest frontend analogue is keeping a list of items sorted by some numeric field — score, timestamp, priority. With an array you either re-sort on every insert (`array.push(x); array.sort()` — O(n log n) per insert), or you binary-search the insertion point and `splice` (O(n) because `splice` shifts). A BST gives you O(log n) insertion without ever calling `.sort()` and without shifting array memory. The cost is that you can't `array[i]` your way to a node — you walk pointers.

### Insert — recursive and iterative, both shipped

The codebase keeps both forms side by side as a study aid. `insert` (L31–L57) is the recursive version. `insert_iterative` (L73–L104) is the loop form. Same algorithm, two shapes; the iterative version is what production code usually ships because there's no recursion stack to blow.

Recursive `insert(key)` pseudocode:

```
if root is null:
  root = new BSTNode(key)
  return

define insertNode(currentNode, newValue):
  if newValue < currentNode.key:
    if currentNode.left is null:
      currentNode.left = new BSTNode(newValue)
    else:
      insertNode(currentNode.left, newValue)
  else:
    if currentNode.right is null:
      currentNode.right = new BSTNode(newValue)
    else:
      insertNode(currentNode.right, newValue)

insertNode(root, key)
```

Execution trace — inserting `8` into the tree above:

```
Call: insertNode(node=11, newValue=8)
  8 < 11 → go left
  left is node=7 (not null) → recurse
Call: insertNode(node=7, newValue=8)
  8 >= 7 → go right
  right is node=9 (not null) → recurse
Call: insertNode(node=9, newValue=8)
  8 < 9 → go left
  left is null → set node.left = new BSTNode(8)
Done. Tree now has 8 hanging off the left of 9.
```

Complexity for insert (recursive or iterative):
- Average: O(log n) time · O(log n) auxiliary space for recursion stack
- Worst case: O(n) time · O(n) space — when the tree is skewed into a linked list

The iterative form trades the recursion stack for two pointers (`parent` and `current_node`, L79–L80) and a single while loop (L81–L88). Same complexity, no stack frames.

### Search — recursive descent

`search(key)` (L164–L197) is structurally identical to insert without the leaf-attaching step.

Pseudocode:

```
define searchNode(currentNode, key):
  if key < currentNode.key:
    if currentNode.left is not null:
      searchNode(currentNode.left, key)
  else if key > currentNode.key:
    if currentNode.right is not null:
      searchNode(currentNode.right, key)
  else:
    result = currentNode    # found
```

Execution trace — searching for `13`:

```
Call: searchNode(node=11, key=13)
  13 > 11 → go right (node=15)
Call: searchNode(node=15, key=13)
  13 < 15 → go left (node=13)
Call: searchNode(node=13, key=13)
  match → result = node=13
```

Three comparisons for a fifteen-node tree. A linear `array.find` for `13` in the source array `[11, 7, 5, 3, 6, 9, 8, 10, 15, 13, 12, 14, 20, 18, 25]` would take ten.

Complexity: O(log n) average · O(n) worst case.

### Delete — the structurally interesting one

Delete (L245–L282) is where BSTs earn their reputation. Three cases:

```
Case 1 — node is a leaf:
  Just unlink it from its parent. No subtree to repair.

Case 2 — node has one child:
  Link the parent directly to that one child. The child's
  subtree was already valid by the BST rule, so no rewrite.

Case 3 — node has two children:
  Find the inorder successor (the leftmost node of the right
  subtree). Copy its key into the node being deleted. Then
  delete the successor from the right subtree (which is now
  case 1 or 2 — the successor has no left child by definition).
```

Execution trace — deleting `15` from the tree above:

```
Call: deleteNode(root=11, key=15)
  15 > 11 → root.right = deleteNode(node=15, 15)

Call: deleteNode(node=15, key=15)
  match → two children (13 and 20)
  successor = min of right subtree = leftmost of node=20 = node=18
  copy successor.key into node: node.key = 18
  delete the original 18 from the right subtree:
    node.right = deleteNode(node=20, key=18)

Call: deleteNode(node=20, key=18)
  18 < 20 → node.left = deleteNode(node=18, 18)

Call: deleteNode(node=18, key=18)
  match → no children (leaf)
  return null

Back-propagation:
  node=20.left = null
  node=15 (now holding key=18).right = node=20
  root.right = node=15 (now key=18)

Tree now:
              11
            /    \
           7      18      ← was 15, now holds 18's key
          ...    /  \
                13   20
                /\    \
               12 14   25
```

The page-level code at `src/app/trees/binary-search-tree/page.tsx` L71–L98 has a parallel rewrite of `bstNodes` (the React array) so the visualizer stays in sync — it swaps `15` with its successor in the array, then `splice`s the successor out.

The iterative version (`delete_iterative`, L291–L382) is the same logic with explicit `prev` and `child` pointers and a single while loop. Same three cases, same complexity.

Complexity for delete: O(log n) average · O(n) worst case.

### Traversals — preorder, inorder, postorder

Three depth-first orders. All run in O(n) time and O(h) space where h is tree height. The page exposes all three as buttons.

```
preOrder (L390–L404):   visit node → recurse left → recurse right
                        Tree above → [11, 7, 5, 3, 6, 9, 8, 10, 15, 13, 12, 14, 20, 18, 25]
                        Output IS the construction order — useful for serializing.

inOrder  (L442–L456):   recurse left → visit node → recurse right
                        Tree above → [3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 25]
                        Output is SORTED. This is the free win — a BST gives you a
                        sorted iteration with no Array.prototype.sort() call.

postOrder (L464–L478):  recurse left → recurse right → visit node
                        Tree above → [3, 6, 5, 8, 10, 9, 7, 12, 14, 13, 18, 25, 20, 15, 11]
                        Children before parents — useful for tree-rewrite passes.
```

Level-order (breadth-first traversal) is NOT in `BinarySearchTree.ts`. It would use a queue: push root, while queue non-empty pop a node, push children, visit. The `CompleteBinaryTree` class in `BinaryHeap.ts` (L296–L321) does the inverse — it builds a tree from a level-order array. Same shape, opposite direction.

### Brute force vs optimal — Search

── Brute force ──────────────────────────────────

Pseudocode (linear scan on the source array):

```
for i = 0 to arr.length - 1:
  if arr[i] === target:
    return arr[i]
return null
```

Execution trace — searching `[11, 7, 5, 3, 6, 9, 8, 10, 15, 13, 12, 14, 20, 18, 25]` for `13`:

```
i=0: 11 !== 13
i=1:  7 !== 13
i=2:  5 !== 13
i=3:  3 !== 13
i=4:  6 !== 13
i=5:  9 !== 13
i=6:  8 !== 13
i=7: 10 !== 13
i=8: 15 !== 13
i=9: 13 === 13 → return
```

Ten comparisons.

Complexity: O(n) time · O(1) space.

What goes wrong at scale: with one million items, this runs up to one million comparisons per search. If the search bar fires on every keystroke, that's one million comparisons per character typed.

── Optimal ──────────────────────────────────────

The insight: the array already reads sorted when you traverse the BST in order. The structure carries the ordering. Use it.

Pseudocode (BST search):

```
current = root
while current is not null:
  if key < current.key:    current = current.left
  else if key > current.key: current = current.right
  else:                     return current
return null
```

Execution trace — same target `13`, same data, BST search:

```
current = node(11): 13 > 11 → go right
current = node(15): 13 < 15 → go left
current = node(13): match → return
```

Three comparisons.

Complexity: O(log n) average · O(n) worst case · O(1) iterative space.

Why it's faster: every comparison eliminates half the remaining tree from consideration. After three comparisons, the BST has narrowed fifteen possibilities down to one. Linear scan eliminates one possibility per comparison.

── Comparison ───────────────────────────────────

```
┌─────────────────┬────────────────┬──────────────────┐
│                 │ Linear scan    │ BST search       │
├─────────────────┼────────────────┼──────────────────┤
│ Time (avg)      │ O(n)           │ O(log n)         │
│ Time (worst)    │ O(n)           │ O(n) if skewed   │
│ Space           │ O(1)           │ O(1) iterative   │
│ Build cost      │ O(0) — array   │ O(n log n) avg   │
│                 │ is already     │ to build the     │
│                 │ there          │ tree once        │
│ At 100 items    │ ~50 ops avg    │ ~7 ops           │
│ At 100k items   │ ~50k ops avg   │ ~17 ops          │
│ Sorted output?  │ no (sort first)│ yes (inorder)    │
└─────────────────┴────────────────┴──────────────────┘
```

When brute force is fine: when n is small (say under 50), when the data is unsorted and only searched once or twice, or when you don't need successor / predecessor / sorted iteration. The BST's build cost (O(n log n) average for n inserts) pays off only when you do many searches against the same dataset.

---

## Binary search tree — diagram

```
                    root: 11
                   ╱        ╲
              left(<11)   right(>11)
                  │           │
                  ▼           ▼
            ┌────────┐  ┌────────┐
            │ node:7 │  │node:15 │
            └────────┘  └────────┘
              ╱    ╲      ╱    ╲
          ┌───┐  ┌───┐ ┌───┐ ┌───┐
          │ 5 │  │ 9 │ │13 │ │20 │
          └───┘  └───┘ └───┘ └───┘
           ╱╲    ╱  ╲   ╱╲    ╱╲
          3  6  8   10 12 14 18 25

BST invariant at every node N:
  every key in left subtree  <  N.key
  every key in right subtree >  N.key

Operations route by comparison:
  Insert(key):  descend; create at first null pointer
  Search(key):  descend; return node when key matches
  Delete(key):  find; rewrite — leaf / one-child / two-child cases

Depth-first traversals walk the same tree, three visit orders:
  preOrder  [11, 7, 5, 3, 6, 9, 8, 10, 15, 13, 12, 14, 20, 18, 25]
  inOrder   [ 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 25] ← sorted
  postOrder [ 3, 6, 5, 8, 10, 9, 7, 12, 14, 13, 18, 25, 20, 15, 11]
```

The structure above is balanced because the source array `[11, 7, 5, 3, 6, 9, 8, 10, 15, ...]` happens to insert in an order that keeps left and right subtrees similar in size. If you instead inserted `[1, 2, 3, 4, 5, 6, 7]`, every node would have only a right child — the tree degenerates into a linked list, and every operation becomes O(n).

---

## In this codebase

**File:** `src/utils/data_structures/BinarySearchTree.ts`
**Class:** `BinarySearchTree`
**Used by:** `src/app/trees/binary-search-tree/page.tsx`

Key line ranges inside `BinarySearchTree.ts`:

- `BSTNode` definition: L3–L13
- `insert` (recursive): L31–L57
- `insert_iterative`: L73–L104
- `max` / `min`: L121–L153
- `search` (recursive): L164–L197
- `successor` / `predecessor`: L213–L235
- `delete` (recursive): L245–L282
- `delete_iterative`: L291–L382
- `preOrder`: L390–L404
- `preOrder_iterative`: L413–L433
- `inOrder`: L442–L456
- `postOrder`: L464–L478
- `postOrder_iterative`: L490–L505

The page (`src/app/trees/binary-search-tree/page.tsx`):

- `buildDefaultBst` L21–L25: walks the React array and inserts each value
- `insertNode` L49–L59: updates React state, calls `animateHighlight`
- `deleteNode` L71–L98: deletes from BST AND parallel-updates the React array
- `preOrderTraversal` / `inOrderTraversal` / `postOrderTraversal` L120–L130: call the BST method, pipe the result into `animateHighlight` which steps through the array with `delayLoop`

The duplication of recursive and iterative variants for `insert`, `delete`, `preOrder`, `postOrder` is deliberate. The file is a study notebook — the page only calls the recursive variants, but both shapes are kept side by side so a reader (the project owner, preparing for interviews) can compare them directly.

---

## Elaborate

### Where this pattern comes from

The binary search tree was formalized in the early 1960s as the in-memory analogue of binary search over a sorted array — same O(log n) lookup, but with O(log n) insertion and deletion instead of O(n) array shifts. The catch was always the skew failure mode: a BST built from already-sorted input degrades to a linked list. The fix — self-balancing trees like AVL (1962) and Red-Black (1972) — is what production databases and language standard libraries (Java's `TreeMap`, C++'s `std::map`) actually ship.

### The deeper principle

Order as a structural invariant. The same data can sit in a flat array, a hash map, or a BST. Each shape makes different operations cheap. The BST chooses to encode the sort order in the structure itself, which means inorder iteration is sorted for free — but it also means every mutation must preserve the invariant. The general lesson: structure isn't decoration; it's a contract that makes certain operations cheap by design.

### Where this breaks down

A plain BST breaks down the moment input arrives in sorted (or reverse-sorted) order. Every insert lands on the same side and the tree skews — search becomes O(n). Self-balancing variants (AVL, Red-Black) add rotation steps to insert and delete to keep height bounded at O(log n). The codebase ships an unbalanced BST because the visualizer uses a fixed, hand-picked input array that happens to balance; in production code you'd reach for the standard library's balanced map.

It also breaks down when the workload is pure lookups by key (no successor, no sorted iteration). A hash map gives O(1) average lookup and beats a BST every time on that axis — the BST's value is the ordering, and if you're not using the ordering, you're paying for it without collecting.

### What to explore next

- Self-balancing trees (AVL, Red-Black) → how rotations keep the tree's height bounded at O(log n)
- B-trees → the disk-oriented generalization that every relational database index is built on
- Inorder threaded trees → a variant that turns inorder traversal into O(1) per step without recursion

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬─────────────────────┬──────────────────────┐
│ Cost dimension   │ BST (this codebase) │ Plain sorted array   │
├──────────────────┼─────────────────────┼──────────────────────┤
│ Search           │ O(log n) avg        │ O(log n) binary scan │
│ Insert           │ O(log n) avg        │ O(n) (shift on splice)│
│ Delete           │ O(log n) avg        │ O(n) (shift on splice)│
│ Sorted iteration │ inorder, O(n)       │ already sorted, O(n) │
│ Memory overhead  │ 2 pointers per node │ none beyond values   │
│ Skew failure     │ degrades to O(n)    │ none                 │
│ Cache locality   │ poor (pointer hops) │ excellent (contig.)  │
│ Implementation   │ 500+ lines for full │ ~10 lines for binary │
│                  │ operation set       │ search + splice      │
└──────────────────┴─────────────────────┴──────────────────────┘
```

### Sub-block 1 — what we gave up

**Cache locality.** Each `BSTNode` is a heap allocation; `node.left` and `node.right` point to arbitrary places in memory. A modern CPU can scan a sorted array of integers at memory bandwidth — gigabytes per second — because every next element is in the same cache line. A BST descent hops through pointers, and each hop is a potential cache miss. For small n (under a few thousand) the array wins on raw speed even though it's algorithmically worse.

**Memory overhead.** A `BSTNode` carries two pointers plus the key. On a 64-bit system that's 24 bytes per node minimum. A plain `number[]` is 8 bytes per element. For 100k integers that's 2.4MB vs 800KB.

**Skew failure mode.** The unbalanced BST shipped in `BinarySearchTree.ts` degenerates to a linked list under sorted input. There's no rebalancing pass. If a user fed in `[1,2,3,4,5,6,7,8,9,10]` via the Insert button, the tree would be a right-leaning spine and every subsequent operation would be linear time. The visualizer doesn't trigger this because the seed array is hand-picked to balance, but the failure is one input list away.

### Sub-block 2 — what the alternative would have cost

If the codebase used a sorted array with `Array.prototype.indexOf` (linear scan) or hand-rolled binary search, the cost would have been operation flexibility. Inserts and deletes that maintain sorted order need O(n) array shifts on every mutation. The visualizer animates each step at one-second intervals, so the user wouldn't notice the algorithmic difference at n=15 — but they would notice that successor/predecessor and structural traversal questions become awkward to express. The BST treats those as one-line walks; the array would need explicit index tracking and a re-sort guarantee around every mutation.

If the codebase used a hash map (`Map<number, BSTNode>` or just `Set<number>`), search becomes O(1) and you lose ordering entirely. Successor, predecessor, and inorder iteration would need a separate sorted data structure beside the hash — two structures kept in sync, with twice the bug surface. The BST is the single structure that answers all five questions (search, insert, delete, sorted iteration, successor) at the same complexity tier.

### Sub-block 3 — the breakpoint

Fine as an unbalanced BST until the input distribution stops being random. The moment user-driven inserts arrive in sorted or near-sorted order, the tree skews and operations degrade to O(n). At that breakpoint, swap in a self-balancing implementation (Red-Black via a library like `@datastructures-js/binary-search-tree`, or a hand-rolled AVL). The page-level code wouldn't change — only the constructor and method bindings on the `BinarySearchTree` instance.

### Sub-block 4 — what wasn't actually a tradeoff

Using a self-balancing tree (AVL, Red-Black) wasn't a real alternative for the *study notebook* version of this file. The point of the file is for the project owner to dry-run each operation by hand and compare recursive vs iterative forms. A balanced tree adds rotation logic — left rotation, right rotation, recoloring — that obscures the core BST operations. Once those are internalized, the next step is a balanced variant; until then, the unbalanced form is the right teaching surface.

---

## Tech reference (industry pairing)

### TypeScript with `any` (no generics)

- **Codebase uses:** `class BSTNode { key: any; left: any; right: any }` and `class BinarySearchTree { root: any }`. The file opens with `/* eslint-disable @typescript-eslint/no-explicit-any */`.
- **Why it's here:** the study notebook accepts both numbers and strings as keys (Insert button parses to int, but `key === ""` is checked alongside `key === null`), so the simplest typing is `any`. Generics would force the page to commit to one key type.
- **Leading today:** TypeScript generics (`BSTNode<K extends Comparable>`) — adoption-leading, 2026.
- **Why it leads:** type-safe comparisons at every operation site; the compiler catches the bug where you compare a string-key node against a number-key search target.
- **Runner-up:** Flow / JSDoc-typed JS — adoption-trailing now; still used where TS migration cost is prohibitive.

### Self-balancing tree libraries (not used, but the natural upgrade)

- **Codebase uses:** none. The BST is unbalanced and hand-written.
- **Why it's here:** the failure mode (skew on sorted input) is a real interview question and the unbalanced form is the surface to study before reaching for a library.
- **Leading today:** `@datastructures-js/binary-search-tree` (Red-Black under the hood) — adoption-leading among TS-friendly options, 2026.
- **Why it leads:** typed API, zero dependencies, AVL-or-RBT variants in the same package, drop-in replacement for a hand-rolled BST.
- **Runner-up:** `js-sdsl` — innovation-leading for users who want C++-STL-shaped containers (`OrderedSet`, `OrderedMap`) with iterator semantics.

---

## Summary

A binary search tree is the data structure that turns "find by key" from a linear scan into a sequence of left-or-right decisions, by encoding the sort order as a structural invariant — every left descendant is smaller, every right descendant is larger. In this codebase, `src/utils/data_structures/BinarySearchTree.ts` ships an unbalanced BST with recursive and iterative variants of insert, search, and delete side by side, and the `/trees/binary-search-tree` page animates each operation against a hand-picked fifteen-node tree. The constraint that made an unbalanced tree the right call was teaching surface, not production load: the file is a study notebook and rotations would obscure the core operations. The cost paid is the skew failure mode — sorted input degrades every operation to O(n), and there's no rebalancing pass to recover.

Key points to remember:

- BST invariant: every left descendant < node < every right descendant; the rule holds at every node, not just the root.
- Search, insert, and delete are all O(log n) average and O(n) worst case (skewed tree).
- Inorder traversal of a BST is sorted iteration for free — no `Array.prototype.sort()` call needed.
- Delete has three cases: leaf (unlink), one child (relink to child), two children (copy inorder successor's key, then delete successor — which is always case 1 or 2).
- The codebase ships both recursive and iterative variants of insert, delete, preOrder, and postOrder so each operation can be dry-run side by side; the page only calls the recursive ones.
- An unbalanced BST is fine while inputs are random; a balanced variant (AVL, Red-Black) becomes necessary once inserts arrive in sorted order.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about a BST, they aren't asking you to recite the definition. They're asking: do you know when it earns its place over a hash map (which is faster for lookups) and a sorted array (which is faster for sequential reads)? The answer they want is a decision: what does ordering give me that those don't, and what's the cost of preserving it across mutations?

### Likely questions

[mid] Q: Walk me through how delete works when the node has two children.

A: Find the inorder successor — the leftmost node of the right subtree. Copy the successor's key into the node being deleted, then delete the successor from the right subtree. The successor is guaranteed to have no left child by construction (it's the leftmost), so its deletion falls back to the leaf or one-child case. In this codebase that's `BinarySearchTree.ts` L273–L275: `const successor = this.min(root.right); root.key = successor.key; root.right = deleteNode(root.right, successor.key)`.

Diagram:
```
Before deleting 15 (two children: 13 and 20)

         15
        ╱  ╲
       13   20
       /\    \
      12 14  25  (no left child on 20 — wait, what about 18?)

Actually:    20
            ╱  ╲
           18   25         ← 18 is leftmost of right subtree
                                = successor of 15

After delete:
         18              ← copied successor's key
        ╱  ╲
       13   20            ← recurse: delete 18 from right subtree
       /\    \
      12 14   25
```

[senior] Q: Why didn't you use a hash map for this?

A: A hash map gives O(1) average lookup, which beats the BST's O(log n). But the page exposes successor, predecessor, and three traversals — operations that depend on sort order. A hash map answers "is this key here?" but not "what's the next-larger key?" or "give me every key in order." The BST answers all five at the same O(log n) or O(n) tier with one structure. A hash map would mean two structures kept in sync, doubling the mutation surface.

Diagram:
```
What each structure makes cheap:

                 │ Hash map  │ BST       │ Sorted array  │
─────────────────┼───────────┼───────────┼───────────────┤
 search by key   │ O(1)      │ O(log n)  │ O(log n)      │
 insert          │ O(1)      │ O(log n)  │ O(n)          │
 delete          │ O(1)      │ O(log n)  │ O(n)          │
 successor       │ O(n)      │ O(log n)  │ O(log n)      │
 sorted iterate  │ O(n log n)│ O(n)      │ O(n)          │
```

[arch] Q: This tree degenerates if I insert sorted numbers. How would you fix that at scale?

A: Three options, ranked by effort. First, swap the unbalanced BST for a Red-Black tree — same interface, every mutation triggers a rotation pass to keep height O(log n). Second, use the standard library's `Map` plus a separate sorted index (e.g. a skip list) for the order-dependent operations. Third, if the workload is read-heavy and writes batch nicely, sort the input once on bulk insert and use binary search on the resulting array. The codebase ships option-zero (unbalanced) because the input is hand-picked to balance; in production I'd reach for option one and avoid the failure mode entirely.

Diagram:
```
Skew failure under sorted input [1, 2, 3, 4, 5]:

   1
    ╲
     2
      ╲
       3
        ╲
         4
          ╲
           5

Every operation is now O(n). Red-Black fix at insert:

After inserting 1, 2, 3 (rotation triggers at 3):
       2
      ╱ ╲
     1   3

Inserting 4, 5 stays balanced via rotations.
Height stays at ~log₂(n) = ~3 for 5 nodes.
```

### The question candidates always dodge

Q: You said inorder is "sorted for free." But you had to build the tree first — wasn't that already O(n log n)? So where's the win over `arr.sort()`?

A: Honest answer: if you sort once and read many times, `arr.sort()` is the right call. The BST's win is on mixed workloads — you insert, delete, insert again, then ask for the sorted order. `arr.sort()` is O(n log n) every time the array changes; the BST amortizes the sort cost across inserts at O(log n) each. For a fifteen-item tree in a visualizer where the user mutates one item at a time and then asks for inorder, the BST wins. For "load a million items, sort once, never mutate," the array-and-sort wins by a wide margin because the BST's pointer-chasing kills cache locality. I picked the BST here because the page IS the mutate-then-iterate workload — Insert, Delete, then Traversals. The win comes from the mixed access pattern, not from sortedness in isolation.

Diagram:
```
Cost ledger over k mutations + 1 traversal:

                    │ BST            │ Array.sort()    │
────────────────────┼────────────────┼─────────────────┤
 build (k inserts)  │ O(k log k)     │ O(k) push       │
 k more mutations   │ O(k log n) tot │ O(k · n log n)  │
 inorder/sorted     │ O(n)           │ O(n log n) sort │
                    │                │ + O(n) read     │
 total              │ O(k log n)     │ O(k · n log n)  │

BST wins when k (mutations) is large relative to traversals.
Array wins when k=0 (immutable) or traversals are rare.
```

### One-line anchors

- "A BST is the structure that makes successor and sorted iteration cheap; if you don't need either, you don't need a BST."
- "Inorder traversal is sorted iteration without calling `.sort()` — that's the load-bearing feature."
- "Unbalanced BSTs work until the input arrives sorted; then they're linked lists with extra pointers."
- "Hash map for lookups, BST for ordered queries — pick the one whose strengths match the access pattern."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On paper, draw the tree built by inserting `[11, 7, 5, 3, 6, 9, 8, 10, 15, 13, 12, 14, 20, 18, 25]` in order. Label every node. Mark which subtrees contain values less than each parent and which contain values greater.

Open the file. Compare against the diagram above.

Pass: your tree matches the structure and every node has its left/right children correctly placed.
Fail: re-read the How it works section, focus on the insert pseudocode, and try again.

### Level 2 — Explain it out loud

Explain `delete` to a colleague who knows BSTs exist but has never implemented one. No notes. Under 90 seconds.

Checkpoints:
- Did you name all three cases (leaf, one child, two children)?
- Did you explain why the two-children case copies the successor's key instead of moving the successor as a node?
- Did you reference `BinarySearchTree.ts` L245–L282?

### Level 3 — Apply it to a new scenario

You receive a bug report: "the visualizer freezes when I insert numbers `1, 2, 3, 4, ..., 100` in order." Walk through what's happening structurally, and name two ways to fix it. Then open `BinarySearchTree.ts` L31–L57 and check whether the recursive insert would actually freeze (stack overflow) at n=100, or just become very slow.

Write your answer. 3–5 sentences minimum.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff: the codebase ships an unbalanced BST.

"If you were building this visualizer from scratch with the same teaching goal, would you still ship an unbalanced tree? Why or why not? If you'd change it, what would you do instead and what would that cost — to the user, to the file's length, to the readability of the operations?"

Reference `BinarySearchTree.ts` (the unbalanced shape) and name what would change if you added rotation passes (which operations grow new code paths; how the file's length doubles or triples).

### Quick check — code reference test

Without opening any files:
- What file does the BST class live in?
- What's the recursive `delete` function called inside `delete()`?
- Approximately what line range is `inOrder` traversal at?

Open the file and verify.

Pass: you named the file (`BinarySearchTree.ts`) and the inner function (`deleteNode`).
Fail on lines: that's fine — file and function are what matter.
