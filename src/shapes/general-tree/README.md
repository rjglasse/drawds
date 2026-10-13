# General trees

How this part of drawds works, for whoever changes it. CLAUDE.md keeps a line on it in its map; the detail is
here, next to the code: keep it up to date with the code (dds-c72.20 moved it here from CLAUDE.md).

- `src/shapes/general-tree/` - general trees (dds-55z.17.4; lecture 8a's "any number of children, like a file system";
  Shift+K): a binary tree's `TreeNode`s, children in order with no empty slots, so `levelOrder`, `subtreeIds`,
  `parentOf`, `treeTerms` and the terms' annotations work on them as they are. The binary tree's gesture (down for
  levels, lean for fullness) with style `drawds:tree-arity` 3-6, the most children a node gets when sketched
  (`generate.ts`: slots per node, the seeded spine in slots 0-2 so a higher arity only adds children; `maxDepth`
  keeps a perfect tree to 64 leaves); the shape keeps the drag (`depth`, `fullness`), so picking another arity with
  it selected sketches it again (`withArity`: sketched nodes keep their values, hand-added ones go). A + on a node's
  lower right adds a last child (`slotButton`, overriding the binary corners), x removes a subtree, the node menu
  moves a node left / right among its siblings; pre-, post- and level order (`traverseTree`'s `general`: each call
  from a loop over the children, code `general-tree-<order>`, `child` named) and height / leaves / size
  (`measureTree`'s `general`: a leaf's loop never runs, so h starts at -1 or 0 and s at 1; a parent's return
  combines all its children, `1 + max(1, 0, 2)`; code `general-tree-<measure>`); Show > Tree terms. Step by step >
  As a binary tree (`lcrs.ts`, Knuth's left child, right sibling): node by node in level order, the first child's
  edge kept green (its left), the others' fading out and an orange arrow from each child to the next (its right,
  scene edges `sib:<a>-><b>`), then `leftChildRightSibling` (pure, binary path ids) as a binary tree beside it
  (`onCommit`, the result's undo step; placed past `MIN_BAR_WIDTH` so the bar keeps its place; the bar keeps clear
  of what a result made, `PlaybackView.made` in `besideBoxes`). Its pre-order is the general tree's, its in-order
  the general tree's post-order (tested). Binary trees and heaps widen long values into stadiums too (`nodeSize`). `layout.ts`: contour
  tidy layout for any number of children, siblings packed from the left and from the right and averaged (a small
  subtree between big ones sits midway), a lone child right under its parent. A value longer than 3 characters
  widens its node into a stadium (still kind `circle`, w > h: `roundEnds` in geometry.ts; drawn, hit, clipped,
  outlined and edited round at the ends), its text at `fontScale` (a 3-character value's size). Code beside it
  (`src/transcript/general-tree-moves.ts`): the tree is its root, `Node(v, [children])` (Java varargs, C
  `node(v, count, ...)`), a node named by its child indexes (`t.children[1].children[0]`, paths '1.0'); set, add (a
  last child: append / add / addChild), remove (`del t.children[1]`), swap (a node moved among its siblings), else
  the tree assigned anew (sketched again); in the board script a class of its own, TreeNode beside other nodes; 60
  random edit sequences run in python3 rebuild the tree drawn (`script.test.ts`).
