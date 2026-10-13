# Binary trees and BSTs

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/tree/bst.ts` - BST as a *kind* of binary tree (`drawds:tree-kind` style): in-order key placement,
  insert (path), delete (leaf / one child / two children: the successor node moves up, relinked as lecture 8b does, no key
  copied: 3.1 the successor is the right child, 3.2 it is deeper and its right subtree takes its place), violation check
  with ancestor bounds. Lecture 8: `measure.ts` (height with a leaf 0 or 1, count the leaves, size: post-order recursion
  from a node, the call stack as a strip, each node's answer badged as its call returns, the caption forming the sum or
  max; the code checks for null so a node with one child works), `search.ts`'s `bstExtreme` (min / max: hops counted)
  and `bstBuild` (the tree's keys inserted again sorted, a stick, or shuffled; BST Step by step, `shapeOperations`). The
  traversals, measures and min / max have code beside the tree (`src/shapes/tree/code.ts`; traversals in lecture 8's
  three-line form).
  `search.ts`: search as frames (curr walks down, each ruled-out subtree fades via `dim`). Invariant checks:
  BSTs and heaps ring offending elements in dashed red (`sceneWarnings` -> SceneSvg `warnings`, toggled by the
  `drawds:invariant` style, `src/cells/invariant-style.ts`; hidden while an operation is open).
- `src/shapes/tree/` - binary trees: nodes with `children: [left, right]` slots (null = empty), root first; layouts
  (trees and heaps) put the root at x = 0, so a tree that widens grows both ways and its root holds still on the page
  (the layout offset moves the shape), during an operation's steps too;
  `generate.ts` (random shapes by depth + fullness, growth-stable: existence depends only on seed + path, ids
  are `n` + path), `layout.ts` (contour-based tidy layout; a lone child offset `lone`, well under half the
  sibling spacing, so parentage stays unambiguous), `model.ts` (add child, remove subtree, swap children,
  mirror a subtree: plain trees' node menu, one undo step each). Show > Tree terms (lecture 8a; prop `terms` on trees
  and heaps; `terms.ts` pure): the root, internal nodes and leaves tinted red / blue / green (`termMarks` under any marks,
  as lecture 8 sorts them: the root apart), each node's height as a badge (`sceneBadges`; edges down, a leaf 0, the
  lecture's convention, the summary giving the levels count too), "depth d" left of each level, a legend above and a
  summary below (`termAnnotations` in the tree layout, keys `#depth:<d>`, `#legend:<term>`, `#terms-summary`, the
  root's place unchanged); pointing at a node lights its path from the root orange and its subtree's edges green
  (`pathAndSubtree`, via `hoverHighlights`). Tints and badges hide while an operation is open.
